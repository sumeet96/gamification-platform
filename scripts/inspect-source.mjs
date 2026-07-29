#!/usr/bin/env node
// Diagnostic for a source document before it enters the question-generation
// pipeline: can this document be used as a question source, and via which
// route — TEXT PATH (extract clean text and generate from that) or IMAGE
// PATH (render the document to PDF and let a multimodal model read it
// visually)? Only a document that neither route can recover from —
// corrupt/unreadable, zero pages or slides, genuinely empty — is unusable.
//
// Usage:
//   node scripts/inspect-source.mjs "path/to/file.pdf|docx|pptx" [pagesToSample]
//   node scripts/inspect-source.mjs "path/to/course-material/"
//
// If Node runs out of memory on a very large PDF:
//   node --max-old-space-size=4096 scripts/inspect-source.mjs "path/to/book.pdf"
//
// Exit codes (both single-file and folder mode) — a wrapper must be able to
// tell a usable source from an unusable one without parsing stdout:
//   0 — every document inspected is usable: TEXT PATH or IMAGE PATH.
//   2 — at least one source is UNUSABLE by either route (corrupt/unreadable
//       archive, zero pages/slides, genuinely empty document — see the
//       verdict for why). Should be rare.
//   1 — operational failure: bad/missing arguments, unreadable file,
//       unsupported extension, or a folder with no PDF/DOCX/PPTX under it.
//
// Zero new dependencies: DOCX/PPTX are ZIP archives of XML, read with a
// minimal ZIP reader built on node:zlib (inflateRawSync) + node:fs.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const file = process.argv[2]
const samplePages = Number(process.argv[3] ?? 30)

if (!file) {
  console.error('Usage: node scripts/inspect-source.mjs "path/to/file.pdf|docx|pptx" [pagesToSample]')
  console.error('Tip: pass a folder instead and this will walk it for course material.')
  console.error('Exit codes: 0 = every document routes somewhere (TEXT PATH or IMAGE PATH),')
  console.error('            2 = at least one is UNUSABLE, 1 = operational failure (this).')
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.error(`Not found: ${file}`)
  console.error('If the path contains spaces, wrap it in quotes.')
  process.exit(1)
}

// ============================================================================
// Minimal ZIP reader (node:zlib + node:fs only) — DOCX/PPTX are ZIP archives.
// Reads the end-of-central-directory record, walks the central directory,
// and inflates only the entries the caller asks for. Handles stored (method
// 0) and deflated (method 8) entries. Encrypted archives are reported as
// unreadable rather than attempted.
// ============================================================================

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

class UnreadableZipError extends Error {}

function openZip(filePath) {
  const buf = fs.readFileSync(filePath)

  // Find End Of Central Directory record — scan back from EOF (comment field
  // makes its offset variable, so we can't assume a fixed position).
  const maxCommentLen = 65535
  const searchStart = Math.max(0, buf.length - 22 - maxCommentLen)
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break }
  }
  if (eocdOffset === -1) throw new UnreadableZipError('No end-of-central-directory record found (not a valid ZIP).')

  const entryCount = buf.readUInt16LE(eocdOffset + 10)
  const cenSize = buf.readUInt32LE(eocdOffset + 12)
  const cenOffset = buf.readUInt32LE(eocdOffset + 16)

  const entries = new Map() // name -> { compMethod, compSize, uncompSize, localHeaderOffset, flags }
  let p = cenOffset
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new UnreadableZipError('Central directory is malformed or archive is encrypted.')
    const flags = buf.readUInt16LE(p + 8)
    const compMethod = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const uncompSize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localHeaderOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.set(name, { compMethod, compSize, uncompSize, localHeaderOffset, flags })
    p += 46 + nameLen + extraLen + commentLen
  }
  void cenSize

  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name)
      if (!e) return null
      if (e.flags & 0x1) throw new UnreadableZipError(`Entry "${name}" is encrypted; cannot read.`)
      const lp = e.localHeaderOffset
      if (buf.readUInt32LE(lp) !== LOC_SIG) throw new UnreadableZipError(`Local header for "${name}" is malformed.`)
      const nameLen = buf.readUInt16LE(lp + 26)
      const extraLen = buf.readUInt16LE(lp + 28)
      const dataStart = lp + 30 + nameLen + extraLen
      const data = buf.subarray(dataStart, dataStart + e.compSize)
      if (e.compMethod === 0) return Buffer.from(data)
      if (e.compMethod === 8) return zlib.inflateRawSync(data)
      throw new UnreadableZipError(`Entry "${name}" uses unsupported compression method ${e.compMethod}.`)
    },
  }
}

// Strip XML tags to plain text, collapsing runs of whitespace. Good enough
// for character counts and prose sampling — this is a diagnostic, not a
// faithful renderer.
function xmlToText(xml) {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// 15 chars screens out PowerPoint's auto-updating slide-number field text
// (<a:fld type="slidenum">) without discarding a genuine terse note.
// Declared at module scope, not inside inspectPptx: single-file mode invokes
// the inspector during top-to-bottom module evaluation, before a `const`
// declared later in the file would be initialized.
const PPTX_MIN_NOTE_CHARS = 15

// Absolute floor on total extractable characters (on-slide text + resolved
// speaker notes) across a PPTX deck, mirroring DOCX's 200-char floor.
const PPTX_MIN_TOTAL_CHARS = 200

// ============================================================================
// Format detection + folder walk
// ============================================================================

const FORMATS = { '.pdf': 'PDF', '.docx': 'DOCX', '.pptx': 'PPTX' }

function isDirectory(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

if (isDirectory(file)) {
  const found = []
  const walk = (dir, depth = 0) => {
    if (depth > 6) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { walk(full, depth + 1); continue }
      const ext = path.extname(e.name).toLowerCase()
      if (FORMATS[ext]) {
        try { found.push({ full, size: fs.statSync(full).size, format: FORMATS[ext] }) } catch { /* skip */ }
      }
      // Unknown extensions are skipped, not errors — no action needed.
    }
  }
  walk(file)

  if (!found.length) {
    console.error(`\nNo PDF/DOCX/PPTX found under: ${file}`)
    process.exit(1)
  }
  found.sort((a, b) => b.size - a.size)

  console.log(`\n${found.length} course document(s) under ${file}:\n`)
  const rows = []
  const failing = []
  for (const f of found) {
    const row = await inspectQuiet(f.full, f.format, samplePages)
    // Passing rows never call .detail() again — drop the closure now so the
    // large parsed state it captured (full document.xml/slide text, etc.) is
    // eligible for GC instead of sitting in `rows` for the rest of the walk.
    // Failing rows keep theirs; the report below needs it.
    if (row.status === 'OK') row.detail = null
    rows.push(row)
    if (row.status !== 'OK') failing.push(row)
  }

  const nameW = Math.min(50, Math.max(...rows.map((r) => r.name.length), 8))
  console.log(
    'FILE'.padEnd(nameW) + '  ' + 'FORMAT'.padEnd(6) + '  ' + 'SIZE'.padStart(9) +
    '  ' + 'KEY METRIC'.padEnd(28) + '  ROUTE'
  )
  console.log('-'.repeat(nameW + 6 + 9 + 28 + 40))
  for (const r of rows) {
    console.log(
      r.name.slice(0, nameW).padEnd(nameW) + '  ' + r.format.padEnd(6) + '  ' +
      `${(r.size / 1024 / 1024).toFixed(1)} MB`.padStart(9) + '  ' +
      r.keyMetric.padEnd(28) + '  ' + r.statusLabel
    )
  }

  // Route breakdown — the genuinely useful summary for a folder of course
  // material: how much of it is clean text, how much needs the multimodal
  // read, and how much (ideally none) is unusable by either route.
  const routeCounts = { 'TEXT PATH': 0, 'IMAGE PATH': 0, 'UNUSABLE': 0 }
  for (const r of rows) routeCounts[r.statusLabel] = (routeCounts[r.statusLabel] ?? 0) + 1
  console.log(
    `\nRoute breakdown: ${routeCounts['TEXT PATH']} text path, ` +
    `${routeCounts['IMAGE PATH']} image path, ${routeCounts['UNUSABLE']} unusable`
  )

  if (failing.length) {
    console.log(`\n${'='.repeat(72)}`)
    console.log(`${failing.length} file(s) are UNUSABLE — detailed report below.`)
    console.log('='.repeat(72))
    for (const r of failing) {
      console.log(`\n\n########  ${r.name}  ########`)
      r.detail()
    }
  } else {
    console.log('\nEvery file routes somewhere. No detailed reports needed.')
  }
  // Exit 2 when at least one source is UNUSABLE so a wrapper can gate on
  // this without parsing the table — see the exit-code header comment.
  process.exit(failing.length ? 2 : 0)
}

// Single file mode.
const ext = path.extname(file).toLowerCase()
const format = FORMATS[ext]
if (!format) {
  console.error(`\nUnrecognized extension "${ext}". This diagnostic handles .pdf, .docx, .pptx.`)
  process.exit(1)
}
const row = await inspectQuiet(file, format, samplePages, { verbose: true })
console.log(`\nVERDICT SUMMARY: ${row.statusLabel} — ${row.keyMetric}`)
// Exit 2 when this source is UNUSABLE so a wrapper can gate on it without
// parsing stdout — see the exit-code header comment.
process.exit(row.status === 'OK' ? 0 : 2)

// ============================================================================
// Per-format inspectors. Each returns a row for the table AND can print full
// detail (via .detail()) for single-file mode or the failing-files section.
// ============================================================================

async function inspectQuiet(filePath, format, samplePages, opts = {}) {
  const name = path.basename(filePath)
  const size = fs.statSync(filePath).size
  try {
    if (format === 'PDF') return await inspectPdf(filePath, name, size, samplePages, opts)
    if (format === 'DOCX') return inspectDocx(filePath, name, size, opts)
    if (format === 'PPTX') return inspectPptx(filePath, name, size, opts)
  } catch (err) {
    const isZipErr = err instanceof UnreadableZipError
    return {
      name, format, size, status: 'FAIL', statusLabel: 'UNUSABLE',
      keyMetric: isZipErr ? 'encrypted/corrupt archive' : String(err.message).slice(0, 40),
      detail: () => {
        console.log(`\nVERDICT: UNUSABLE — ${err.message}`)
        if (isZipErr) {
          console.log('  Cannot open this as a ZIP archive. If it is password-protected, remove')
          console.log('  the password first; this diagnostic does not attempt encrypted archives.')
          console.log('  Neither route has anything to work with — there is no readable document')
          console.log('  underneath, text or image.')
        } else {
          console.log('  Unexpected error while parsing, or the document has no readable pages or')
          console.log('  slides at all. Inspect the file by hand; neither route can help here.')
        }
      },
    }
  }
}

// ---- PDF -------------------------------------------------------------------
// Preserved verbatim from inspect-pdf.mjs: per-page char counts, near-empty
// page count, bytes/page, the three-way verdict (including the OCR-of-a-scan
// detector), math-notation signals, and a mid-document sample.
// pdf-parse is promise-based, so this (and the dispatcher above it) is async;
// folder mode awaits each file in turn rather than running them concurrently,
// which caps how many parses are in flight at once. That alone does not
// bound total memory for a big folder, though — see the `row.detail = null`
// note where folder mode consumes these rows for the fix that does.

async function inspectPdf(filePath, name, bytes, samplePages, opts) {
  const pdfParse = require('pdf-parse')
  const perPageText = []

  function pagerender(pageData) {
    return pageData.getTextContent().then((tc) => {
      const text = tc.items.map((i) => i.str).join(' ')
      perPageText.push(text)
      return text
    })
  }

  if (opts.verbose) {
    console.log(`\nReading ${name} (${(bytes / 1024 / 1024).toFixed(1)} MB)...`)
    console.log(`Sampling the first ${samplePages} pages. This can take a minute on a large scan.\n`)
  }

  const data = await pdfParse(fs.readFileSync(filePath), { pagerender, max: samplePages })

  const pages = perPageText.length
  const totalChars = perPageText.reduce((n, t) => n + t.trim().length, 0)
  const perPage = pages ? Math.round(totalChars / pages) : 0
  const emptyPages = perPageText.filter((t) => t.trim().length < 50).length
  const bytesPerPage = Math.round(bytes / (data.numpages || 1) / 1024)

  const all = perPageText.join(' ')
  const spaceRatio = all.length ? (all.match(/ /g) ?? []).length / all.length : 0
  const caretNoSupers = /\^/.test(all) && !/[²³¹⁰⁴-⁹]/.test(all)
  const lowQuality = spaceRatio < 0.12 || caretNoSupers

  let status, statusLabel, verdictLines = [], imageReason = null
  if (pages === 0) {
    status = 'FAIL'; statusLabel = 'UNUSABLE'
    verdictLines.push('VERDICT: UNUSABLE — no pages could be read from this PDF.')
    verdictLines.push('  Neither text extraction nor a visual read has anything to work with.')
  } else if (perPage >= 200 && lowQuality) {
    imageReason = `text layer present but unreliable, almost certainly OCR of a scan ` +
      `(space ratio: ${spaceRatio.toFixed(3)}${caretNoSupers ? ', exponents flattened to ^' : ''}).`
  } else if (perPage < 200) {
    imageReason = 'scanned, or no reliable text layer.'
  } else if (emptyPages > pages * 0.3) {
    imageReason = 'mixed text layer — a significant share of pages have none.'
  } else {
    status = 'OK'; statusLabel = 'TEXT PATH'
    verdictLines.push('VERDICT: TEXT PATH. Extraction is viable.')
  }

  if (imageReason) {
    status = 'OK'; statusLabel = 'IMAGE PATH'
    verdictLines.push(`VERDICT: IMAGE PATH — ${imageReason}`)
    verdictLines.push('  Text extraction is not reliable here, but the page images are intact.')
    verdictLines.push('  Route this to a multimodal model that reads the pages directly rather')
    verdictLines.push('  than pointing the text-based generator at it.')
  }

  const mid = perPageText[Math.floor(pages / 2)] ?? ''
  const midPageNum = Math.floor(pages / 2) + 1

  const printFull = () => {
    console.log('='.repeat(64))
    console.log(`Total pages in document : ${data.numpages}`)
    console.log(`Pages sampled           : ${pages}`)
    console.log(`Characters extracted    : ${totalChars.toLocaleString()}`)
    console.log(`Characters per page     : ${perPage}`)
    console.log(`Near-empty pages        : ${emptyPages} of ${pages}`)
    console.log(`Bytes per page          : ${bytesPerPage} KB`)
    console.log('='.repeat(64))
    console.log('\n' + verdictLines.join('\n'))
    console.log(`\n${'-'.repeat(64)}`)
    console.log(`SAMPLE — page ${midPageNum}, first 1200 characters:`)
    console.log('-'.repeat(64))
    console.log(mid.slice(0, 1200) || '(no text on this page)')
    console.log('-'.repeat(64) + '\n')
  }

  if (opts.verbose) printFull()

  return {
    name, format: 'PDF', size: bytes, status, statusLabel,
    keyMetric: `${perPage} chars/page, ${emptyPages}/${pages} empty`,
    detail: printFull,
  }
}

// ---- DOCX -------------------------------------------------------------------
// word/document.xml carries the whole body. Routing decision is extractable
// character count alone (mirrors PPTX's floor): low/no extractable text does
// not mean the document is empty — it may be mostly tables, images, or
// embedded objects, which route to IMAGE PATH the same as a picture-heavy
// PPTX deck.

function inspectDocx(filePath, name, size, opts) {
  const zip = openZip(filePath)
  const docXmlBuf = zip.read('word/document.xml')
  if (!docXmlBuf) throw new Error('word/document.xml not found — not a valid DOCX.')
  const xml = docXmlBuf.toString('utf8')
  const text = xmlToText(xml)
  const totalChars = text.length

  let status, statusLabel
  if (totalChars > 200) {
    status = 'OK'; statusLabel = 'TEXT PATH'
  } else {
    status = 'OK'; statusLabel = 'IMAGE PATH'
  }

  const printFull = () => {
    console.log('='.repeat(64))
    console.log(`Total extractable characters : ${totalChars.toLocaleString()}`)
    console.log('='.repeat(64))

    if (statusLabel === 'TEXT PATH') {
      console.log('\nVERDICT: TEXT PATH. Extraction is viable.')
    } else {
      console.log('\nVERDICT: IMAGE PATH — little extractable prose in the XML.')
      console.log('  If this document is mostly tables, images, or embedded objects, that')
      console.log('  content is not lost: render it to PDF and read it visually rather than')
      console.log('  relying on text extraction.')
    }

    console.log(`\n${'-'.repeat(64)}`)
    console.log('SAMPLE — first 1200 characters:')
    console.log('-'.repeat(64))
    console.log(text.slice(0, 1200) || '(no text found)')
    console.log('-'.repeat(64) + '\n')
  }

  if (opts.verbose) printFull()

  return {
    name, format: 'DOCX', size, status, statusLabel,
    keyMetric: `${totalChars.toLocaleString()} chars`,
    detail: printFull,
  }
}

// ---- PPTX -------------------------------------------------------------------
// ppt/slides/slideN.xml holds slide text. Speaker notes are NOT
// ppt/notesSlides/notesSlideN.xml for the same N — that index match is a
// coincidence, not a rule. The real mapping lives in the slide's own
// relationships part, ppt/slides/_rels/slideN.xml.rels: whichever
// Relationship's Type ends in "/notesSlide" gives the true target. Confirmed
// by hand on a real deck (Pitch_Session 12.pptx): slide2.xml.rels targets
// notesSlide1.xml, slide4.xml.rels targets notesSlide2.xml — assuming N->N
// silently attributes notes to the wrong slide.

// Extract <a:t> run text from a slide/notesSlide XML fragment, skipping runs
// that sit inside <a:fld> — PowerPoint's auto-updating fields (slide number,
// date, footer). That text is rendered metadata, not authored content;
// counting it is how an all-but-empty notesSlide or slide reads as having
// real content.
function extractPptxRunText(xml) {
  const withoutFields = xml.replace(/<a:fld\b[^>]*>[\s\S]*?<\/a:fld>/g, ' ')
  return (withoutFields.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
    .map((m) => xmlToText(m))
    .join(' ')
    .trim()
}

// Resolve the notesSlide part that actually belongs to a slide entry via its
// _rels file, rather than assuming matching N. Returns null when the slide
// has no _rels entry or no notesSlide relationship — both legitimate (not
// every slide has speaker notes); never throws on the missing case.
function resolveNotesEntry(zip, slideEntryName) {
  const slideDir = path.posix.dirname(slideEntryName)
  const slideBase = path.posix.basename(slideEntryName)
  const relsEntry = `${slideDir}/_rels/${slideBase}.rels`
  if (!zip.names.includes(relsEntry)) return null
  const relsXml = zip.read(relsEntry).toString('utf8')
  const rels = relsXml.match(/<Relationship\b[^>]*\/?>/g) ?? []
  for (const rel of rels) {
    const type = rel.match(/Type="([^"]+)"/)?.[1]
    const target = rel.match(/Target="([^"]+)"/)?.[1]
    if (!type || !target || !type.endsWith('/notesSlide')) continue
    const resolved = target.startsWith('/')
      ? target.slice(1)
      : path.posix.normalize(path.posix.join(slideDir, target))
    return zip.names.includes(resolved) ? resolved : null
  }
  return null
}

function inspectPptx(filePath, name, size, opts) {
  const zip = openZip(filePath)

  const slideEntries = zip.names
    .filter((n) => /^ppt\/slides\/slide(\d+)\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)[1])
      const nb = Number(b.match(/slide(\d+)\.xml$/)[1])
      return na - nb
    })

  if (!slideEntries.length) throw new Error('No ppt/slides/slideN.xml entries found — not a valid PPTX.')

  const slides = slideEntries.map((entry) => {
    const n = Number(entry.match(/slide(\d+)\.xml$/)[1])
    const xml = zip.read(entry).toString('utf8')
    const text = extractPptxRunText(xml)

    const notesEntry = resolveNotesEntry(zip, entry)
    const notesText = notesEntry ? extractPptxRunText(zip.read(notesEntry).toString('utf8')) : ''
    return { n, text, notesText, hasNotes: notesText.length >= PPTX_MIN_NOTE_CHARS }
  })

  const slideCount = slides.length
  const slidesWithNotes = slides.filter((s) => s.hasNotes).length
  const meanNotesLen = slidesWithNotes
    ? Math.round(slides.filter((s) => s.hasNotes).reduce((n, s) => n + s.notesText.length, 0) / slidesWithNotes)
    : 0
  const meanSlideChars = Math.round(slides.reduce((n, s) => n + s.text.length, 0) / slideCount)
  const nearEmptySlides = slides.filter((s) => s.text.length < 40).length
  const notesCoverage = slidesWithNotes / slideCount
  const totalSlideChars = slides.reduce((n, s) => n + s.text.length, 0)
  const totalNotesChars = slides.reduce((n, s) => n + s.notesText.length, 0)
  const totalExtractableChars = totalSlideChars + totalNotesChars

  // belowAbsoluteFloor is checked first: it's a strictly weaker condition on
  // a strictly larger number (totalExtractableChars includes notes) than
  // titleOnlyAndNoNotes, so it only fires when a notes-rich deck couldn't
  // rescue it anyway — checking it first never shadows the notes-aware branch.
  let status, statusLabel, imageReason = null
  const titleOnlyAndNoNotes = nearEmptySlides > slideCount * 0.5 && notesCoverage < 0.2
  const belowAbsoluteFloor = totalExtractableChars <= PPTX_MIN_TOTAL_CHARS
  if (belowAbsoluteFloor) {
    imageReason = `little extractable text anywhere in this deck — only ${totalExtractableChars} ` +
      `characters (on-slide + notes) against the ${PPTX_MIN_TOTAL_CHARS}-char floor.`
  } else if (titleOnlyAndNoNotes) {
    imageReason = 'most slides are title-only with almost no speaker notes — the pedagogical ' +
      'content is almost certainly in the visuals (frameworks, 2x2s, charts).'
  } else {
    status = 'OK'; statusLabel = 'TEXT PATH'
  }
  if (imageReason) { status = 'OK'; statusLabel = 'IMAGE PATH' }

  const sample = slides[Math.floor(slideCount / 2)] ?? slides[0]

  const printFull = () => {
    console.log('='.repeat(64))
    console.log(`Slide count              : ${slideCount}`)
    console.log(`Slides with speaker notes: ${slidesWithNotes} of ${slideCount} (${(notesCoverage * 100).toFixed(0)}%)`)
    console.log(`Mean notes length        : ${meanNotesLen} chars (of slides that have notes, >= ${PPTX_MIN_NOTE_CHARS} chars)`)
    console.log(`Mean text per slide      : ${meanSlideChars} chars`)
    console.log(`Near-empty/title-only    : ${nearEmptySlides} of ${slideCount}`)
    console.log(`Total on-slide characters: ${totalSlideChars}`)
    console.log(`Total speaker-notes characters: ${totalNotesChars}`)
    console.log(`Total extractable characters (slides + notes): ${totalExtractableChars} (floor: ${PPTX_MIN_TOTAL_CHARS})`)
    console.log('='.repeat(64))

    if (imageReason) {
      console.log(`\nVERDICT: IMAGE PATH — ${imageReason}`)
      console.log('  Render each slide to a PDF page and read it with a multimodal model.')
    } else {
      console.log('\nVERDICT: TEXT PATH. A slide is already a chunk — no chunking strategy needed.')
      if (notesCoverage < 0.2) {
        console.log('  Note: speaker-notes coverage is low; slide text alone carries the load.')
      }
    }

    console.log(`\n${'-'.repeat(64)}`)
    console.log(`SAMPLE — slide ${sample.n}, text + notes:`)
    console.log('-'.repeat(64))
    console.log(`TEXT:  ${sample.text.slice(0, 600) || '(no text on this slide)'}`)
    console.log(`NOTES: ${sample.notesText.slice(0, 600) || '(no speaker notes)'}`)
    console.log('-'.repeat(64) + '\n')
  }

  if (opts.verbose) printFull()

  return {
    name, format: 'PPTX', size, status, statusLabel,
    keyMetric: `${slidesWithNotes}/${slideCount} notes, ${meanSlideChars}c/slide`,
    detail: printFull,
  }
}
