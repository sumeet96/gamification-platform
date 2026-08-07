# Current state — 7 August 2026

## Where we are

Package A5, the Connections game, is **built, verified against live Neon, and pushed** — the
dashboard's fifth tile and second board-grained game. `db/011` is applied, one hand-authored board
(`b1-data-ai`, 4 groups × 4 tiles) is loaded, and the registry row is `enabled: true`. An adversarial
review found seven defects in the first cut and fixing one opened an eighth; all eight are closed and
covered by tests. What is *not* finished is content: only one board exists, so a second round
re-serves the same 16 tiles, and boards 2 and 3 are blocked on source decks that were never
registered in `sources`. One real defect is knowingly shipped and documented — the mistake budget is
not enforced under concurrency.

## Working tree

- Branch `main`, clean, fully pushed (`## main...origin/main`, nothing ahead).
- Last commit: `8665a6d` — "Hand off: Connections is shipped, content is now the constraint".
- Also this session: `feef69a` (UI playability), `cc14fe7` (eight defect fixes + board load +
  enable), `d4fee8c` (in-progress snapshot committed by a *parallel session*, not by this one).
- Nothing uncommitted.
- **`d4fee8c` carries a git note marking it known-defective** (its board serve is solvable by
  decoding its own token). The note is pushed to `refs/notes/commits`; a fresh clone must run
  `git fetch origin refs/notes/*:refs/notes/*` to see it. It was NOT amended — it was already
  pushed and a parallel session was active, so force-pushing was rejected as too risky.
- `spike-data/` is gitignored; `spike-data/connections-mint-candidates.json` (22 tiles, 12 approved)
  exists locally only.

## In progress right now

Nothing is mid-edit. The session ended at a clean stopping point: everything committed, dev server
stopped, browser tab closed.

The next task is **`db/012`**, which has not been started. It must close a concurrency race in
`app/api/connections/submit/route.ts`: the function `boardProgress(sql, nonce)` does a SELECT and
then the route INSERTs, and there are no transactions on the Neon HTTP driver, so simultaneous
guesses all read the same stale prior-mistake count. **Measured: 12 concurrent wrong guesses recorded
7 mistakes, not the 4 the budget allows.** Serial play is correct and was verified end to end.

Start from `db/007_add_board_dedupe.sql` and `db/008_add_answer_dedupe.sql` — this is the identical
check-then-insert race they each closed at their own grain, and the fix shape is the same: make the
INSERT itself the lock. A count cap ("at most 4 wrong rows per serve") is not directly expressible as
a unique index, so the likely design is a per-serve guess ordinal plus a unique index on
`(question_id, guess_ordinal) where event_type = 'guess_submitted'`, with a losing concurrent insert
returning 409 and retrying against a re-read count. `isMistakeBudgetExhausted()` in
`lib/games/connections.ts` is the existing predicate; it is correct and is not the problem.

**Do not fix this at the application level — that is exactly what is there now and what fails.**

## Decisions made this session

- **Connections ships with `lever: 'none'` and no difficulty** — confirmed by the user. The 90s
  `BOARD_TIME_BASE` was sized for a 6-pair match board and would produce a floor effect on a 16-tile
  search that *looks like working data*; and no `term_definition` row has a difficulty value, so a
  tiebreak would have nothing to sort on.
- **A future lever for this game may not be a clock at all** — user's position, 7 Aug. The natural
  manipulations for a partition game are tile count, mistake budget, or whether one-away feedback is
  given. Consequence: `terminal_reason`'s CHECK deliberately **excludes `'timeout'`**, because adding
  it would bake in a mechanic nobody has chosen. Widening it later is a drop-and-re-add of the named
  CHECK, per `db/010`.
- **Boards are hand-authored, not generated** — three of five model families recommended it; removes
  the largest work block and the largest correctness risk.
- **`connection_boards` has NO `board_token` column** — the original brief specified one; it was
  wrong. A board token is a per-serve nonce from `lib/auth/board-token.ts`; persisting it would make
  it a static reused secret and let one student replay another's submission.
- **Guess dedupe is keyed on the board token nonce, not `board_id`** — `(question_id, guess_hash)`.
  Least-recently-served reorders and never excludes, so one session legitimately replays a board; a
  `board_id`-keyed index would have rejected the replay's guesses as duplicates. Verified empirically.
- **`terminal_reason` is derived server-side, never read from the request body**
  (`deriveTerminalReason()` in `lib/games/connections.ts`). Gating `floorPenalty` on it had quietly
  made it a scoring input, so a client could claim `'abandoned'` after busting the budget and dodge
  the floor.
- **`'none'` is a first-class inert value inside `resolveLever()`**, not a branch around it — the
  both-levers-never-active-at-once guarantee stays one tested chokepoint. `Mode` had to be widened
  too; the alternative was writing a bogus `'normal'` into the research log.
- **Config carries `ownerGameId`** and the guard lives in `lib/game/game-context.tsx`, not per-game —
  `lever:'none'` was leaking through sessionStorage into the quiz. A per-game guard is the shape that
  let match reintroduce the abandoned-round bug two days after the quiz fixed it.
- **Loosened the clue bar for Connections tiles only**, tagged `recipe = 'connections-tile-v1'` and
  excluded from `app/api/word/question/route.ts` and `app/api/match/board/route.ts`. The clue is never
  rendered in Connections; it *is* rendered by those two games, where an under-specified clue produces
  the unanswerable item that scored 0.10 grounded. Grounding in the deck was **not** loosened.
- **Ship one board and say so plainly** rather than padding with two medium-confidence groups (one
  substituted Big data for a Cybersecurity term absent from the bank; another put two "agile" terms in
  one group).
- **Fix forward rather than rewrite history** on the already-pushed defective commit.

## Open questions / blocked on

- **Board 2 needs `Session 6,7.pdf`** (design thinking, Six Thinking Hats) registered in `sources`
  and extracted. Eight tiles cannot be minted without it. `Session 6.pdf`'s 37 pages stop before that
  content, so they are not the same file. **Unblocked by: the user supplying the PDF.** This is the
  single highest-value unblock available.
- **Board 3 needs `B_5_Agentic_AI_Presentation`** registered, same problem.
- **Is `session.roundsPlayed` genuinely shared across games?** A private counter was removed and
  `ownerGameId` added; both are unit-tested, but the real check is React state and was unreachable
  from the HTTP-level pass. **Unblocked by: playing Connections then the quiz in one browser tab and
  confirming round numbers do not collide and `round_offer` is not suppressed.**
- **Six of the twelve minted clues are placeholders**, not definitions (e.g. "One of the items the
  source lists under Dimensions of big data"). Harmless in Connections; must be rewritten before any
  clue-rendering game uses those rows.
- **`checkSourceLeak`'s `\blisted in\b` pattern over-rejects** legitimate provenance phrasing — it
  refused "Generate quick wins". Fourth over-rejecting validator in this project; needs its own review.
- **Still unresolved from the game-4 RFC:** two of five model families argued a difficulty-led design
  points away from Connections (a board carries one difficulty for all 16 tiles, so it adapts
  coarsely) toward **fill-in-the-blanks**, which is item-grained and already renders as an MCQ so it
  inherits the calibrator unchanged. Deferred with the lever, not settled by deferring it.
- **Connections produces no experimental data.** With `lever: 'none'` it is an engagement tile and
  instrumented content, not a study arm. The research claim rests on quiz, match and choose-word. If
  it is still lever-less at pilot start, that belongs in the methods section explicitly.

## Next 3 actions

1. **Write `db/012` to close the mistake-budget concurrency race.** Start by reading
   `db/008_add_answer_dedupe.sql`, then `boardProgress()` and the `'guess'` branch of
   `app/api/connections/submit/route.ts`. Do not apply it to Neon without asking the user.
   Reproduce first: fire ≥5 distinct wrong guesses simultaneously at `/api/connections/submit` on a
   fresh board and confirm more than 4 mistakes land.
2. **Play Connections then the quiz in one browser tab** and confirm round numbers do not collide.
   `npm run dev`, then `/games/connections` → play a round → `/quiz`. Check `events` for duplicated
   `(session_id, round)` across `game_type` and for a missing `round_offer`.
3. **Ask the user for the design-thinking deck**, register it in `sources`, extract it, then
   `node scripts/mint-connections-tiles.mjs` for the 8 blocked tiles and
   `node scripts/author-connections-boards.mjs --boards b2-change-process --mint-file spike-data/connections-mint-candidates.json --dry-run`
   before `--commit`.

## Do not redo

- **Do not rebuild Connections, and do not re-run the game-selection analysis or the
  crossword-vs-Connections RFC.** Both settled; repeating either costs a week.
- **Do not assemble a second board from the existing 113-row bank.** Already checked: only two groups
  are both fully live and cleanly coherent. A mushy board is worse than one good board.
- **Do not "fix" the board layout markup if it renders as one column in dev.** Tailwind had never
  scanned `app/games/connections/page.tsx`, so `grid-cols-4` and `aspect-square` were absent from the
  dev stylesheet while `grid-cols-2`/`grid-cols-3` from older pages were present. The production
  build was correct the whole time. **Kill the dev server, `rm -rf .next/dev .next/cache`, restart.**
- **Do not trust API-level verification for UI.** Everything passed over HTTP while the board was
  unplayable. Exercise it in a browser.
- **Do not add `'timeout'` to the `terminal_reason` allowlist** as a convenience. See the decision
  above — it presumes a mechanic that has not been chosen.
- **Do not render `distractors` as board tiles.** They are generated strings; a student who correctly
  sorts a fabricated term learns it as real. Use them offline as a confusability signal only.
- **Do not add a sixth Connections screening instrument.** The instrument-dependence *is* the finding.
- **Do not force-push over `d4fee8c`.** It is pushed, a parallel session was active, and the git note
  already records the defect.
- **Do not `git add -A`** — course-material PDFs are in the working tree. Stage by name.
