import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db/client'
import { verifyPassword } from '@/lib/auth/password'
import { signSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/session'

const INVALID = 'Invalid email or password.'
// Compared against when the email doesn't exist, so a missing account takes the same
// scrypt cost as a wrong password instead of returning early and leaking timing.
const DUMMY_HASH = '0'.repeat(32) + ':' + '0'.repeat(128)

// POST /api/auth/login — verifies credentials and signs in. Unknown email and wrong
// password return the identical generic message, so responses never reveal which one it was.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const email = (typeof body.email === 'string' ? body.email.trim() : '').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: INVALID }, { status: 401 })
  }

  const sql = getSql()
  if (!sql) return NextResponse.json({ ok: false, error: 'database not configured' }, { status: 500 })

  const rows = (await sql`
    select id, password_hash from students where email = ${email}
  `) as Array<{ id: string; password_hash: string | null }>

  const student = rows[0]
  const valid = await verifyPassword(password, student?.password_hash ?? DUMMY_HASH)
  if (!student || !valid) {
    return NextResponse.json({ ok: false, error: INVALID }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, id: student.id })
  res.cookies.set(SESSION_COOKIE, signSession(student.id), sessionCookieOptions())
  return res
}
