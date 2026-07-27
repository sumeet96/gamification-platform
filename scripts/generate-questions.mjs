#!/usr/bin/env node
// Generate multiple-choice questions from a book PDF with Gemini, and upsert them
// into the Neon `questions` table (apply db/schema.sql first).
//
// Usage:
//   node scripts/generate-questions.mjs <path-to.pdf> ["Source Name"] [perDifficulty]
//
// Reads GEMINI_API_KEY, DATABASE_URL (and optional GEMINI_MODEL) from .env.local or the shell.

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

// --- load .env.local (no dependency) ---
try {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* no .env.local — rely on shell env */ }

const pdfPath = process.argv[2]
const sourceName = process.argv[3] || (pdfPath ? pdfPath.split(/[\\/]/).pop() : 'source')
const perDifficulty = Number(process.argv[4] || 4)
const KEY = process.env.GEMINI_API_KEY
const DB = process.env.DATABASE_URL
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

if (!pdfPath) { console.error('Usage: node scripts/generate-questions.mjs <file.pdf> ["Source"] [perDifficulty]'); process.exit(1) }
if (!KEY) { console.error('Missing GEMINI_API_KEY (set it in .env.local).'); process.exit(1) }
if (!DB) { console.error('Missing DATABASE_URL (set it in .env.local).'); process.exit(1) }

// --- 1) extract text (import the lib path to avoid pdf-parse's debug-mode file read) ---
const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default
const { text } = await pdf(readFileSync(pdfPath))
const excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 12000)
console.log(`Read ${text.length} chars from ${pdfPath}; using the first ${excerpt.length}.`)

// --- 2) ask Gemini for JSON MCQs across difficulty levels ---
const prompt = `You are writing multiple-choice quiz questions from the study material below.
Produce exactly ${perDifficulty} questions for EACH difficulty level 1..5 (5 = hardest): ${perDifficulty * 5} total.
Return ONLY a JSON array (no prose). Each item:
{"difficulty": <1-5>, "prompt": "<question>", "options": ["a","b","c","d"], "answer": <index 0-3 of the correct option>}
Rules: exactly 4 options; exactly one correct; base every question on the material; vary which index is correct.

MATERIAL:
"""${excerpt}"""`

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
  }),
})
if (!res.ok) { console.error('Gemini error', res.status, await res.text()); process.exit(1) }
const data = await res.json()
const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
let items
try {
  items = JSON.parse(rawText)
} catch {
  const m = rawText.match(/\[[\s\S]*\]/)
  items = m ? JSON.parse(m[0]) : null
}
if (!Array.isArray(items) || items.length === 0) {
  console.error('Could not parse questions from the model output:\n', rawText.slice(0, 600))
  process.exit(1)
}

// --- 3) upsert into Neon ---
const sql = neon(DB)
const slug = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source'
let n = 0
for (let i = 0; i < items.length; i++) {
  const q = items[i]
  if (!Array.isArray(q?.options) || q.options.length !== 4 || typeof q.prompt !== 'string') continue
  const difficulty = Math.max(1, Math.min(5, Number(q.difficulty) || 1))
  const answer = Math.max(0, Math.min(3, Number(q.answer) || 0))
  const id = `${slug}-d${difficulty}-${i}`
  await sql`
    insert into questions (id, source, difficulty, prompt, options, answer)
    values (${id}, ${sourceName}, ${difficulty}, ${q.prompt}, ${JSON.stringify(q.options)}::jsonb, ${answer})
    on conflict (id) do update set
      source = excluded.source, difficulty = excluded.difficulty, prompt = excluded.prompt,
      options = excluded.options, answer = excluded.answer
  `
  n++
}
console.log(`Upserted ${n} questions into Neon (source: "${sourceName}"). The quiz will use them automatically.`)
