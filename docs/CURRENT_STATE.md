# Current state — 8 August 2026

## Where we are

Crossword (package A6) is **fully built, live-verified, and playable end to end** —
`/games/crossword` serves a real board, grading/checks/reveal all work, confirmed against live
Neon event rows. It is the sixth `GAME_REGISTRY` tile. It is **deliberately still
`enabled: false`** — that is the correct, designed end state, not unfinished work. The one thing
genuinely blocking that flag is the lever mechanic (§ "Open questions" below), which this build
intentionally does not implement.

What exists: `db/013_add_crossword.sql` + `db/014_add_crossword_events.sql`, both **applied to
live Neon**; `app/api/crossword/{board,submit}/route.ts`; `app/games/crossword/page.tsx`;
`scripts/author-crossword-boards.mjs` + `scripts/lib/crossword-plan.mjs` (the board-authoring
pipeline); one live board (22 entries, `source_id 1e023f0245ff97a2f72c0ce5`, board id
`b87d4b521bdae291d0ef2bee4467c4fb`). Two independent review passes (`reviewer` + `codex-review`)
ran on the routes before commit and their findings are fixed. The page itself was verified by
actually playing it in a browser, which surfaced and led to fixing one real bug no static check
had caught (see "Decisions" below).

## Working tree

- Branch `main`, clean, fully pushed (`git status` — up to date with `origin/main`, nothing to
  commit).
- Last commit: `2d6f0cf` — "Build crossword end to end: routes, page, board content,
  live-verified". Before it: `b4f0796` (scoring economics), `0510bbd` (scaffold checkpoint).
- Nothing uncommitted.

## In progress right now

Nothing is mid-edit. Session ended at a clean stopping point: game verified playable, everything
committed and pushed, browser tab closed.

**Note for whoever reads `events` next**: `game_type='crossword'` currently has 3
`board_complete`, 3 `check_spent`, 5 `board_served`/`board_token_issued`/`round_start` rows — all
from this session's own end-to-end verification (played on the user's real dev-login account,
`sumeet.ndri@gmail.com`'s dev seed, not a separate test account). These are real event rows with
real timestamps, not fixtures — harmless for a dev database, but don't mistake them for pilot data
if `events` is ever queried before a genuine student cohort exists.

## Decisions made this session

- **Twelve fragment collisions on the live board resolved by the user, by hand** — see
  `spike-data/crossword-board-1e023f0245ff97a2f72c0ce5-review.json` (gitignored, local only) for
  the exact resolution file. Six fragments (ANALYSIS, MINING, DATA, WEB, BIG, IOT) were dropped
  entirely — the user's judgment: "not adding much to things that needs to be remembered in the
  coursework." One entry (VERACITY) was dropped after two genuine LLM retries both failed on a
  pre-existing thin/placeholder source clue (`content_items.clue` = "Identified as one of the
  terms listed under Dimensions of big data...") — not a crossword-specific problem, the same
  placeholder-clue gap already documented in `games-and-content-findings.md` from the Connections
  build.
- **Authoring script gained a `"drop": true` review-file mechanism** (both for collisions and for
  a solo entry whose clue mint keeps failing) — didn't exist until this session's actual review
  round needed it. Moves the item to `excluded` with a recorded reason; never a silent removal.
  See `scripts/author-crossword-boards.mjs`'s step 5/5b comments.
- **A real, live-play-only bug was found and fixed in `app/games/crossword/page.tsx`**:
  `selectEntry()` called `setSelectedEntryId(id)` (React state, async) then synchronously
  `.focus()`ed the new entry's first cell — whose `onFocus` handler (`clickCell`) read the OLD
  `selectedEntryId` via a stale closure, since React hadn't re-rendered yet. Whenever a clicked
  clue's first cell coincided with a lower-ordinal crossing entry's start cell, this silently
  reselected the wrong entry, and everything typed afterward landed in the wrong grid cells. Not
  caught by `tsc`/tests/build — only found by actually playing the built board (confirmed via a
  real `board_complete` row showing 1 correct instead of the 2 that were actually typed). Fixed
  with `selectedEntryRef`, a ref kept synchronously in sync with the state, read by
  `clickCell`/`changeCell`/`keyDownCell` instead of the state closure. Re-verified against the
  exact same crossing scenario afterward — confirmed correct via live event rows.
- **Two real bugs caught in the authoring script's post-write verification query** (and in
  `db/013`'s own documented copy of the same query) on the very first real `--commit`: an
  ambiguous column reference between two joined aliases, and a reference to columns (`x`/`y`/
  `direction`) the query's own CTE never selected in the first place. Fixed in both files by
  removing the unnecessary self-join entirely.
- **Adversarial review (2 passes) on the API routes before commit, per `AGENTS.md`'s standing
  rule.** One HIGH finding fixed: an empty-string grid cell value (the natural default for an
  untouched controlled `<input>`) was being graded `wrong` instead of `not_attempted`, which would
  have broken the core scoring design (0-for-blank, strictly better than a wrong guess) the moment
  the page posted every rendered cell rather than only touched ones. Several MED findings fixed:
  checking an already-completed board was previously allowed; checking a blank (not-attempted)
  entry wasted a budget unit on non-information; a board with some-but-not-all entries retired
  would have silently served a truncated grid instead of failing closed (Codex's independent
  finding, not the primary reviewer's).
- **Two limitations found in review are documented as accepted, not fixed** (both flagged
  explicitly in the route code, not silently shipped): the check-budget spend has the same
  unfixed select-then-insert concurrency race as the still-open `db/012` (Connections' mistake
  budget) — a burst of concurrent `check` requests can spend more than the budget, though it does
  NOT inflate score (`scoreBoard`'s `unused` floors at zero). And a narrow, low-severity replay
  edge case in the `complete` conflict-resolution branch where `reveal.status` could describe a
  different grid than the one actually scored — confirmed to have zero scoring/DB impact.

## Open questions / blocked on

- **The lever mechanic is still fully undesigned and is the only thing blocking `enabled: true`.**
  `lever: 'both'` is declared on the registry entry (deliberately, to stay eligible as a future
  study arm) but genuinely unconsumed — no `resolveLever()` call anywhere in
  `app/games/crossword/page.tsx` or the API routes, by design this session. Research (this
  session, `docs/architecture/games-and-content-findings.md`) found NO existing `lib/game/
  engine.ts` machinery fits a crossword's shape (match's board clock assumes many short,
  repeatable boards with a whole-board pass/fail streak; crossword is one long, non-linear task).
  A real fix needs new engine machinery, not new constants — likely the single largest remaining
  piece of this whole feature if someone decides to build it.
- **Mobile viewport is the simple-scrollable-grid version, not the polished pan-and-zoom one** —
  deliberately deferred per the user's explicit choice this session, not an oversight.
- **The check-budget concurrency race** (see "Decisions" above) — same open-and-documented status
  as `db/012`, not blocking, but real.
- **`db/012` (Connections' mistake-budget concurrency race) is still unwritten** — unrelated to
  this session, still the oldest open item in the project, unchanged.
- **The supervisor still has not been told about the 4 Aug "explore crossword" transcript
  divergence** (`DECISIONS.md` still flags this unreconciled). Building and shipping a working
  crossword makes this more urgent to resolve, not less — this is a human conversation, not
  something a future session can close by writing code.

## Next 3 actions

1. **If the next priority is `db/012`** (oldest open item, unrelated to crossword): start from
   `db/007_add_board_dedupe.sql` and `db/008_add_answer_dedupe.sql` — same check-then-insert race
   shape, fix is making the INSERT itself the lock via a per-serve guess ordinal plus a unique
   index.
2. **If the next priority is making crossword's tile actually clickable**: the lever mechanic is
   the real blocker (see "Open questions"). This is a design task before a build task — decide
   what a crossword-appropriate time-pressure or difficulty signal even looks like before writing
   `TimingProfile` machinery in `lib/game/engine.ts`. Do not skip straight to code.
2b. **Smaller, faster crossword follow-ups if not tackling the lever**: author a second board
   (source-blocked decks are unregistered — same blocker `HANDOFF.md` §20 already documented for
   Connections' board 2/3); or build the polished mobile pan-and-zoom viewport
   (`games-and-content-findings.md` has the recommended approach already written up).
3. **Either way, re-read `DECISIONS.md`'s crossword entries and this file's "Open questions"
   before making further scoring/schema changes** — the check-budget race and the reveal-replay
   edge case are known and accepted, not things to "discover" and re-litigate.

## Do not redo

- **Do not re-run the five-model crossword-vs-Connections RFC, and do not rebuild Connections.**
  Unchanged from prior sessions.
- **Do not re-derive the crossing-density spike or the board-authoring collision-resolution
  policy** — both settled this session (spike-verified density; fully-human-reviewed collisions,
  no algorithmic tie-break, confirmed working via the `"drop": true` mechanism).
- **Do not flip crossword's registry entry to `enabled: true`** without the lever mechanic
  genuinely consuming `resolveLever()` first — recorded in `lib/games/registry.ts`'s crossword
  entry comments, `DECISIONS.md`, and this file. An enabled game with a declared-but-unconsumed
  lever corrupts the event log's meaning.
- **Do not "fix" the check-budget concurrency race or the reveal-replay edge case as a surprise
  side task** — both are known, documented, deliberately deferred (same posture as `db/012`), not
  bugs someone forgot about.
- **Do not trust a browser-automation click/type action without verifying it actually produced an
  effect** — but also do not default to blaming the tooling. This session hit real tool flakiness
  (screenshot API errors, clicks not registering), confirmed by driving the same interactions
  through `document.querySelector(...).click()` and manual DOM value-setting instead, which worked
  reliably. But one symptom recorded here as tooling flakiness — a `computer`-tool `type` action
  "silently dropping most of a word" — was very likely a real app bug, not tooling: the 8 Aug
  session found `maxLength={1}` on the crossword grid cell `<input>` silently swallowing keystrokes
  once typing reached a cell already filled by a crossing entry (fixed to `maxLength={2}`,
  `HANDOFF.md` §23). That is a plausible, arguably more likely, explanation for "dropped" keystrokes
  than automation flakiness, and this note previously reassured readers the app was fine when that
  was never actually confirmed. Any other single-character controlled `<input>` in the codebase may
  carry the same defect and has not been checked. Do NOT skip the browser check itself either way —
  it is exactly what caught the `selectedEntryRef` bug in §22 and the `maxLength` bug in §23; both
  were invisible to API-level and unit-test checks.
- *(Carried forward, unchanged)* Do not assemble a second Connections board from the existing
  bank. Do not "fix" board layout markup without killing the dev cache first
  (`rm -rf .next/dev .next/cache`). Do not add `'timeout'` to `terminal_reason`. Do not render
  `distractors` as board tiles. Do not add a sixth Connections screening instrument. Do not
  force-push over `d4fee8c`. Do not `git add -A` — course-material PDFs are in the working tree;
  stage by name.
