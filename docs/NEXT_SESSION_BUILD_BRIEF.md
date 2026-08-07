# Handoff brief — package A5 (Connections) is SHIPPED; what's left

Written 7 Aug 2026, replacing the build brief that commissioned this package (the original is in git
history at `9324f96`). Read `CLAUDE.md` first, then this. `docs/CURRENT_STATE.md` is older than this
file and is behind on everything below.

**Connections is built, playable, and pushed.** Do not rebuild it. Do not re-run the game-selection
analysis or the Connections-vs-crossword RFC — both are settled and repeating either costs a week.

## 1. What exists now

| | |
|---|---|
| `db/011_add_connections.sql` | **APPLIED** to Neon `ancient-brook-62806105`, verified |
| `lib/games/connections.ts` | pure logic: guess hashing, evaluation, scoring, seeded shuffle, terminal-reason derivation |
| `lib/games/connections-board-select.ts` | least-recently-served board selection |
| `app/api/connections/board/route.ts` | serves a board + signed token |
| `app/api/connections/submit/route.ts` | one route, `kind: 'guess' \| 'complete'` |
| `app/games/connections/page.tsx` | 4×4 grid UI |
| `scripts/author-connections-boards.mjs` | validates + loads curated boards |
| `scripts/mint-connections-tiles.mjs` | screens tile clues to reviewable JSON, never writes |
| Registry | `lever: 'none'`, `adaptGranularity: 'board'`, `PartitionBoardPoints`, `enabled: true` |

253 tests, `tsc --noEmit` clean, `npx next build` succeeds.

Relevant commits: `d4fee8c` (in-progress snapshot, **known-defective, carries a git note saying
so — do not demo or cherry-pick from it**), `cc14fe7` (eight defect fixes + board load + enable),
`feef69a` (UI playability). Fetch notes with `git fetch origin refs/notes/*:refs/notes/*`.

### Live database state
- Board `b1-data-ai` loaded: 4 groups, 16 tiles, subject "Digital Transformation".
- 192 `content_items` (was 180); 12 minted with `recipe = 'connections-tile-v1'`.
- Those 12 are excluded from `app/api/word/question/route.ts` and `app/api/match/board/route.ts`.
- Test rows exist from end-to-end verification under session ids `test-conn-session-1786084374401-*`.
  Exclude them from any analysis; they are real `events` rows.

## 2. Start here — the one known defect

**The mistake budget is not enforced under concurrency.** `boardProgress()` in
`app/api/connections/submit/route.ts` does a SELECT then an INSERT. There are no transactions on the
Neon HTTP driver, so simultaneous guesses all read the same stale prior-mistake count. **Measured: 12
concurrent wrong guesses recorded 7 mistakes, not 4.** Serial play is correct and was verified; this
needs a deliberately concurrent client.

This is the same check-then-insert race `db/007` closed for `board_complete` and `db/008` closed for
`question_answered`, now at a third grain. The fix is the same shape and needs **`db/012`**: make the
INSERT itself the lock. A count constraint is not directly expressible as a unique index, so the
likely approach is a per-serve guess ordinal with a unique index on `(question_id, guess_ordinal)`,
where a losing concurrent insert 409s and retries against a re-read count. Do not try to fix it with
an application-level check — that is what is already there and it is what fails.

## 3. Content is the binding constraint, not the engine

**Only one board exists.** Least-recently-served is built and tested; it has exactly one board to
choose from, so round 2 re-serves the same 16 tiles. `BOARDS_PER_ROUND` is 3, so the UI reads
"Board 1 of 3" and then shows the same board three times. That is content-blocked, not engine-blocked.

**Board 2 (`b2-change-process`) is blocked on an unregistered source deck.** Its design-thinking and
six-thinking-hats groups came from `Session 6,7.pdf`, which has no row in `sources`. `Session 6.pdf`'s
37 pages stop before that content, so they are not the same file. Eight tiles cannot be minted without
it. **Getting that PDF registered and extracted is the single highest-value unblock available.**

**Board 3 (`b3-ai-systems`) is blocked the same way** on `B_5_Agentic_AI_Presentation`.

**Six of the twelve minted clues are placeholders, not definitions** — e.g. "One of the items the
source lists under Dimensions of big data". That is honest about what the deck supports (the slide
merely enumerates the four Vs) and harmless in Connections, where the clue is never rendered. It is
why the `recipe` tag and the two route exclusions exist. Rewrite them before any clue-rendering game
uses those rows.

**A second board cannot be assembled from the existing bank.** Checked: only two groups are both fully
live and cleanly coherent. Two more are available but weak (one substitutes Big data for a
Cybersecurity term that does not exist in the bank; another puts two "agile" terms in one group). A
mushy board is worse than one good board — do not force it.

## 4. Traps that already cost this project time

- **A stale dev server silently breaks layout.** Tailwind had never scanned
  `app/games/connections/page.tsx`, so `grid-cols-4` and `aspect-square` did not exist in the dev
  stylesheet while `grid-cols-2`/`grid-cols-3` (from older pages) did. The board rendered as one
  column. The production build was correct the whole time. **If markup looks wrong only in dev, kill
  the dev server, clear `.next/dev`, restart — before editing working markup.**
- **API-level verification cannot see a UI failure.** Everything was checked over HTTP and passed; the
  board was still unplayable. Exercise the real thing in a browser.
- **A fix can open a hole of the same shape it closed.** Gating `floorPenalty` on `terminal_reason`
  turned that field into a scoring input while it still came from the request body, so a client could
  claim `'abandoned'` and dodge the floor. Hence `deriveTerminalReason()`. When a fix makes a field
  load-bearing, re-ask where that field comes from.
- **Never `git add -A`** — course-material PDFs are in the working tree. Stage by name.
- The `checkSourceLeak` `\blisted in\b` pattern over-rejects legitimate provenance phrasing (it
  refused "Generate quick wins"). Fourth over-rejecting validator in this project; needs its own review.

## 5. Not yet verified

**Whether `session.roundsPlayed` is genuinely shared across games.** A private counter was removed
from the Connections page and `GameConfig` now carries `ownerGameId` so a persisted config cannot
leak between games. Both are covered by unit tests, but the real check — play Connections, then the
quiz, in one browser tab, and confirm round numbers do not collide and `round_offer` is not
suppressed — is React state and was unreachable from the HTTP-level pass. Do this in a browser.

## 6. The thing that is not a build task

**Connections ships with `lever: 'none'`, so it produces no experimental data.** It is an engagement
tile with instrumented content, not a study arm. The artifact's research claim currently rests on the
quiz, match and choose-word. If Connections is still lever-less when the pilot starts, say so
explicitly in the methods section rather than letting it be assumed in.

The user's position, 7 Aug: a lever for a partition game **may not be a clock at all** — the natural
manipulations are tile count, mistake budget, or whether one-away feedback is given. Do not assume
`BOARD_TIME_BASE` with a different number. This is why `terminal_reason`'s CHECK allowlist
deliberately excludes `'timeout'`: adding it would bake in a mechanic that has not been chosen.
Widening that allowlist later is a drop-and-re-add of the named CHECK, per `db/010`.

Still open and unresolved from the RFC: two of five model families argued a difficulty-led design
points away from Connections (a board carries one difficulty for all 16 tiles, so it adapts coarsely)
toward **fill-in-the-blanks**, which is item-grained and already renders as an MCQ so it inherits the
existing calibrator unchanged. Deferred with the lever, not settled by deferring it.

## 7. Suggested order

1. `db/012` — the concurrency race above.
2. Browser play across two games in one tab (§5).
3. Register the design-thinking deck → mint 8 tiles → load board 2. Ask the user for the PDF.
4. Rewrite the 6 placeholder clues so those rows become reusable.
5. Refresh `docs/CURRENT_STATE.md`, which predates all of this.

Ask the user before: applying any migration to live Neon, inserting generated content into
`content_items`, or force-pushing anything. All three came up this session and all three were the
user's call.
