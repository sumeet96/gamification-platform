import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'

// GET /api/auth/me — the logged-in student's id and name only, never the hash.
export async function GET() {
  const current = await getCurrentStudent()
  if (!current) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const sql = getSql()
  if (!sql) return NextResponse.json({ ok: false, error: 'database not configured' }, { status: 500 })

  // The session cookie is valid (we have a student id) — anything past this point is a
  // *lookup* failure, not a sign-out. Callers must get a 500, never an uncaught error
  // that could be misread as "no session": the dashboard's logout control relies on
  // the 401/else distinction to know whether a session exists at all.
  let rows: Array<{ name: string | null }>
  try {
    rows = (await sql`
      select name from students where id = ${current.id}
    `) as Array<{ name: string | null }>
  } catch (err) {
    console.error('auth/me: name lookup failed', err)
    return NextResponse.json({ ok: false, error: 'lookup failed' }, { status: 500 })
  }

  if (!rows[0]) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 })
  return NextResponse.json({ ok: true, id: current.id, name: rows[0].name })
}
