import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { POINTS_CORRECT } from '@/lib/game/engine'

// GET /api/stats — lifetime totals for the signed-in student, read straight from the
// events table. This is what makes the dashboard survive logout/login: session.ts state
// lives in sessionStorage and is wiped on every identity transition, but every event this
// student ever produced is already sitting in the DB. student_id is never accepted from
// the query string or body — identity comes from the session cookie only, exactly as in
// app/api/events/route.ts.
export async function GET() {
  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const sql = getSql()
  if (!sql) return Response.json({ ok: false, error: 'database not configured' }, { status: 500 })

  // NOTE: `potential` assumes a single flat scoring rule (POINTS_CORRECT for every
  // correct answer, everywhere). It is only correct while that holds — once per-student
  // variable rewards ship, a per-row scoring marker will be needed and this will misreport.
  try {
    const rows = (await sql`
      select
        coalesce(sum(points_delta) filter (where event_type = 'question_answered'), 0)::int as net,
        (count(*) filter (where event_type = 'question_answered') * ${POINTS_CORRECT}::int)::int as potential,
        count(*) filter (where event_type = 'question_answered')::int as answered,
        count(*) filter (where event_type = 'question_answered' and is_correct)::int as correct,
        count(*) filter (where event_type = 'question_answered' and is_correct = false)::int as wrong,
        count(distinct (session_id, round)) filter (where event_type = 'question_answered')::int as rounds_played,
        count(*) filter (where event_type = 'round_continue')::int as continues,
        count(distinct session_id)::int as sessions
      from events
      where student_id = ${student.id}
    `) as Array<{
      net: number
      potential: number
      answered: number
      correct: number
      wrong: number
      rounds_played: number
      continues: number
      sessions: number
    }>

    const row = rows[0] ?? {
      net: 0, potential: 0, answered: 0, correct: 0, wrong: 0, rounds_played: 0, continues: 0, sessions: 0,
    }
    return Response.json({ ok: true, ...row })
  } catch (err) {
    console.error('stats: lifetime aggregate query failed', err)
    return Response.json({ ok: false, error: 'failed to load stats' }, { status: 500 })
  }
}
