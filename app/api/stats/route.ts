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
  //
  // `gross` is the sum of positive points_delta only (points earned before negative
  // marking is subtracted); `net` (unchanged) is gross minus penalties. `byGame` groups
  // question_answered rows by the `game_type` column added in db/004_add_event_metrics.sql
  // — rows written before that migration have game_type = null and are bucketed under
  // 'unknown' rather than dropped, so lifetime totals still reconcile.
  // Single round trip: one statement with CTEs (game_agg computed once, folded into the
  // final row as jsonb) rather than a second query per game, to avoid an N+1 over games.
  try {
    const rows = (await sql`
      with base as (
        select *
        from events
        where student_id = ${student.id}
      ),
      game_agg as (
        select
          coalesce(game_type, 'unknown') as game_id,
          count(*)::int as answered,
          count(*) filter (where is_correct)::int as correct,
          coalesce(sum(points_delta), 0)::int as net
        from base
        where event_type = 'question_answered'
        group by coalesce(game_type, 'unknown')
      )
      select
        coalesce(sum(points_delta) filter (where event_type = 'question_answered'), 0)::int as net,
        coalesce(sum(points_delta) filter (where event_type = 'question_answered' and points_delta > 0), 0)::int as gross,
        (count(*) filter (where event_type = 'question_answered') * ${POINTS_CORRECT}::int)::int as potential,
        count(*) filter (where event_type = 'question_answered')::int as answered,
        count(*) filter (where event_type = 'question_answered' and is_correct)::int as correct,
        count(*) filter (where event_type = 'question_answered' and is_correct = false)::int as wrong,
        count(distinct (session_id, round)) filter (where event_type = 'question_answered')::int as rounds_played,
        count(*) filter (where event_type = 'round_continue')::int as continues,
        count(distinct session_id)::int as sessions,
        (select max(created_at) from base where event_type = 'question_answered')::text as last_played_at,
        (select coalesce(jsonb_agg(game_agg), '[]'::jsonb) from game_agg) as by_game
      from base
    `) as Array<{
      net: number
      gross: number
      potential: number
      answered: number
      correct: number
      wrong: number
      rounds_played: number
      continues: number
      sessions: number
      last_played_at: string | null
      by_game: Array<{ game_id: string; answered: number; correct: number; net: number }>
    }>

    const row = rows[0] ?? {
      net: 0, gross: 0, potential: 0, answered: 0, correct: 0, wrong: 0, rounds_played: 0, continues: 0, sessions: 0,
      last_played_at: null, by_game: [],
    }
    const { last_played_at, by_game, ...rest } = row
    return Response.json({
      ok: true,
      ...rest,
      lastPlayedAt: last_played_at,
      byGame: by_game.map((g) => ({ gameId: g.game_id, answered: g.answered, correct: g.correct, net: g.net })),
    })
  } catch (err) {
    console.error('stats: lifetime aggregate query failed', err)
    return Response.json({ ok: false, error: 'failed to load stats' }, { status: 500 })
  }
}
