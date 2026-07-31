#!/usr/bin/env node
// Produce per-page source text for a slide PDF, so a text-only model can be given the
// material a question came from.
//
// Why this exists: `Pitch_Session 12.pdf` extracts 0 characters on 12 of its 26 pages —
// the example-deck slides are images. The text layer alone cannot ground a simulated
// student. Gemini reads the PDF natively (pages as images), so one call recovers them.
//
// Usage:
//   node scripts/extract-slide-text.mjs <deck.pdf> <out.json>
//
// Output: [{ page, kind, title, text, text_layer }]  — `kind` is "template" | "example" | "other".
// Example pages are additionally numbered 1..N in document order as `example_slide`, which is
// how a generator working from the embedded deck refers to them.

import { readFileSync, writeFileSync } from 'node:fs'

try {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* rely on shell env */ }

const pdfPath = process.argv[2]
const outPath = process.argv[3]
const KEY = process.env.GEMINI_API_KEY
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
if (!pdfPath || !outPath) { console.error('Usage: node scripts/extract-slide-text.mjs <deck.pdf> <out.json>'); process.exit(1) }
if (!KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1) }

// --- text layer, per page (what pdf-parse can already see) ---
const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default
const layer = []
await pdf(readFileSync(pdfPath), {
  pagerender: async (p) => {
    const tc = await p.getTextContent()
    const t = tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
    layer.push(t)
    return t
  },
})
console.log(`Text layer: ${layer.length} pages, ${layer.filter((t) => t.length === 0).length} empty.`)

// --- vision pass over the whole PDF ---
const schema = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    propertyOrdering: ['page', 'kind', 'title', 'text'],
    required: ['page', 'kind', 'title', 'text'],
    properties: {
      page: { type: 'INTEGER' },
      kind: { type: 'STRING', enum: ['template', 'example', 'other'] },
      title: { type: 'STRING' },
      text: { type: 'STRING' },
    },
  },
}

const prompt = `Transcribe this ${layer.length}-page slide deck, one object per page, pages numbered from 1.

For each page:
- "text": every word visible on the slide, verbatim, including text inside images, charts, tables and
  screenshots. Preserve numbers and figures exactly. Use newlines between bullets. If the page is
  blank, use an empty string. Do NOT summarise, do NOT add commentary, do NOT invent content.
- "title": the slide's heading, or "" if it has none.
- "kind": "template" if the page states generic pitch-deck advice or a template section;
  "example" if the page is a slide from the worked example company's own deck;
  "other" for title, divider, blank and thank-you pages.

Return every page, in order, including blank ones.`

const body = {
  contents: [{
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: readFileSync(pdfPath).toString('base64') } },
      { text: prompt },
    ],
  }],
  generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
}

console.log(`Sending ${pdfPath} to ${MODEL}...`)
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
if (!res.ok) { console.error('Gemini error', res.status, (await res.text()).slice(0, 800)); process.exit(1) }
const data = await res.json()
const usage = data?.usageMetadata
const pages = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]')
if (!Array.isArray(pages) || pages.length === 0) { console.error('No pages returned.'); process.exit(1) }

// --- merge, and number the example slides in document order ---
let exampleN = 0
const out = pages.map((p, i) => {
  const page = Number(p.page) || i + 1
  const row = {
    page,
    kind: p.kind ?? 'other',
    title: (p.title ?? '').trim(),
    text: (p.text ?? '').trim(),
    text_layer: layer[page - 1] ?? '',
  }
  if (row.kind === 'example') row.example_slide = ++exampleN
  return row
})

writeFileSync(outPath, JSON.stringify(out, null, 2))
const recovered = out.filter((r) => !r.text_layer && r.text).length
console.log(`Wrote ${out.length} pages to ${outPath}.`)
console.log(`  example slides: ${exampleN}`)
console.log(`  pages recovered that had no text layer: ${recovered}`)
console.log(`  tokens: in ${usage?.promptTokenCount ?? '?'}, out ${usage?.candidatesTokenCount ?? '?'}`)
