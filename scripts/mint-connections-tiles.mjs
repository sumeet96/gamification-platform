#!/usr/bin/env node
// Package A5 -- mints the term_definition rows a Connections board needs but the bank doesn't have
// yet. Writes a REVIEWABLE JSON, never the database: "screen before writing, never after" is a
// standing project rule (CLAUDE.md), and a tile carries an implicit assertion that it names a real
// concept, so a fabricated clue rendered as a tile teaches something false as if it were true.
//
// Scope: the 22 tiles across boards b1-data-ai and b2-change-process that scripts/author-connections-
// boards.mjs's --dry-run shows as unresolved (10 of b1's 16, 12 of b2's 16 -- CLAUDE.md/the brief's
// "established facts", re-derived below from a live DB read rather than trusted blind). b3-ai-systems
// is out of scope entirely (see author-connections-boards.mjs's header) and this script refuses it.
//
// For each tile needing a clue, this script:
//   1. looks up a hand-verified excerpt for the tile's group (SOURCE_MAP below) -- drawn from
//      spike-data/clean-Session-*.json (already-screened generate-terms.mjs output, real deck prose)
//      where an exact or near-equivalent item exists, or from spike-data/groups-Session-*.json (the
//      Connections relation-harvest spike's own transcribed "evidence" field) otherwise. Both are
//      real, page-numbered deck content -- never invented.
//   2. if NO excerpt is available at all (no `sources` row for the deck -- the same defect as
//      b3-ai-systems, hitting two of b2's four groups: see SOURCE_MAP), the tile is written straight
//      to `needs_review` with reason "no-source-row" and NO model call is made.
//   3. otherwise calls the provider-agnostic adapter (scripts/lib/llm-client.mjs) with the excerpt,
//      the tile's three group-mates, and any group-mates that already exist live (with their real
//      clues, for context) -- and INSTRUCTS the model that returning "insufficient" is the correct
//      answer when the excerpt only NAMES the term without saying anything distinguishing about it,
//      rather than have it guess from general knowledge. This is the same grounding discipline
//      generate-terms.mjs's itemFieldsPromptFor already enforces, restated for a group-relation
//      context instead of a single concept.
//   4. any "ok" clue is re-run through terms-validate.mjs's checkClueLeak / checkChartTitle /
//      checkSourceLeak / checkProvenance (reused, not reimplemented) as a mechanical backstop --
//      checkOptionSetGiveaway and checkDistractors are deliberately NOT run here, since they assume
//      a real distractor set and this pass writes none (Connections doesn't render distractors;
//      they can be added later for match/choose-word reuse).
//
// The clue is NEVER shown during Connections play -- only the group LABEL is the in-game hint. It
// exists for provenance (why this tile is allowed to assert it names a real concept) and so this
// row is reusable by match-the-following and choose-the-right-word later, which DO show the clue.
// Do not let a future "simplification" drop clue-writing on the theory that Connections doesn't
// need it -- see the header of docs/NEXT_SESSION_BUILD_BRIEF.md's board-construction section for why
// distractor-free tiles are the deliberate shape of this pass.
//
// Usage:
//   node scripts/mint-connections-tiles.mjs [--boards-file spike-data/connections-boards-v1.json]
//     [--boards b1-data-ai,b2-change-process] [--out spike-data/connections-mint-candidates.json]
//     [--provider openai] [--model gpt-4.1-mini]
//
// Writes JSON only. NO DATABASE WRITES -- not even a SELECT... wait, it DOES read content_items
// read-only, to find out which of the board's tiles already live in the bank (so it doesn't
// re-mint them) and to pull existing group-mates' clues as context. No INSERT/UPDATE anywhere in
// this file.

import { writeFileSync, readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { loadEnv, createClient } from './lib/llm-client.mjs'
import { computeTermId } from './lib/term-import-plan.mjs'
import { checkClueLeak, checkChartTitle, checkSourceLeak, checkProvenance } from './lib/terms-validate.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/mint-connections-tiles.mjs [--boards-file f.json] [--boards id1,id2] [--out f.json] [--provider openai] [--model M]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }
const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}

const IN_SCOPE_BOARD_IDS = ['b1-data-ai', 'b2-change-process']
const boardsFile = flag('--boards-file', 'spike-data/connections-boards-v1.json')
const requestedIds = (flag('--boards', IN_SCOPE_BOARD_IDS.join(','))).split(',').map((s) => s.trim())
for (const id of requestedIds) {
  if (!IN_SCOPE_BOARD_IDS.includes(id)) die(`"${id}" is not in scope. Only ${IN_SCOPE_BOARD_IDS.join(', ')} -- see this file's header.`)
}
const outPath = flag('--out', 'spike-data/connections-mint-candidates.json')
const provider = flag('--provider', 'openai')

const SUBJECT = 'Digital Transformation'
const SOURCES = {
  BIGDATA: '1e023f0245ff97a2f72c0ce5',   // Session 3 - BigData.pdf
  SESSION5: '6bd5f4b580c770e15be06cc1',  // Session 5.pdf
  SESSION6: 'c298818102f359a187a04747',  // Session 6.pdf
}

// One excerpt per GROUP (not per tile) -- every group below teaches its four members on the same
// page, so one excerpt grounds all of them and lets the model see the siblings' own distinguishing
// content, not just the one tile it's writing about. `sourceId: null` means no `sources` row exists
// for the deck this content came from -- verified 7 Aug 2026 by querying `sources` directly (the
// harvest spike's deck field "Session 6,7.pdf" has no corresponding row; "Session 6.pdf" in the DB
// is a 37-page deck that stops before the design-thinking content starts, confirmed by page_count).
// This is the SAME defect that excludes b3-ai-systems, just landing inside b2 instead of ruling out
// the whole board -- CLAUDE.md's "established facts" list for this task did not surface it, so it is
// flagged loudly here rather than silently worked around by inventing a source.
const SOURCE_MAP = {
  'b1-data-ai': {
    'Dimensions of big data': {
      sourceId: SOURCES.BIGDATA,
      page: 5,
      excerpt: 'Dimensions of big data\n• Volume\n• Velocity\n• Variety\n• Veracity\n• Variability\n• Complexity\n• Value\n• Decay\n\nLAYOUT: Diagram with a triangle showing Volume, Velocity, and Variety expanding outward; inside Big Data includes Veracity (-), Variability (+), Complexity (+), Decay (+), Value (+); Traditional Data is smaller inside the triangle.',
    },
    'Types of data analytics': {
      sourceId: SOURCES.BIGDATA,
      page: 20,
      excerpt: 'Type of Data Analytics\n➢ What happened?\n➢ Descriptive Analytics (Data aggregation, Summary)\n➢ Branch CASA growth last quarter\n➢ Why did it happen?\n➢ Diagnostic Analytics (Data discovery, Drill-down)\n➢ Attrition spike in certain segments\n➢ What is likely to happen?\n➢ Predictive Analytics (Regression, Neural Network)\n➢ Default probability, churn risk\n➢ What should we do to make it happen?\n➢ Prescriptive Analytics (Optimization, Recommendation)\n➢ Next-best-offer recommendation',
    },
    'Major types of AI': {
      sourceId: SOURCES.SESSION6,
      page: 4,
      excerpt: 'Major Types of AI (heading only, followed by a bare list, no per-item description on this page): Expert systems, Machine learning, Neural networks and deep learning networks, Genetic algorithms, Natural language Processing, Computer vision, Robotics.',
    },
    'Characteristics of blockchain': null, // all 4 members already live -- nothing to mint
  },
  'b2-change-process': {
    'Adopter categories': null, // all 4 members already live -- nothing to mint
    'Stages of design thinking': { sourceId: null, page: null, excerpt: null },
    "Kotter's steps for leading change": {
      sourceId: SOURCES.SESSION5,
      page: 13,
      excerpt: "Kotter's 8-step process for leading change -- an ORDERED horizontal flow diagram with eight boxes, in this sequence: (1) Create urgency -> (2) Build a guiding team -> (3) Develop vision and strategy -> (4) Communicate the vision -> (5) Remove barriers -> (6) Generate quick wins -> (7) Sustain acceleration -> (8) Institutionalize change.",
    },
    'Six Thinking Hats': { sourceId: null, page: null, excerpt: null },
  },
}

const DB = process.env.DATABASE_URL
if (!DB) die('Missing DATABASE_URL.')
const sql = neon(DB)

let curated
try {
  curated = JSON.parse(readFileSync(boardsFile, 'utf8'))
} catch (err) {
  die(`Could not read/parse ${boardsFile}: ${err.message}`)
}
const boardsById = new Map((curated.boards ?? []).map((b) => [b.id, b]))

// --- 1. find which tiles already exist live (read-only) ---
const allTiles = []
for (const id of requestedIds) {
  const board = boardsById.get(id)
  if (!board) die(`Board "${id}" not found in ${boardsFile}.`)
  for (const group of board.groups) {
    for (const member of group.members) allTiles.push({ boardId: id, groupLabel: group.label, term: member })
  }
}
const liveRows = await sql`
  select id, term, clue from content_items
  where kind = 'term_definition' and subject = ${SUBJECT} and retired_at is null
    and lower(trim(term)) = any(${allTiles.map((t) => t.term.trim().toLowerCase())})
`
const liveByKey = new Map(liveRows.map((r) => [r.term.trim().toLowerCase(), r]))

const toMint = allTiles.filter((t) => !liveByKey.has(t.term.trim().toLowerCase()))
console.log(`${allTiles.length} tile(s) across ${requestedIds.length} board(s): ${liveByKey.size} already live, ${toMint.length} to mint.\n`)

// --- 2. group the to-mint tiles by (board, group) so one excerpt call covers the whole group ---
const byGroup = new Map() // "board|label" -> { boardId, groupLabel, members: [...all 4 authored], toMint: [...] }
for (const t of toMint) {
  const key = `${t.boardId}|${t.groupLabel}`
  if (!byGroup.has(key)) {
    const board = boardsById.get(t.boardId)
    const group = board.groups.find((g) => g.label === t.groupLabel)
    byGroup.set(key, { boardId: t.boardId, groupLabel: t.groupLabel, allMembers: group.members, toMint: [] })
  }
  byGroup.get(key).toMint.push(t.term)
}

let client = null
const ensureClient = () => { if (!client) client = createClient(provider, { model: flag('--model') }); return client }

const CLUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'clue', 'reason'],
  properties: {
    status: { type: 'string', enum: ['ok', 'insufficient'] },
    clue: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
  },
}

const cluePromptFor = (term, groupLabel, siblingContext, excerpt, page) => `You are writing ONE definition-style clue for a term that will become a game tile. Later, this same row may be reused by a match-the-following or choose-the-right-word game that DOES show this clue to a student picking among "${term}" and its group-mates -- so the clue must genuinely distinguish it, not just gesture at the category.

Term to define: "${term}"
Category it belongs to: "${groupLabel}"
Its group-mates in the SAME category (the near-neighbours the clue must be distinguishable from):
${siblingContext}

Source material (page ${page} of the deck), the ONLY thing you may draw on -- no outside knowledge:
"""
${excerpt}
"""

Write a clue that:
- Defines what "${term}" actually means, using ONLY what the excerpt states or directly implies about it.
- Distinguishes "${term}" from EACH group-mate listed above -- a clue that would equally describe a group-mate is not finished. (Standing project rule: a looser clue for a similar item once scored worse than chance because it fit a neighbour equally well -- the fix is always to tighten the clue with the detail specific to THIS term, never to weaken the neighbours.)
- Never contains "${term}" itself or an obvious inflection of it.
- Never refers to "the slide", "the deck", "the diagram above" or the presentation itself -- it must stand alone.

If the excerpt does NOT contain enough information to write a clue meeting ALL of the above -- for example if it only NAMES "${term}" in a list alongside its group-mates without saying anything distinct about what it means -- do NOT guess or fill the gap from general knowledge. Return status "insufficient" with a one-sentence reason instead. Returning "insufficient" is the CORRECT and EXPECTED answer when the material doesn't support a distinguishing definition, not a failure to avoid.`

const candidates = []
let tokensIn = 0, tokensOut = 0

for (const { boardId, groupLabel, allMembers, toMint: members } of byGroup.values()) {
  const info = SOURCE_MAP[boardId]?.[groupLabel]
  if (!info || !info.sourceId) {
    for (const term of members) {
      candidates.push({
        id: computeTermId(SUBJECT, term), subject: SUBJECT, board_id: boardId, group_label: groupLabel,
        term, clue: null, source_id: null, page: null, source_excerpt: null,
        status: 'needs_review', reason: 'no-source-row: no `sources` row exists for the deck this group\'s content came from (same defect as b3-ai-systems\' B_5_Agentic_AI_Presentation -- see this script\'s header).',
      })
    }
    console.log(`[${boardId}] "${groupLabel}": ${members.length} tile(s) -> needs_review (no source row), no model call.`)
    continue
  }

  // Sibling context: the OTHER members of this authored group (all 4, minus the one being written),
  // annotated with an existing live clue where one exists, so the model can see real distinguishing
  // language already on record rather than guessing what a sibling means.
  const siblingLines = (term) => allMembers
    .filter((m) => m !== term)
    .map((m) => {
      const live = liveByKey.get(m.trim().toLowerCase())
      return live ? `- "${m}" (already defined: "${live.clue}")` : `- "${m}"`
    })
    .join('\n')

  for (const term of members) {
    const prompt = cluePromptFor(term, groupLabel, siblingLines(term), info.excerpt, info.page)
    let result
    try {
      const { data, usage } = await ensureClient().generateJSON({ ref: null, prompt, schema: CLUE_SCHEMA })
      result = data
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
    } catch (err) {
      candidates.push({
        id: computeTermId(SUBJECT, term), subject: SUBJECT, board_id: boardId, group_label: groupLabel,
        term, clue: null, source_id: info.sourceId, page: info.page, source_excerpt: info.excerpt,
        status: 'needs_review', reason: `model call failed: ${err.message}`,
      })
      console.log(`  "${term}": model call FAILED -- ${err.message}`)
      continue
    }

    if (result.status !== 'ok' || !result.clue) {
      candidates.push({
        id: computeTermId(SUBJECT, term), subject: SUBJECT, board_id: boardId, group_label: groupLabel,
        term, clue: null, source_id: info.sourceId, page: info.page, source_excerpt: info.excerpt,
        status: 'needs_review', reason: result.reason || 'model returned "insufficient" with no reason given',
      })
      console.log(`  "${term}": needs_review (model) -- ${result.reason ?? '(no reason given)'}`)
      continue
    }

    // Mechanical backstop -- reused checks, not reimplemented (see header). Distractors/example_
    // sentence are deliberately absent from this pass, so only the checks that don't assume them run.
    const asItem = { term, clue: result.clue, example_sentence: null, page: info.page }
    const fail = checkClueLeak(asItem) || checkChartTitle(asItem) || checkSourceLeak(asItem) || checkProvenance(asItem, new Set())
    if (fail) {
      candidates.push({
        id: computeTermId(SUBJECT, term), subject: SUBJECT, board_id: boardId, group_label: groupLabel,
        term, clue: result.clue, source_id: info.sourceId, page: info.page, source_excerpt: info.excerpt,
        status: 'needs_review', reason: `failed backstop check "${fail.rule}": ${fail.quote}`,
      })
      console.log(`  "${term}": needs_review (backstop "${fail.rule}") -- ${fail.quote}`)
      continue
    }

    candidates.push({
      id: computeTermId(SUBJECT, term), subject: SUBJECT, board_id: boardId, group_label: groupLabel,
      term, clue: result.clue, source_id: info.sourceId, page: info.page, source_excerpt: info.excerpt,
      status: 'ok', reason: null,
    })
    console.log(`  "${term}": ok -- "${result.clue}"`)
  }
}

const okCount = candidates.filter((c) => c.status === 'ok').length
console.log(`\n${candidates.length} candidate(s): ${okCount} ok, ${candidates.length - okCount} needs_review.`)
console.log(`Tokens: ${tokensIn} in, ${tokensOut} out`)
writeFileSync(outPath, JSON.stringify(candidates, null, 2))
console.log(`Wrote ${outPath}. NOTHING was written to the database -- review this file, then pass it to ` +
  `author-connections-boards.mjs --mint-file ${outPath} --commit.`)
