import { getSql } from '@/lib/db/client'
import { QUESTIONS, type Question } from '@/lib/game/questions'

// Returns the question pool for the game. Uses AI-generated questions from Neon
// (the `questions` table, populated by scripts/generate-questions.mjs) when
// available; otherwise falls back to the built-in seed bank so play always works.
export async function GET() {
  const sql = getSql()
  if (sql) {
    try {
      const rows = (await sql`
        select id, difficulty, prompt, options, answer from questions
      `) as Array<{ id: string; difficulty: number; prompt: string; options: string[]; answer: number }>
      if (rows.length > 0) {
        const questions: Question[] = rows.map((r) => ({
          id: r.id,
          difficulty: Math.max(1, Math.min(5, r.difficulty)) as Question['difficulty'],
          prompt: r.prompt,
          options: r.options,
          answer: r.answer,
        }))
        return Response.json({ source: 'db', questions })
      }
    } catch {
      /* fall through to seed */
    }
  }
  return Response.json({ source: 'seed', questions: QUESTIONS })
}
