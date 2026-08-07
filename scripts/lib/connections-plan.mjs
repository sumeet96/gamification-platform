// Pure planning helpers for scripts/author-connections-boards.mjs, split out so the invariants
// db/011's header documents as "authoring-time only, checked by the board-authoring script and its
// tests, not by the database" are testable without a live Neon connection -- same pattern as
// scripts/lib/term-import-plan.mjs and terms-validate.mjs.
//
// db/011's header names five invariants Postgres cannot express on its own:
//   1. exactly 4 members per group
//   2. exactly 4 groups per board
//   3. no tile appears in two groups of the same board
//   4. every tile resolves to a live content_items row
//   5. all groups on a board share one subject
// (1), (2) and (5) are checkable on the curated JSON alone, before any DB lookup -- validateCuratedBoard
// below. (3) needs nothing from the DB either, since it's a property of the member STRINGS as
// authored. (4) needs the DB (a tile string is only a promise until it resolves to a live row) --
// that check stays in the CLI script, which is the one thing here that isn't pure.

import { createHash } from 'node:crypto'

// Ids are a content hash of a stable NATURAL KEY, never an array position (CLAUDE.md's standing
// rule, restated in db/011's own header for shuffle seeds). A board's natural key is the curated
// JSON's own human-assigned slug ("b1-data-ai") plus subject, so re-running author-connections-
// boards.mjs against the same curated file is idempotent rather than minting a new board each time.
// A group's natural key is scoped to ITS board (subject::boardId::label): the curated JSON gives a
// group only a label, not a global id, and two different boards could in principle reuse the same
// label for two conceptually different groupings -- scoping to boardId keeps those from colliding
// onto one connection_groups row.
export function computeBoardId(subject, boardSlug) {
  return createHash('sha256').update(`${subject}::connections-board::${boardSlug}`).digest('hex').slice(0, 32)
}
export function computeGroupId(subject, boardSlug, label) {
  return createHash('sha256').update(`${subject}::connections-group::${boardSlug}::${label}`).digest('hex').slice(0, 32)
}

/**
 * Validate ONE curated board's shape -- everything checkable without touching the database.
 * Returns an array of human-readable problem strings; empty means the board's shape is sound.
 * Deliberately returns problems rather than throwing, so the CLI can print every issue across
 * every requested board in one pass instead of stopping at the first one.
 */
export function validateCuratedBoardShape(board) {
  const problems = []
  if (!board || typeof board !== 'object') return ['board is not an object']
  const id = board.id ?? '(missing id)'

  if (!Array.isArray(board.groups)) {
    problems.push(`${id}: "groups" is not an array`)
    return problems
  }
  if (board.groups.length !== 4) {
    problems.push(`${id}: has ${board.groups.length} group(s), expected exactly 4`)
  }

  const seenLabels = new Set()
  const seenMembersAcrossBoard = new Map() // member (lower-trimmed) -> label(s) it appeared under

  for (const group of board.groups) {
    const label = group?.label ?? '(missing label)'
    if (seenLabels.has(label)) problems.push(`${id}: group label "${label}" is duplicated on this board`)
    seenLabels.add(label)

    if (!Array.isArray(group?.members)) {
      problems.push(`${id}/"${label}": "members" is not an array`)
      continue
    }
    if (group.members.length !== 4) {
      problems.push(`${id}/"${label}": has ${group.members.length} member(s), expected exactly 4`)
    }

    const seenInGroup = new Set()
    for (const raw of group.members) {
      const member = typeof raw === 'string' ? raw.trim() : ''
      if (!member) { problems.push(`${id}/"${label}": has an empty or non-string member`); continue }
      const key = member.toLowerCase()
      if (seenInGroup.has(key)) problems.push(`${id}/"${label}": member "${member}" is duplicated within its own group`)
      seenInGroup.add(key)

      // Invariant 3: no tile in two groups of the SAME board. A member can legitimately be a
      // one-word substring of another (e.g. "Define" the design-thinking stage is unrelated to
      // any other board's "Define"), so this is an exact, board-scoped, case/whitespace-
      // insensitive check -- not a fuzzy one.
      const priorLabel = seenMembersAcrossBoard.get(key)
      if (priorLabel && priorLabel !== label) {
        problems.push(`${id}: tile "${member}" appears in both "${priorLabel}" and "${label}" -- a tile may only belong to one group per board`)
      } else if (!priorLabel) {
        seenMembersAcrossBoard.set(key, label)
      }
    }
  }

  return problems
}

/**
 * Flatten a curated board into (groupLabel, member) pairs in authored order, tagging each with
 * the deterministic group id it will get. Pure -- no DB, no id resolution to content_items.
 */
export function planGroups(subject, board) {
  return board.groups.map((group, ordinal) => ({
    groupId: computeGroupId(subject, board.id, group.label),
    ordinal,
    label: group.label,
    members: group.members,
  }))
}
