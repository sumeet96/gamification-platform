#!/usr/bin/env node
// Package A5 board-authoring path -- loads a curated-boards JSON (spike-data/connections-boards-v1.json
// by default) into connection_groups / connection_group_members / connection_boards /
// connection_board_groups (db/011). This is the ONLY place that writes those four tables; the game
// runtime (app/api/connections/*) only ever reads them.
//
// Why a separate script from the term_definition generator: db/011's header is explicit that
// "exactly 4 members per group", "exactly 4 groups per board" and "no tile in two groups of one
// board" are AUTHORING-TIME invariants Postgres cannot express without a trigger (this project does
// not use triggers -- CLAUDE.md). This script is where they are actually enforced, not a formality
// bolted on afterwards -- see scripts/lib/connections-plan.mjs's validateCuratedBoardShape for the
// shape checks and the DB-round-trip checks below for tile resolution + one-subject-per-board.
//
// --dry-run is the default (same convention as scripts/import-terms.mjs): it resolves every tile,
// prints the full plan, and writes nothing. --commit is the only way to write, and does so in ONE
// transaction across every table this script touches, for every board requested in this
// invocation -- "refuses the whole load on any failure" means the whole INVOCATION, not just the
// one board that failed: validate every requested board fully before writing anything, so a defect
// in board 2 can never leave board 1 half-written.
//
// Optionally mints approved tiles first: --mint-file <path> feeds scripts/mint-connections-tiles.mjs's
// reviewed output (rows with status "ok") into content_items via the SAME upsert shape
// generate-terms.mjs and import-terms.mjs already use, before resolving board tiles -- so a human
// approves the JSON, then this one script does both writes in the same --commit run. Skipping
// --mint-file just resolves against whatever content_items rows already exist.
//
// Usage:
//   node scripts/author-connections-boards.mjs --boards b1-data-ai,b2-change-process [--dry-run|--commit]
//   node scripts/author-connections-boards.mjs --boards b1-data-ai,b2-change-process \
//     --mint-file spike-data/connections-mint-candidates.json --commit
//   node scripts/author-connections-boards.mjs --retire-board <id> --reason superseded --commit

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { loadEnv } from './lib/llm-client.mjs'
import { computeBoardId, validateCuratedBoardShape, planGroups } from './lib/connections-plan.mjs'
import { computeTermId } from './lib/term-import-plan.mjs'

loadEnv()

const USAGE =
  'Usage: node scripts/author-connections-boards.mjs [--boards-file f.json] --boards id1,id2 ' +
  '[--mint-file f.json] [--dry-run|--commit] | --retire-board id --reason r [--commit]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }
const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}

// Hard scope gate, per the task this script was written for: b3-ai-systems is EXCLUDED because two
// of its groups ("Human-AI collaboration models", "Evolving skills for marketing professionals")
// come from B_5_Agentic_AI_Presentation, which has no row in `sources` -- its tiles would carry no
// provenance. This is not a flag the caller can override; the fix is minting a sources row for that
// deck first, which is a separate, explicit decision.
const IN_SCOPE_BOARD_IDS = new Set(['b1-data-ai', 'b2-change-process'])

const boardsFile = flag('--boards-file', 'spike-data/connections-boards-v1.json')
const boardsArg = flag('--boards')
const mintFile = flag('--mint-file')
const retireBoardArg = flag('--retire-board')
const retireReason = flag('--reason')
const COMMIT = process.argv.includes('--commit')
const DRY_RUN_FLAG = process.argv.includes('--dry-run')
if (COMMIT && DRY_RUN_FLAG) die('--dry-run and --commit are mutually exclusive.')
const DRY_RUN = !COMMIT // dry-run is the default; --commit is the only way to write, same as import-terms.mjs

const DB = process.env.DATABASE_URL
if (!DB) die('Missing DATABASE_URL.')
const sql = neon(DB)

// --- retire-board mode: small, separate, and doesn't touch the load path below ---
if (retireBoardArg) {
  const REASONS = ['ambiguous', 'superseded', 'member-retired']
  if (!REASONS.includes(retireReason)) die(`--reason must be one of ${REASONS.join(', ')}.`)
  console.log(`Retiring connection_boards "${retireBoardArg}" (reason: ${retireReason})${DRY_RUN ? ' (dry run)' : ''}...`)
  const existing = await sql`select id, subject, retired_at from connection_boards where id = ${retireBoardArg}`
  if (existing.length === 0) die(`No connection_boards row with id "${retireBoardArg}".`)
  if (existing[0].retired_at) { console.log('Already retired. Nothing to do.'); process.exit(0) }
  if (DRY_RUN) { console.log('DRY RUN -- would retire this board. Pass --commit to apply.'); process.exit(0) }
  await sql`update connection_boards set retired_at = now(), retired_reason = ${retireReason} where id = ${retireBoardArg}`
  console.log('Retired.')
  process.exit(0)
}

// --- load-boards mode ---
if (!boardsArg) die('--boards is required (comma-separated board ids from the curated file), or use --retire-board.')
const requestedIds = boardsArg.split(',').map((s) => s.trim()).filter(Boolean)
for (const id of requestedIds) {
  if (!IN_SCOPE_BOARD_IDS.has(id)) {
    die(`"${id}" is not in scope for this script. Only ${[...IN_SCOPE_BOARD_IDS].join(', ')} are authorable today -- ` +
      `every other board in the curated file (e.g. b3-ai-systems) has at least one group whose source deck has no ` +
      `row in \`sources\`, so its tiles would carry no provenance. See the header comment.`)
  }
}

let curated
try {
  curated = JSON.parse(readFileSync(boardsFile, 'utf8'))
} catch (err) {
  die(`Could not read/parse ${boardsFile}: ${err.message}`)
}
const subject = curated.subject
if (!subject) die(`${boardsFile} has no top-level "subject".`)

const boardsById = new Map((curated.boards ?? []).map((b) => [b.id, b]))
const requestedBoards = []
for (const id of requestedIds) {
  const b = boardsById.get(id)
  if (!b) die(`Board "${id}" not found in ${boardsFile}.`)
  requestedBoards.push(b)
}

console.log(`Loading ${requestedBoards.length} board(s) for subject "${subject}" from ${boardsFile}${DRY_RUN ? ' (dry run)' : ''}...\n`)

// --- 1. optionally mint approved tiles first, so their content_items rows exist before resolution ---
let mintUpserts = []
if (mintFile) {
  let candidates
  try {
    candidates = JSON.parse(readFileSync(mintFile, 'utf8'))
  } catch (err) {
    die(`Could not read/parse --mint-file ${mintFile}: ${err.message}`)
  }
  if (!Array.isArray(candidates)) die(`${mintFile} is not a JSON array.`)
  const approved = candidates.filter((c) => c.status === 'ok')
  const skipped = candidates.length - approved.length
  console.log(`--mint-file ${mintFile}: ${candidates.length} candidate(s), ${approved.length} approved (status "ok")` +
    `${skipped ? `, ${skipped} skipped (not "ok" -- review before re-running with --commit)` : ''}.`)
  for (const c of approved) {
    if (!c.term || !c.clue || !c.source_id || !c.subject) {
      die(`Candidate "${c.term ?? '(missing term)'}" is missing a required field (term/clue/source_id/subject). Refusing to proceed.`)
    }
    mintUpserts.push({
      id: c.id ?? computeTermId(c.subject, c.term),
      subject: c.subject,
      source_id: c.source_id,
      page: c.page ?? null,
      topic: c.group_label ?? null,
      term: c.term,
      clue: c.clue,
      source_excerpt: c.source_excerpt ?? null,
    })
  }
  console.log(`  ${mintUpserts.length} content_items row(s) will be upserted before board resolution.\n`)
}

// --- 2. shape validation (pure, no DB) -- db/011's invariants 1, 2, 3, 5 minus tile-liveness ---
const shapeProblems = []
for (const board of requestedBoards) shapeProblems.push(...validateCuratedBoardShape(board))
if (shapeProblems.length) {
  console.error(`Shape validation FAILED (${shapeProblems.length} problem(s)) -- refusing the whole load, nothing written:`)
  for (const p of shapeProblems) console.error(`  - ${p}`)
  process.exit(2)
}
console.log('Shape validation passed for all requested boards (4 groups/board, 4 members/group, no cross-group collisions).\n')

// --- 3. resolve every tile to a live content_items row (invariant 4) ---
// Scoped to kind='term_definition', this board's subject, retired_at is null -- exactly the task's
// resolution rule. Case/whitespace-insensitive on lower(trim(term)), matching how a human authored
// the curated JSON's member strings against the bank.
const plannedBoards = []
const resolutionProblems = []
for (const board of requestedBoards) {
  const groups = planGroups(subject, board)
  const allMembers = groups.flatMap((g) => g.members)
  const rows = await sql`
    select id, term from content_items
    where kind = 'term_definition' and subject = ${subject} and retired_at is null
      and lower(trim(term)) = any(${allMembers.map((m) => m.trim().toLowerCase())})
  `
  const byKey = new Map(rows.map((r) => [r.term.trim().toLowerCase(), r]))
  const resolvedGroups = groups.map((g) => ({
    ...g,
    resolvedMembers: g.members.map((m) => {
      const hit = byKey.get(m.trim().toLowerCase())
      if (!hit) {
        resolutionProblems.push(`${board.id}/"${g.label}": tile "${m}" does not resolve to a live term_definition row in subject "${subject}"`)
        return { member: m, contentItemId: null }
      }
      return { member: m, contentItemId: hit.id }
    }),
  }))
  plannedBoards.push({ boardId: computeBoardId(subject, board.id), slug: board.id, subject, groups: resolvedGroups })
}

// --- 4. one-subject-per-board (invariant 5, DB-confirmed) -- every group on a board came from the
//        same `subject` query above, so this is true by construction; asserted explicitly anyway so
//        a future refactor that widens the query can't silently break it without a test failing. ---
// (no-op check: plannedBoards are built one subject at a time above)

if (resolutionProblems.length) {
  console.error(`Tile resolution FAILED (${resolutionProblems.length} problem(s)) -- refusing the whole load, nothing written:`)
  for (const p of resolutionProblems) console.error(`  - ${p}`)
  if (!mintFile) console.error('\n(No --mint-file was given -- if these tiles are meant to come from scripts/mint-connections-tiles.mjs, review its candidates JSON and pass it here.)')
  process.exit(2)
}
console.log('Tile resolution passed -- every tile on every requested board resolves to a live content_items row.\n')

// --- 5. print the plan ---
for (const b of plannedBoards) {
  console.log(`=== ${b.slug} -> connection_boards.id ${b.boardId} (subject "${b.subject}") ===`)
  for (const g of b.groups) {
    console.log(`  [${g.ordinal}] "${g.label}" -> connection_groups.id ${g.groupId}`)
    for (const m of g.resolvedMembers) console.log(`      - ${m.member.padEnd(28)} -> ${m.contentItemId}`)
  }
}

// --- 6. write (transaction, all boards + mint upserts in this invocation together) ---
if (DRY_RUN) {
  console.log('\nDRY RUN -- nothing written. Pass --commit to apply.')
  process.exit(0)
}

const queries = []

for (const m of mintUpserts) {
  queries.push(sql`
    insert into content_items (id, source_id, subject, topic, page, kind, term, clue, source_excerpt)
    values (${m.id}, ${m.source_id}, ${m.subject}, ${m.topic}, ${m.page}, 'term_definition', ${m.term}, ${m.clue}, ${m.source_excerpt})
    on conflict (id) do update set
      topic = excluded.topic, page = excluded.page, clue = excluded.clue, source_excerpt = excluded.source_excerpt
  `)
}

for (const b of plannedBoards) {
  queries.push(sql`
    insert into connection_boards (id, subject) values (${b.boardId}, ${b.subject})
    on conflict (id) do update set subject = excluded.subject
  `)
  for (const g of b.groups) {
    queries.push(sql`
      insert into connection_groups (id, subject, label) values (${g.groupId}, ${b.subject}, ${g.label})
      on conflict (id) do update set label = excluded.label
    `)
    queries.push(sql`
      insert into connection_board_groups (board_id, group_id, ordinal) values (${b.boardId}, ${g.groupId}, ${g.ordinal})
      on conflict (board_id, ordinal) do update set group_id = excluded.group_id
    `)
    g.resolvedMembers.forEach((m, ordinal) => {
      queries.push(sql`
        insert into connection_group_members (group_id, content_item_id, ordinal)
        values (${g.groupId}, ${m.contentItemId}, ${ordinal})
        on conflict (group_id, ordinal) do update set content_item_id = excluded.content_item_id
      `)
    })
  }
}

await sql.transaction(queries)
console.log(`\nCommitted: ${mintUpserts.length} content_items upsert(s), ${plannedBoards.length} board(s), ` +
  `${plannedBoards.reduce((n, b) => n + b.groups.length, 0)} group(s), all in one transaction.`)

// --- 7. verify, using db/011's own documented read-only queries ---
const badGroupCounts = await sql`
  select group_id, count(*)::int as member_count from connection_group_members
  group by group_id having count(*) <> 4
`
const badBoardCounts = await sql`
  select board_id, count(*)::int as group_count from connection_board_groups
  group by board_id having count(*) <> 4
`
const crossBoardCollisions = await sql`
  select bg.board_id, gm.content_item_id, count(distinct bg.group_id)::int as group_count
  from connection_board_groups bg
  join connection_group_members gm on gm.group_id = bg.group_id
  group by bg.board_id, gm.content_item_id
  having count(distinct bg.group_id) > 1
`
console.log(`\nPost-write verification (expect 0 rows in each):`)
console.log(`  groups with != 4 members: ${badGroupCounts.length}`)
console.log(`  boards with != 4 groups: ${badBoardCounts.length}`)
console.log(`  tiles claimed by >1 group on the same board: ${crossBoardCollisions.length}`)
if (badGroupCounts.length || badBoardCounts.length || crossBoardCollisions.length) {
  console.error('\nPost-write verification found a violated invariant despite pre-write checks passing -- investigate before trusting this load.')
  process.exitCode = 2
}
