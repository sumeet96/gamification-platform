import { getSql } from '@/lib/db/client'
import { QUESTIONS, type Question } from '@/lib/game/questions'

// Returns the MCQ pool for the quiz. Reads `content_items` (the normalized content
// layer, db/003_add_content_items.sql) filtered to kind = 'mcq'; falls back to the
// built-in seed bank when the DB is unavailable or has no rows yet, so play always
// works.
//
// NEVER selects or returns `answer` -- the answer key must never reach the browser,
// not in the row and not in a debug field. Scoring happens server-side in
// app/api/answer/route.ts (package Q1); that route is the only place that reads
// content_items.answer.
//
// Scoped by subject via ?subject=. Unscoped when the param is absent -- there is
// currently exactly one subject in content_items, so "no filter" and "filter to
// that one subject" return the same rows; this avoids hardcoding today's one
// subject name into the route.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const subject = searchParams.get('subject')

  const sql = getSql()
  if (sql) {
    try {
      const rows = (subject
        ? await sql`
            select id, stem, options, difficulty, topic
            from content_items
            where kind = 'mcq' and subject = ${subject}
            order by random()
            limit 200
          `
        : await sql`
            select id, stem, options, difficulty, topic
            from content_items
            where kind = 'mcq'
            order by random()
            limit 200
          `) as Array<{
        id: string
        stem: string
        options: string[]
        difficulty: number | null
        topic: string | null
      }>
      if (rows.length > 0) {
        const questions: Question[] = rows.map((r) => ({
          id: r.id,
          // Whatever content_items has: 1-5 (calibrated) or null (uncalibrated).
          // Never invented, never clamped here -- see pickQuestion in
          // lib/game/questions.ts for how the adaptive lever handles a null.
          difficulty: r.difficulty as Question['difficulty'],
          stem: r.stem,
          options: r.options,
          topic: r.topic,
        }))
        return Response.json({ source: 'db', questions })
      }
    } catch (err) {
      // A failure here silently changes what content students receive (DB rows
      // vs. the 20-item seed bank), so it must be loud, not a bare `catch {}` --
      // that previously masked db/006 not being applied, transient Neon errors,
      // and a genuinely empty table all the same way (package Q1 rework).
      console.error('questions: content_items query failed, falling back to seed bank', err)
    }
  }
  return Response.json({ source: 'seed', questions: QUESTIONS })
}
