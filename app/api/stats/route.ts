import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { potentialForGame } from '@/lib/games/potential'

// GET /api/stats — lifetime totals for the signed-in student, read straight from the
// events table. This is what makes the dashboard survive logout/login: session.ts state
// lives in sessionStorage and is wiped on every identity transition, but every event this
// student ever produced is already sitting in the DB. student_id is never accepted from
// the query string or body — identity comes from the session cookie only, exactly as in
// app/api/events/route.ts.
//
// potentialForGame lives in lib/games/potential.ts (moved out of this file so it's
// importable under `node --test` without dragging in getCurrentStudent's next/headers
// dependency) -- see that file for the per-points-shape formula.

export async function GET() {
  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const sql = getSql()
  if (!sql) return Response.json({ ok: false, error: 'database not configured' }, { status: 500 })

  // `gross` is the sum of positive points_delta only (points earned before negative
  // marking is subtracted); `net` (unchanged) is gross minus penalties. `byGame` groups
  // rows by the `game_type` column added in db/004_add_event_metrics.sql — rows written
  // before that migration have game_type = null and are bucketed under 'unknown' rather
  // than dropped, so lifetime totals still reconcile.
  //
  // Package A1 (match) split a board's payout across two row types: a `question_answered`
  // row per pair carrying only the per-pair accrual, and one `board_complete` row per
  // board carrying `bonus + floor`. Both are real, non-overlapping parts of the same
  // board's payout (see app/api/match/submit/route.ts), so `net`/`gross`/`by_game.net`
  // now sum points_delta over BOTH event types -- dropping board_complete was undercounting
  // every match board by its bonus/floor. `answered`/`correct`/`wrong` deliberately stay
  // scoped to `question_answered` only: a board_complete row is a payout receipt, not an
  // answered item, and counting it here would inflate "items answered" for match.
  //
  // `potential` is computed in TypeScript (see potentialForGame above), not SQL, because
  // it needs the registry's per-game points shape, not a single flat constant.
  //
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
          count(*) filter (where event_type = 'question_answered')::int as answered,
          count(*) filter (where event_type = 'question_answered' and is_correct)::int as correct,
          count(*) filter (where event_type = 'board_complete')::int as boards,
          coalesce(
            sum(points_delta) filter (where event_type in ('question_answered', 'board_complete')),
            0
          )::int as net
        from base
        where event_type in ('question_answered', 'board_complete')
        group by coalesce(game_type, 'unknown')
      )
      select
        coalesce(sum(points_delta) filter (where event_type in ('question_answered', 'board_complete')), 0)::int as net,
        coalesce(
          sum(points_delta) filter (where event_type in ('question_answered', 'board_complete') and points_delta > 0),
          0
        )::int as gross,
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
      answered: number
      correct: number
      wrong: number
      rounds_played: number
      continues: number
      sessions: number
      last_played_at: string | null
      by_game: Array<{ game_id: string; answered: number; correct: number; boards: number; net: number }>
    }>

    const row = rows[0] ?? {
      net: 0, gross: 0, answered: 0, correct: 0, wrong: 0, rounds_played: 0, continues: 0, sessions: 0,
      last_played_at: null, by_game: [],
    }
    const { last_played_at, by_game, ...rest } = row
    const potential = by_game.reduce((sum, g) => sum + potentialForGame(g.game_id, g.answered, g.boards), 0)
    return Response.json({
      ok: true,
      ...rest,
      potential,
      lastPlayedAt: last_played_at,
      byGame: by_game.map((g) => ({ gameId: g.game_id, answered: g.answered, correct: g.correct, net: g.net })),
    })
  } catch (err) {
    console.error('stats: lifetime aggregate query failed', err)
    return Response.json({ ok: false, error: 'failed to load stats' }, { status: 500 })
  }
}
