#!/usr/bin/env node
// SPIKE (6 Aug 2026) — stage 1 of a possible Connections pipeline: harvest TAXONOMIC RELATIONS
// from a deck, not terms. A Connections group is a labelled relation over >=4 real concepts, so the
// generated object is the group, never the tile.
//
// Design notes, all inherited from lessons this project already paid for:
//   - NO QUOTA. Empty is a correct answer. A quota is what manufactured chart captions in G2.
//   - CLOSED relation types. An open-ended "what do these terms have in common?" is exactly where a
//     model fabricates a relation to fill the response; a fixed enum of four structural relations
//     gives it nothing to invent with.
//   - A group of <4 members is DISCARDED, never repaired. Asking a model to "complete the group to
//     four" is a per-group quota wearing a different hat.
//   - Members must be named in the material. The caption failure was a model naming a slide title;
//     the same guard applies to a group member.
//
// Writes JSON only. Nothing reaches the database.
//
// Usage:
//   node scripts/spike-connections-harvest.mjs <deck.pdf> --subject "Name" [--pages A-B]
//        [--window 12] [--provider openai] [--model M] --out spike-data/groups-x.json

import { readFileSync, writeFileSync } from 'node:fs'
import { loadEnv, createClient } from './lib/llm-client.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/spike-connections-harvest.mjs <deck.pdf> --subject "S" [--pages A-B] [--window 12] [--provider openai] [--model M] --out f.json'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }
const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}

const pdfPath = process.argv[2]
if (!pdfPath || pdfPath.startsWith('--')) die('Missing <deck.pdf>.')
const subject = flag('--subject') || die('--subject is required.')
const provider = flag('--provider', 'openai')
const windowSize = Number(flag('--window', 12))
const outPath = flag('--out') || die('--out is required.')

const pdfBuf = readFileSync(pdfPath)
const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default
const { numpages } = await pdf(pdfBuf)

let [firstPage, lastPage] = [1, numpages]
const range = flag('--pages')
if (range) {
  const m = range.match(/^(\d+)-(\d+)$/)
  if (!m) die('--pages expects a range like 4-12.')
  firstPage = Number(m[1]); lastPage = Number(m[2])
  if (firstPage < 1 || lastPage > numpages || firstPage > lastPage) die(`--pages must sit inside 1-${numpages}.`)
}

const client = createClient(provider, { model: flag('--model') })

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['groups'],
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'relation_type', 'members', 'page', 'evidence'],
        properties: {
          label: { type: 'string' },
          relation_type: { type: 'string', enum: ['constituents_of', 'stages_of', 'members_of_type', 'instances_of'] },
          members: { type: 'array', items: { type: 'string' } },
          page: { type: 'integer' },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

const promptFor = (from, to) => `You are harvesting TAXONOMIC RELATIONS from a university lecture slide deck, for pages ${from} to ${to} only. Ignore every other page.

A relation is a named set whose members the material itself groups together. Exactly four kinds count:
- "constituents_of": the named parts of one framework or model (e.g. the four dimensions a distance framework is built from).
- "stages_of": the named, ordered steps of one process or lifecycle.
- "members_of_type": several named things of the same kind, which the material presents as a set (e.g. several service models, several deployment models, several consensus mechanisms).
- "instances_of": named concrete examples the material gives of one general category.

Rules, all of which matter more than returning something:
1. There is NO required count and no target. Return as many relations as these pages genuinely teach, which may be zero — a title page, an agenda, a case-data slide or a chart teaches none. Returning an empty list is a CORRECT answer. Do not invent a relation to avoid an empty list.
2. A relation needs FOUR OR MORE members, all named in the material on these pages. If you can only find three, DO NOT list the relation and DO NOT invent a fourth member to reach four. A three-member relation is a discard, not a problem to solve.
3. Every member must be a term the material actually names. Do not paraphrase a bullet into a member, and do not turn a slide title, a chart caption, a company name, a country or a statistic into a member.
4. Do not list a relation whose members are related only by grammar or word shape (all start with "cloud", all end in "-ing"). The grouping must be one the material teaches.
5. Members of one relation must be MUTUALLY EXCLUSIVE — siblings at the same level, not a mix of a parent and its children.

For each relation you DO list, give:
- "label": what the set is, at most 6 words (e.g. "Cloud service models", "Characteristics of big data").
- "relation_type": one of the four above.
- "members": the member terms, as the material names them, 4 or more.
- "page": the single page (between ${from} and ${to}) the relation comes from.
- "evidence": one short quoted or close-paraphrased line from that page showing the material groups these together.`

console.log(`Deck: ${pdfPath}\nSubject: ${subject}  pages ${firstPage}-${lastPage}  window ${windowSize}  provider ${provider}\n`)

const ref = await client.uploadPdf(pdfPath)
const groups = []
let dropped = 0
try {
  for (let from = firstPage; from <= lastPage; from += windowSize) {
    const to = Math.min(from + windowSize - 1, lastPage)
    try {
      const { data } = await client.generateJSON({ ref, prompt: promptFor(from, to), schema: SCHEMA })
      const batch = data.groups || []
      // Guard 2 enforced in code as well as in the prompt: a model that ignores "4 or more" must
      // not get its short group counted. Guard on page window as the generator does.
      const kept = batch.filter((g) => {
        if (g.page < from || g.page > to) return false
        const uniq = new Set(g.members.map((m) => m.trim().toLowerCase()))
        return uniq.size >= 4
      })
      dropped += batch.length - kept.length
      groups.push(...kept.map((g) => ({ ...g, subject, deck: pdfPath })))
      console.log(`  pages ${String(from).padStart(2)}-${String(to).padStart(2)}: ${kept.length} relation(s)${batch.length - kept.length ? `, ${batch.length - kept.length} dropped` : ''}`)
    } catch (err) {
      console.error(`  pages ${from}-${to}: FAILED — ${err.message}`)
    }
  }
} finally {
  await client.deleteFile(ref)
}

console.log(`\n${groups.length} relation(s) harvested, ${dropped} dropped (short or out-of-window).\n`)
for (const g of groups) {
  console.log(`  [${g.relation_type}] ${g.label}  (p${g.page}, ${g.members.length})`)
  console.log(`      ${g.members.join(' · ')}`)
}
writeFileSync(outPath, JSON.stringify({ subject, deck: pdfPath, groups }, null, 2))
console.log(`\nWrote ${outPath}`)
