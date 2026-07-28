import { NextResponse } from 'next/server'
import { NeonDbError } from '@neondatabase/serverless'
import { getSql } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { generateStudentId, signSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/session'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/auth/signup — creates a student row, hashes the password, and signs them
// in. Requires explicit research consent (consented_at is only ever set here, to now).
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = (typeof body.email === 'string' ? body.email.trim() : '').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const phone = typeof body.phone === 'string' && body.phone ? body.phone : null
  const dob = typeof body.dob === 'string' && body.dob ? body.dob : null
  const gender = typeof body.gender === 'string' && body.gender ? body.gender : null
  const education = typeof body.education === 'string' && body.education ? body.education : null
  const learningGoals = typeof body.learningGoals === 'string' && body.learningGoals ? body.learningGoals : null
  const consent = body.consent === true

  if (!name || !EMAIL_RE.test(email) || password.length < 8 || !consent) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Provide a name, a valid email, a password of at least 8 characters, and confirm the research consent.',
      },
      { status: 400 }
    )
  }

  const sql = getSql()
  if (!sql) return NextResponse.json({ ok: false, error: 'database not configured' }, { status: 500 })

  const id = generateStudentId()
  const passwordHash = await hashPassword(password)

  try {
    await sql`
      insert into students
        (id, email, password_hash, name, phone, gender, education, learning_goals, dob, consented_at)
      values
        (${id}, ${email}, ${passwordHash}, ${name}, ${phone}, ${gender}, ${education}, ${learningGoals}, ${dob}, now())
    `
  } catch (err) {
    if (err instanceof NeonDbError && err.code === '23505') {
      return NextResponse.json({ ok: false, error: 'An account with that email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'signup failed' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true, id })
  res.cookies.set(SESSION_COOKIE, signSession(id), sessionCookieOptions())
  return res
}
