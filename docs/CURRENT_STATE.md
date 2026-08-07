# Current state — 7 August 2026

## Where we are

Crossword is reopened as a **sixth, additive** `GAME_REGISTRY` tile after being ruled out on 6 Aug.
The crossing-density objection that killed it (`game4-rfc-prompt.md` §7.1: "is a crossword
meaningfully different from fill-in-the-blanks arranged decoratively?") is spike-verified false
against real data: `scripts/spike-crossword-density.mjs` runs a real greedy criss-cross placer (both
orientations, adjacency-guarded, 100 random restarts) against the live term bank and clears the
RFC's own cited <25% freeform-generator floor at every scale tested — 46.5% fill / 179 of 179
fragments placed on the full live bank (134 rows), 43.5%/44.6% fill at realistic single-deck board
scale (28/30 and 17/20 placed). Connections is **untouched** and stays shipped as-is; crossword is
additive, not a replacement.

What exists: `lib/games/registry.ts`'s `crossword` entry (`enabled: false`) and
`db/013_add_crossword.sql`'s board/grid data model (folded into `db/schema.sql`, **not applied to
Neon**). What does not exist yet: routes, page, API, a board-authoring script, any actual board
content, the mobile viewport, the scoring economics, and the lever/difficulty mechanic. This is
metadata and schema only — a scaffold, not a playable or even partially-built game.

Everything is committed and pushed: commit `53b9fd0` on `main`, tree clean.

## Working tree

- Branch `main`, clean, fully pushed (`git status` — "up to date with origin/main", nothing to
  commit).
- Last commit: `53b9fd0` — "Reopen crossword as a sixth tile, scaffolded not enabled".
- Nothing uncommitted.

## In progress right now

Nothing is mid-edit. Session ended at a clean stopping point: everything committed and pushed.

The user's stated next action is to check the dashboard in a browser — no specific build task was
handed off beyond that. See "Next 3 actions" below for what a resuming session should do once that
check is done (or if it surfaces a problem).

## Decisions made this session

- **Crossword reopened as an ADDITIONAL sixth tile, not a replacement for Connections** — user's
  explicit scope call, 7 Aug. A5 (Connections) is not being unwound; no rollback.
- **`lever: 'both'`, declared but deliberately NOT consumed yet** — user's explicit call, 7 Aug,
  chosen over the simpler `lever: 'none'` (Connections' shape). Reason: `'none'` would permanently
  foreclose crossword as a study arm even once the between-arm contrast (`AGENTS.md`'s standing top
  blocker) is resolved; `'both'` keeps it structurally eligible. **Hard constraint that follows:
  crossword's registry entry must stay `enabled: false` until the game genuinely reads
  `resolveLever()`'s output** — an enabled game declaring an unconsumed lever would log events
  claiming a lever was active when nothing enforced it, the same class of defect as a
  client-supplied score. Written into `lib/games/registry.ts`'s crossword entry comments,
  `DECISIONS.md`, and `docs/architecture/games-and-content-findings.md`.
- **Board grain is `source_id` (one lecture deck), not `subject`** — measured live: 9–33 term rows
  per deck vs. 125+9 per subject. Mirrors Connections' "a board never spans two subjects" rule at a
  finer grain.
- **`crossword_boards.source_id` and `crossword_entries.content_item_id` are both real FKs**
  (to `sources(id)` and `content_items(id)`) — corrected during review of the `db-engineer`
  subagent's first draft, which left `source_id` as plain text, reasoning by false analogy to
  `events.board_id`'s no-FK convention. That convention is specific to `events` being a
  heterogeneous append-only log; `crossword_boards` is homogeneous authoring data, and
  `content_items.source_id` (the column being matched) is itself already a real FK. See
  `db/013_add_crossword.sql`'s "CORRECTED IN REVIEW" comment.
- **Scoring shape (`GridPoints` in `lib/games/registry.ts`) is new, not reused from `BoardPoints`
  (match) or `PartitionBoardPoints` (Connections)** — reuse was rejected because both existing
  shapes' floor values rest on a derived argument (match's permutation fixed-point count,
  Connections' mistake-budget math) that has not been re-derived for a crossword grid's
  intersection graph. `GridPoints` exists so a future scoring pass has an honestly-unverified home
  rather than borrowing another game's proof by association. **Current numbers (perEntry: 15,
  perfectBonus: 25, floorAtOrBelow: 1, floorPenalty: -15) don't even clear a naive negative-EV
  check** (1×15 + (-15) = 0, not negative) — do not treat them as considered.
- **`db/013_add_crossword.sql` adds NO `events` columns** — deliberate. Interaction/event logging
  depends on scoring economics (`game4-rfc-prompt.md` §5, never answered) and the lever mechanic
  (§5.2/§5.3, never designed) landing first. Guessing at event shape now would repeat, worse, the
  mistake `db/011`'s header describes catching in its own first draft.
- **`db/schema.sql` was updated in this same commit**, not deferred until Neon apply — matches
  `db/011`'s own precedent (folded in "in the same edit" that wrote the migration, with a "NOT YET
  APPLIED as of this snapshot" header note). The `db-engineer` subagent's first draft skipped this,
  misreading a report-back verification-checklist line as an instruction to omit it; caught and
  fixed before commit.
- **Migration numbered `db/013`, not `db/012`** — `db/012` stays reserved for the still-unwritten
  Connections mistake-budget concurrency fix (see "Do not redo" below; unchanged by this session).

## Open questions / blocked on

- **The mobile pan-and-zoom viewport is unbuilt.** Even the smallest measured single-deck board
  (24 columns) is ~16px/cell at a 390px screen — under a usable touch target at every board size
  tested. Recommendation on record (`games-and-content-findings.md`): CSS-transform pan/zoom +
  focused-cell viewport + separate clue banner, no new dependency. Not started.
- **The crossword-shaped time-pressure mechanic is fully open.** `game4-rfc-prompt.md` §5.2's
  objection is unchanged by anything this session did: a crossword is slow and non-linear, the
  existing item clock (10s) and board clock (90s) don't fit it. This is what actually blocks ever
  flipping lever consumption on.
- **A crossword-appropriate difficulty source is fully open.** §5.3: no MCQ rendering to hang the
  existing calibrator on. Nothing proposed yet.
- **Scoring economics are fully open.** §5 asked about partial completion, hints, revision, and
  whether guessing must be negative-EV; never answered because the RFC picked Connections before
  any model reached it.
- **No board-authoring script exists.** `scripts/spike-crossword-density.mjs` is a feasibility
  spike (proves density, writes nothing to the DB) — not a `scripts/author-connections-boards.mjs`
  equivalent. Writing real `crossword_boards`/`crossword_entries` rows needs a new script.
- **The supervisor still has not been told about the 4 Aug "explore crossword" divergence.**
  `DECISIONS.md` still carries this as unreconciled; nothing this session closes that gap, it only
  makes reopening crossword more defensible. This is a human conversation, not a build task.
- **`db/013_add_crossword.sql` is NOT applied to Neon.** A human must paste it into the Neon SQL
  editor when ready (psql is not installed on the dev machine, per `db/011`'s precedent).

## Next 3 actions

1. **Confirm the dashboard renders the new tile correctly.** `npm run dev`, log in, open
   `/dashboard` — crossword should appear as a sixth tile, disabled/non-clickable (`GameTile`'s
   `enabled: false` path, same as the existing Fill in the Blanks and Wordle tiles). This is the
   user's stated next action for this session; nothing further is required unless it renders wrong.
2. **If continuing the crossword build, the next real design gate is scoring economics
   (`game4-rfc-prompt.md` §5) or the lever mechanic (§5.2/§5.3)** — either could go first, but
   `enabled: true` is specifically blocked on the lever one (see hard constraint above). Do not
   write a board-authoring script or routes before at least one is decided; there is nothing to
   author against yet.
3. **`db/012` (the Connections mistake-budget concurrency race) is still unwritten**, and unrelated
   to this session's work — still the oldest open item, per `HANDOFF.md` §20. Not reprioritized by
   anything that happened this session. Start from `db/007_add_board_dedupe.sql` and
   `db/008_add_answer_dedupe.sql` — same check-then-insert race shape, fix is making the INSERT
   itself the lock.

## Do not redo

- **Do not re-run the five-model crossword-vs-Connections RFC, and do not rebuild Connections.**
  Unchanged. This session's crossword work was a narrow, targeted density spike against real data,
  not a re-litigation of the RFC or a rollback of A5 — noted explicitly in both
  `games-and-content-findings.md` and `DECISIONS.md` to head off exactly this confusion later.
- **Do not flip crossword's registry entry to `enabled: true`** without the lever mechanic actually
  consuming `resolveLever()` first. Recorded in three places (`lib/games/registry.ts`'s comments,
  `DECISIONS.md`, `games-and-content-findings.md`) — an enabled game with an unconsumed declared
  lever would corrupt the event log's meaning.
- **Do not reuse `BoardPoints` or `PartitionBoardPoints` for crossword's scoring** — `GridPoints`
  exists specifically because neither shape's floor-penalty proof transfers. See its docstring in
  `lib/games/registry.ts`.
- **Do not add `events` columns for crossword yet** — blocked on the scoring/lever design passes
  above, not an oversight.
- **Do not treat `GridPoints`' current numbers as ordinary sign-off placeholders** like every other
  row's — they are additionally shape-unverified (see "Decisions" above).
- *(Carried forward, unchanged)* Do not assemble a second Connections board from the existing bank.
  Do not "fix" board layout markup without killing the dev cache first
  (`rm -rf .next/dev .next/cache`). Do not trust API-level verification for UI — exercise it in a
  browser. Do not add `'timeout'` to `terminal_reason`. Do not render `distractors` as board tiles.
  Do not add a sixth Connections screening instrument. Do not force-push over `d4fee8c`. Do not
  `git add -A` — course-material PDFs are in the working tree; stage by name.
