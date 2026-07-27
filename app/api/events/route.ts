import { getSql } from '@/lib/db/client'

// POST an interaction event. Writes to Neon when DATABASE_URL is set; otherwise
// accepts and no-ops (the client still logs to the console in dev).
export async function POST(req: Request) {
  let e: Record<string, unknown>
  try {
    e = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const sql = getSql()
  if (!sql) return Response.json({ ok: true, stored: false })

  try {
    await sql`
      insert into events
        (session_id, event_type, game_type, mode, lever, round, question_id,
         difficulty_level, time_limit, time_taken_ms, is_correct, points_delta,
         negative_applied, net_after)
      values
        (${e.session_id}, ${e.event_type}, ${e.game_type ?? null}, ${e.mode ?? null},
         ${e.lever ?? null}, ${e.round ?? null}, ${e.question_id ?? null},
         ${e.difficulty_level ?? null}, ${e.time_limit ?? null}, ${e.time_taken_ms ?? null},
         ${e.is_correct ?? null}, ${e.points_delta ?? null}, ${e.negative_applied ?? null},
         ${e.net_after ?? null})
    `
    return Response.json({ ok: true, stored: true })
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
