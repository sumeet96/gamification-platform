#!/usr/bin/env node
// Diagnostic for a source PDF before building any generation pipeline.
//
// Answers the one question that determines everything downstream: does this PDF
// contain extractable text, or is it scanned images? A scanned PDF returns
// (almost) nothing from pdf-parse, and scripts/generate-questions.mjs would
// silently produce zero questions with no error.
//
// Usage:
//   node scripts/inspect-pdf.mjs "path/to/book.pdf" [pagesToSample]
//
// If Node runs out of memory on a very large file:
//   node --max-old-space-size=4096 scripts/inspect-pdf.mjs "path/to/book.pdf"

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const file = process.argv[2]
const samplePages = Number(process.argv[3] ?? 30)

if (!file) {
  console.error('Usage: node scripts/inspect-pdf.mjs "path/to/book.pdf" [pagesToSample]')
  console.error('Tip: pass a folder instead and this will list the PDFs it finds.')
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.error(`Not found: ${file}`)
  console.error('If the path contains spaces, wrap it in quotes.')
  process.exit(1)
}

// A directory is a likely mistake, but a useful one — list what's inside so the
// user can pick the right file instead of hunting for the path by hand.
if (fs.statSync(file).isDirectory()) {
  const found = []
  const walk = (dir, depth = 0) => {
    if (depth > 2) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, depth + 1)
      else if (/\.pdf$/i.test(e.name)) {
        try { found.push({ full, size: fs.statSync(full).size }) } catch { /* skip */ }
      }
    }
  }
  walk(file)
  found.sort((a, b) => b.size - a.size)

  if (!found.length) {
    console.error(`\nNo PDFs found under: ${file}`)
    process.exit(1)
  }
  console.log(`\n${found.length} PDF(s) under ${file}, largest first:\n`)
  for (const f of found.slice(0, 25)) {
    console.log(`  ${(f.size / 1024 / 1024).toFixed(1).padStart(8)} MB   ${f.full}`)
  }
  console.log('\nRe-run against one of these, in quotes:')
  console.log(`  node scripts/inspect-pdf.mjs "${found[0].full}"\n`)
  process.exit(0)
}

const bytes = fs.statSync(file).size
const perPageText = []

// pdf-parse calls this per page; default renderer joins text items with no
// spacing logic, which is itself a signal — see the math notes below.
function pagerender(pageData) {
  return pageData.getTextContent().then((tc) => {
    const text = tc.items.map((i) => i.str).join(' ')
    perPageText.push(text)
    return text
  })
}

console.log(`\nReading ${path.basename(file)} (${(bytes / 1024 / 1024).toFixed(1)} MB)...`)
console.log(`Sampling the first ${samplePages} pages. This can take a minute on a large scan.\n`)

const data = await pdfParse(fs.readFileSync(file), { pagerender, max: samplePages })

const pages = perPageText.length
const totalChars = perPageText.reduce((n, t) => n + t.trim().length, 0)
const perPage = pages ? Math.round(totalChars / pages) : 0
const emptyPages = perPageText.filter((t) => t.trim().length < 50).length

console.log('='.repeat(64))
console.log(`Total pages in document : ${data.numpages}`)
console.log(`Pages sampled           : ${pages}`)
console.log(`Characters extracted    : ${totalChars.toLocaleString()}`)
console.log(`Characters per page     : ${perPage}`)
console.log(`Near-empty pages        : ${emptyPages} of ${pages}`)
console.log(`Bytes per page          : ${Math.round(bytes / (data.numpages || 1) / 1024)} KB`)
console.log('='.repeat(64))

// Quality checks. A dense text layer is NOT proof of a usable one: a scanned
// book with bad OCR yields thousands of characters per page that are quietly
// wrong. These heuristics catch that case, which pure character counting misses.
const all = perPageText.join(' ')
const spaceRatio = all.length ? (all.match(/ /g) ?? []).length / all.length : 0
const ocrTells = [
  /\bWehave\b|\b[A-Z][a-z]+[A-Z][a-z]+\b/, // run-together words: "Wehave"
  /zv/,                                    // 'w' misread as 'zv'
  /[A-Z]\/\s*:[A-Z]/,                      // "MATHEM/ :ICS"
  /\b[A-Za-z]+\d[A-Za-z]+\b/,              // digits fused into words
].filter((re) => re.test(all)).length
// Math flattening: '^' or '**' present while true superscripts are absent means
// exponents were emitted as ASCII fallback, i.e. the notation did not survive.
const caretNoSupers = /\^/.test(all) && !/[²³¹⁰⁴-⁹]/.test(all)
const lowQuality = ocrTells >= 2 || spaceRatio < 0.12 || caretNoSupers

// The verdict. ~200 chars/page is far below any real page of prose or worked
// examples; that means the page is an image and the text layer is absent.
if (perPage >= 200 && lowQuality) {
  console.log('\nVERDICT: TEXT LAYER PRESENT BUT UNRELIABLE — almost certainly OCR of a scan.')
  console.log(`  OCR tells matched: ${ocrTells}/4 | space ratio: ${spaceRatio.toFixed(3)}` +
              `${caretNoSupers ? ' | exponents flattened to ^' : ''}`)
  console.log('  Character count looks healthy, so a naive pipeline would think this')
  console.log('  worked. It did not. Read the sample — if symbols, braces or')
  console.log('  exponents are wrong there, every generated question inherits that.')
  console.log('  Use a multimodal model on the page images, or find a cleaner source.')
} else if (perPage < 200) {
  console.log('\nVERDICT: SCANNED (or no text layer).')
  console.log('  Text extraction will not work. You need OCR, or a multimodal model')
  console.log('  that reads page images directly. Do not point the existing')
  console.log('  generator at this file — it will produce nothing, silently.')
} else if (emptyPages > pages * 0.3) {
  console.log('\nVERDICT: MIXED — a significant share of pages have no text layer.')
  console.log('  Likely a text PDF with scanned inserts, or scanned pages with an')
  console.log('  OCR layer applied unevenly. Handle per page, not per document.')
} else {
  console.log('\nVERDICT: TEXT-BASED. Extraction is viable.')
  console.log('  Check the sample below for how the mathematics survived.')
}

// Math-specific signals. Extraction can "succeed" by character count while
// destroying every equation on the page, which is the failure that matters here.
const signals = {
  'Unicode math (√ ∫ ∑ ≤ ≥ ≠ ±)': /[√∫∑≤≥≠±×÷∞π]/.test(all),
  'Superscript digits (² ³)': /[²³¹⁰⁴-⁹]/.test(all),
  'Fraction slashes in context': /\d\s*\/\s*\d/.test(all),
  'LaTeX-ish sequences': /\\(frac|sqrt|int|sum|alpha|beta|theta)/.test(all),
}
console.log('\nMath notation signals in the extracted text:')
for (const [label, found] of Object.entries(signals)) {
  console.log(`  ${found ? 'present' : 'ABSENT '}  ${label}`)
}
console.log('\n  If Unicode math and superscripts are ABSENT but the book is full of')
console.log('  equations, the notation was flattened during extraction. Character')
console.log('  count alone will not tell you this — read the sample.')

// A page from the middle, where real content lives rather than front matter.
const mid = perPageText[Math.floor(pages / 2)] ?? ''
console.log(`\n${'-'.repeat(64)}`)
console.log(`SAMPLE — page ${Math.floor(pages / 2) + 1}, first 1200 characters:`)
console.log('-'.repeat(64))
console.log(mid.slice(0, 1200) || '(no text on this page)')
console.log('-'.repeat(64))
console.log('\nRead that sample carefully. If the equations are unreadable there,')
console.log('they will be unreadable to the question generator too.\n')
