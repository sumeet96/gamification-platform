# Current state — 1 August 2026, continued (supersedes the earlier 1 Aug checkpoint)

## Where we are

**Five packages are shipped: G1 (MCQ generator), G2 (term/definition generator), D1 (dashboard),
Q1 (quiz hardening), A1 (match-the-following).** The app generates questions from a PDF into
`content_items`, serves them without leaking the answer key, scores server-side, and lands on a
registry-driven dashboard with three playable tiles. Migrations `db/005`, `db/006` and `db/007` are
applied and verified live on Neon project `ancient-brook-62806105`.

**Match-the-following (package A1) is SHIPPED, COMMITTED and PUSHED.** Commit `fe871e1` on `main`,
level with `origin/main` — 24 files, 2942 insertions. **68 tests pass**, `tsc --noEmit` clean,
`npx next build` succeeds, and it was verified end to end against the live Neon database, not just
unit-tested. The points question that had blocked it is resolved (see Decisions below). Two review
passes (adversarial + Codex) found 17 defects across two rounds before this landed — see "Review
findings worth remembering" below.

**The adaptive-difficulty lever is real for the first time** — all 17 `content_items` rows carry a
calibrated `difficulty`, seeded by local `llama3.2` student simulation and stamped with
`simulator_model` / `simulator_method`. `empirical_p` is still null on every row and must stay that
way until real students answer.

**Voluntary persistence is now measurable.** `round_offer` fires when the Keep Going affordance
renders, so the log distinguishes accepted / declined / abandoned.

**Background simulation work has widened beyond the case.** Two chained Ollama jobs are running
locally (see below) to pool 45 unmemorised items across three sources, aimed at fixing an
underpowered replication claim already flagged in `CLAUDE.md` (ρ ≈ 0.23 on only 15 items).

## Working tree

Branch **`main`**, last commit **`fe871e1`** ("Ship match-the-following, the first board-grained
game"). **Level with `origin/main` and pushed.** Working tree clean — nothing uncommitted.

Shipped in that commit: `app/api/match/board/route.ts`, `app/api/match/submit/route.ts`,
`app/games/match/page.tsx`, `lib/games/match.ts`, `lib/games/match-board-select.ts`,
`lib/games/potential.ts`, `lib/auth/board-token.ts`, `db/007_add_board_dedupe.sql`, plus changes to
`app/api/events/route.ts`, `app/api/stats/route.ts`, `app/dashboard/page.tsx`, `lib/game/engine.ts`,
`lib/games/registry.ts`, `lib/log/logEvent.ts`, `lib/auth/session.ts`. `match.enabled` is `true` in
the registry — the third dashboard tile is live.

`spike-data/` and root-level `*.pdf` are **gitignored**. `spike-data/` holds all simulation runs and
generated item sets; losing it costs many hours of local inference. New this session:
`spike-data/run-case-arms.sh` / `run-case-arms.log`, `spike-data/run-deck-arms.sh` /
`run-deck-arms.log`, and three new excerpt files: `excerpts-case-tw.json` (19 items),
`excerpts-cage.json` (17), `excerpts-tw.json` (9).

Three source PDFs sit in the repo root, untracked: `_CB0257-PDF-ENG.pdf` (Thoughtworks case),
`Session 7 - Thoughtworks.pdf`, `INM -Session 6_CAGE-...pdf`.

## In progress right now

Nothing is mid-build. A1 closed out the item above. The two background Ollama simulation jobs (see
below) are still running and must not be interrupted or joined by a second concurrent Ollama job.
Next up is package A3 (choose-the-right-word) — see Next 3 actions.

## Decisions made this session

### Carried over from the earlier 1 Aug checkpoint (still true)
- `round_offer` added to `EventType` — additive, client-emittable, does not disturb the rule that
  `question_answered` is server-only.
- The per-round difficulty reset is deliberate; the ramp needs two consecutive same-direction answers
  to stop saturating mid-round.
- Five difficulty levels stay (SE ≈ 0.09 at n=30, so ten bands would be false precision).
- The simulator is seeded per (item, student) via Ollama `options.seed`, derived from item id, never
  array position.
- `llama3.2` stays the simulator, on evidence from three model families.
- Cohort is 60–120 students, not ~20.
- A leaderboard (L1) and a global XP bar are wanted; XP must never feed item selection, and any
  motivational overlay must be identical across arms.
- G2's clue-leak rule was wrong and is fixed — multi-word terms only leak if the clue contains every
  content word. Yield went from 3 items to 13 on the same deck.

### New this session

**Match points — RESOLVED (was the top open question). Per board, graded, with a clean-board bonus
and a failure floor.**

The reasoning is load-bearing, not just the number:
- On a bijection board (n clues, n terms, every term used exactly once, **no distractors**), the
  count of correct pairs is the fixed-point count of a permutation. One mistake always drags at least
  one other pair down with it. Out of 6, the achievable scores are 6, 4, 3, 2, 1, 0 — **never 5**. A
  flat per-pair penalty would therefore bill a single error twice. The old registry value
  `{ correct: 15, wrong: -5 } // per pair` was wrong for exactly this reason.
- The reachability rule is "no singleton errors", **not parity** — 3 and 1 are both reachable (a
  3-cycle, or a 5-cycle among the wrong tiles, respectively). This was a live misconception mid-session
  and would silently corrupt any tier-based scoring table if reintroduced — record it explicitly.
- Shipped table: **15 points per correct pair, +30 clean-board bonus, −20 floor penalty if 2 or fewer
  pairs land.** Achievable totals: 6→120, 4→60, 3→45, 2→10, 1→−5, 0→−20.
- The −20 floor is deliberate, not decoration: a random permutation has exactly 1 expected fixed
  point at any board size, so accrual alone would pay 15 points for pure guessing. The floor makes
  guessing negative-EV. A test asserts `perPair + floorPenalty < 0` so the floor can't be quietly
  raised away as "too harsh".
- An all-or-nothing board was considered and **rejected**: it emits no graded facility signal
  (blinding `simulated_p`/`empirical_p` for this game), it flatlines the board-grained lever so
  adaptive difficulty never ramps, and an unreachable jackpot stops being thrilling rather than
  starts. Thrill belongs in the reveal animation, not the payout table.
- Scoring and logging are deliberately at different grains: **score per board, log per pair.**

**A1 shipped in full: tests 18 → 68, `tsc --noEmit` clean, `npx next build` succeeds, verified end to
end against live Neon. Commit `fe871e1`, pushed to `origin/main`.**
- `lib/games/registry.ts`: new `BoardPoints` points shape (`kind: 'board'` with
  perPair/perfectBonus/floorAtOrBelow/floorPenalty); the `match` entry repoints to it. `enabled` is
  now `true` — Match is a live dashboard tile.
- `lib/games/match.ts` (new, pure, DB-free): `BOARD_SIZE = 6`, `normaliseTerm`, `matchesTerm` (term +
  declared `variants`, case/punctuation-insensitive, **no fuzzy matching by design**), `scoreBoard`,
  `boardSucceeded` (strictly more than half correct — the board-grained analogue of one correct quiz
  answer).
- `lib/games/match-board-select.ts` (new): board selection is **least-recently-served ranking**, not
  whole-history exclusion — see the review findings below for why exclusion was rejected.
- `lib/auth/board-token.ts` (new): a signed, single-use board token; issuing a new board supersedes
  the old one.
- `app/api/match/board/route.ts` (new): serves a board's clues and shuffled bare term strings, never
  the term↔clue mapping.
- `app/api/match/submit/route.ts` (new): scores a board server-side off the DB, writes
  `question_answered` per pair and `board_complete` per board.
- `app/games/match/page.tsx` (new): the match UI.
- `db/007_add_board_dedupe.sql` (new, applied and verified on Neon): see below.
- `tests/match.test.ts`, `tests/match-board.test.ts`, `tests/board-token.test.ts`,
  `tests/events-allowlist.test.ts`, `tests/stats-potential.test.ts` (new): pin the points table, the
  achievable-score set, the negative-EV property, board-token single-use/supersession, the
  `EventType`/allowlist derivation, and per-game potential.
- `tests/registry.test.ts`: the "wrong/miss payout" guard was a two-branch if/else that let
  `BoardPoints` fall into the Wordle branch; rewritten as an exhaustive `switch` with a `never`
  default.
- `app/dashboard/page.tsx`: `pointsBlurb` (line 54) had the same two-kinds assumption and would have
  advertised Wordle's economy on the Match tile. Now an exhaustive switch.
- **General lesson recorded:** adding a third `Points` kind surfaced two latent two-kinds assumptions
  in code that had nothing to do with match itself. `never`-defaulted switches are the house idiom
  for this and were already used in `lib/game/engine.ts` — apply it the next time a discriminated
  union grows a case.

**`board_complete` is a new server-written event type**, not added to the client `EventType` union in
`lib/log/logEvent.ts` — same rule already applied to `question_answered`: scored/completion events
that touch points are server-written only. No migration needed; `events.event_type` is unconstrained
text.

**db/007 (applied and verified on Neon `ancient-brook-62806105`):**
- Partial unique index `events_board_nonce_uidx on events (question_id) where event_type =
  'board_complete'`. **Partial is mandatory** — `question_id` already holds `'seed-fallback'` markers
  on ~80 `question_answered` rows across 20 distinct values, so a non-partial unique index would fail
  to build and break the quiz's seed-fallback path.
- `events.submitted_text text` (nullable) — the free-text answer when the answer is not an option
  index. Match writes the placed term; A2/A3 will use it too. No CHECK (append-only log rule).
- `db/004`'s prose describing `boards_completed` as "boards completed so far" is **superseded**: the
  shipped code writes the 1-indexed ordinal of the board being completed.

**Review findings worth remembering (17 defects across two review rounds, two model families):**
- The board never ships its key, but a single clean response was insufficient to protect it —
  **polling GET and intersecting term bags across responses recovered the mapping**. Fixed with a
  signed, single-use board token that is superseded when a new board is issued.
- **Dedupe by SELECT is not atomic on the Neon HTTP driver** — N parallel submits of one token all
  scored. The insert is now the lock, via db/007's partial index.
- `/api/stats` aggregated only `question_answered`, so match's bonus and floor never reached the
  dashboard. Splitting economics across two row types caused this. `potential` is now derived per
  game from `GAME_REGISTRY` (`lib/games/potential.ts`) instead of a hardcoded quiz constant.
- `/api/events` was a **denylist**; it is now an allowlist, and `EventType` is derived from the same
  const array the route uses (`lib/log/logEvent.ts`), so type guard and runtime guard cannot drift.
- **Abandoned-round number reuse regressed** — fixed for the quiz on 1 Aug but in the quiz page, not
  shared code, so match reintroduced it. A shared `abandonRound` helper is planned before A3.
- **Found only by playing the game against the real database, not by static review or unit tests:**
  whole-history exclusion for board selection locked a student out after exactly 8 boards,
  permanently, in every future session — which would have manufactured the ceiling the persistence
  loop exists to measure. Selection is now **least-recently-served ranking**
  (`lib/games/match-board-select.ts`), which degrades instead of starving. General lesson: exercise
  the artifact against real data before believing a package is done — 66 unit tests and two clean
  builds did not catch this.

**Content supply generated this session:** `content_items` now holds **50 `term_definition` rows** —
32 International Management (CAGE deck), 18 Digital Transformation (Thoughtworks case + slides).
A2-ready (has `example_sentence`): 35. A3-ready (≥3 distractors): **50/50**. All have `difficulty`
NULL.
- **Wordle (A4) is effectively settled and should be raised with the professor rather than silently
  cut.** Only 5 of 50 terms are single words of 4–8 letters, and all five are proper nouns: Licca,
  Barbie, Baidu, Bing, Yandex. No *concept* clears the bar; the shortest term on the Thoughtworks case
  deck is 9 characters. A Wordle on this corpus would test brand recall, not understanding.

**Known open gap — needs the professor.** Term items have no calibrated difficulty, and the existing
simulator cannot produce one: `scripts/lib/simulate-students.mjs` ends every prompt with "Answer with
a single letter (A, B, C or D)" — it simulates an MCQ attempt, and a term/definition pair has no
options. Consequences: match asserts NO `difficulty_level` in the event log rather than fabricating
one (correct), but **match's adaptive arm measures nothing** until a match-shaped simulator exists.
Time-lever students are unaffected (difficulty is pinned for them anyway). Options are: build a
match-shaped simulator (new package), ship as-is and document, or mark match `lever: 'none'`. Not
decided.

**Outstanding, not yet decided by the user.** End-to-end testing created **5 test students** and their
event rows in the live research dataset (`e2e-%@test.local`, `session_id like 'e2e-sess-%'`, plus
`starve-%@test.local`). Cleanup SQL was proposed and the user has **not yet approved it**. Record as
pending so it is not forgotten.

**Simulation runs widened from "case only" to case + two slide decks, for two stated reasons:**
1. **Confounded contrast.** The Thoughtworks case differs from the Airbnb baseline in two ways at
   once — probably-unmemorised *and* a different genre (reasoning-heavy case prose, 183–1111 char
   excerpts vs terse slide bullets). Agreement measured on the case alone can't be attributed to
   either variable. CAGE and Thoughtworks slides are unmemorised slide decks, holding genre constant
   while varying only memorisation — the only way to test the genre hypothesis `CLAUDE.md` already
   flags unverified (that the case's reasoning-heavy items let ability help even ungrounded, while
   slide recall items give ability nothing to bite on).
2. **The original finding is underpowered.** ρ ≈ 0.23 was computed on 15 items; its 95% CI is roughly
   [−0.32, +0.66] — consistent with near-perfect agreement. `CLAUDE.md`'s current claim that "the
   difficulty values do not replicate" is not something 15 items can support. Pooling case (19) +
   CAGE (17) + TW slides (9) = 45 unmemorised items roughly halves that CI. Treat this as a
   correction pending the runs, not a settled reversal.
- Known instrument caveat, deliberately left unfixed: the simulation prompt says "this is what you
  remember from the session slide," but the case is a case PDF, not a slide. Left as-is because the
  script header requires flags/seeds/prompt stay fixed for comparability across runs, and the
  mismatch hits both models equally so the llama-vs-gemma comparison itself is unaffected.
- Advanced tier remains only 3 simulated students per item — same small-n caveat as before.

## Long-running simulation jobs (background, ~5h15m total, started this session)

Record the scripts so a fresh session can find and monitor them:
- `spike-data/run-case-arms.sh` → log `spike-data/run-case-arms.log`. Arm C (grounded + retention) on
  the Thoughtworks CASE, 19 items × 30 students, `llama3.2` then `gemma2:9b`. Outputs
  `run-case-llama-retention.json`, `run-case-gemma-retention.json`.
- `spike-data/run-deck-arms.sh` → log `spike-data/run-deck-arms.log`. Arm C on CAGE (17 items) and
  Thoughtworks slides (9 items), `llama3.2` then `gemma2:9b`, grouped by model so each loads once.
  Outputs `run-{cage,tw}-{llama,gemma}-retention.json`.
- The second job is blocked behind the first by three independent guards: it waits for the literal
  string `=== CASE ARMS DONE ===` in the first job's log (bounded at 5h), then polls `ollama ps`
  until idle, then takes an atomic `mkdir spike-data/.ollama-run.lock` mutex (released via an EXIT
  trap). **Nothing may run a second Ollama job while one of these is active** — explicit instruction.

When these finish: read the outputs and write up the pooled ρ, correcting the `CLAUDE.md` claim if
warranted (widen or narrow the CI, do not just assert a new number without showing the pooled
calculation).

## Open questions / blocked on

- **Wordle (A4) may be structurally unviable.** 0 of 13 terms from the Thoughtworks deck are single
  words of 4–8 letters. Run A0 against the CAGE deck before deciding; if it also returns zero, drop
  A4 and tell the professor why. Not yet run.
- **Rapid/normal exact seconds** — working assumption 10s rapid / 15s normal, unconfirmed.
- **The professor has never been asked about a control arm.** "At least we can give them a control"
  in the transcript means a *knob for the student*, not a control group. Raise as a proposal.
- **The research variable across multiple games** — his, and he said he would plan it.
- **Points table numbers**, including whether rapid pays more than normal, and whether match's
  15/30/−20 table needs his sign-off like the other games' placeholder values.
- **Whether the asserted 1–5 difficulty labels discriminate is UNRESOLVED**, and a ceilinged
  simulator cannot answer it (ρ = −0.63 under llama3.2, −0.09 under both gpt-3.5 and gemma, which
  both ceiling).
- **Does simulated facility track real facility?** Needs the pilot.
- **Cross-simulator replication (ρ ≈ 0.23) may be an underpowered artefact of 15 items**, not a real
  finding — pending the case+CAGE+TW pooled run described above.
- **Term items have no calibrated difficulty and the existing simulator cannot produce one** (it
  simulates an MCQ attempt, not a term/definition match). Match's adaptive arm measures nothing until
  this is resolved. Not decided: build a match-shaped simulator, ship as-is and document, or mark
  match `lever: 'none'`.
- **5 test students' event rows are still in the live research dataset** from A1's end-to-end
  verification (`e2e-%@test.local`, `starve-%@test.local`). Cleanup SQL proposed, not yet approved by
  the user.
- **Next meeting Tuesday 4 Aug.**

## Next 3 actions

1. **Build the shared `abandonRound` helper** (in flight) — match reintroduced the abandoned-round
   number-reuse bug that was already fixed for the quiz, because the quiz's fix lived in the quiz page
   rather than shared code. Land this before A3 so a third game does not repeat it.
2. **Package A3, choose-the-right-word.** 50/50 term supply is ready; it reuses `FlatPoints` and
   item-level granularity, so it should be a smaller build than A1.
3. **Run A0 against the CAGE deck** to settle Wordle:
   `node scripts/generate-terms.mjs "INM -Session 6_CAGE- Challenges of Entering Foreign Markets_claude.pdf" --subject "International Management" --per-window 5 --dry-run`
   and read the "Wordle-eligible" line it prints. (Independent of the Ollama jobs — safe to run now.)

After that: read the simulation logs when the background jobs finish and write up the pooled ρ. Raise
with Prof. Singh on Tue 4 Aug: the points table numbers, Wordle's viability, the term-difficulty
calibration gap, rapid/normal exact seconds, and whether there is a control arm.

## Do not redo

- **Do not add a per-pair penalty to match** — it double-bills a single error on a bijection board.
- **Do not make the match board all-or-nothing** — it blinds the facility signal and flatlines the
  board-grained lever.
- **Do not pad the match board with `distractors`** — that column is for choose-the-right-word and
  fill-in-the-blanks; padding breaks the bijection the scoring rests on.
- **Do not select boards by whole-history exclusion** — it locked a student out permanently after 8
  boards in live testing. Selection is least-recently-served ranking
  (`lib/games/match-board-select.ts`).
- **Do not fabricate a `difficulty_level` for match events** — the current simulator cannot produce
  one for term/definition pairs; match correctly logs no difficulty rather than guessing.
- **Do not delete the 5 test-student rows from the live dataset without the user's explicit
  approval** — proposed cleanup SQL is pending, not yet approved.
- **Do not assume match scores come in even numbers only** — 3 and 1 are reachable (odd-length
  cycles); the only forbidden score is 5-of-6 (no singleton errors).
- **Do not run two Ollama jobs concurrently** — the deck-arms job's lock/wait guards exist for
  exactly this; don't add a third job that bypasses them.
- **Do not run the simulation ungrounded and call it difficulty.** Settled on three model families.
- **Do not give every tier the full excerpt** — arm B inverts the ability gradient on all three
  models.
- **Do not switch simulator to gemma2:9b or gpt-3.5-turbo.** Both ceiling (8/15 and 7/15) and both
  recognise the Airbnb deck from training data; gemma is also ~6× slower.
- **Do not add more than five difficulty levels**, and **do not bin by rank position** — ties must
  share a band (`scripts/lib/quintile-difficulty.mjs`).
- **Do not seed the simulator from array position.** Item id only.
- **Do not carry difficulty across rounds**, and do not "fix" the per-round reset.
- **Do not let XP or a leaderboard feed into item selection.**
- **Do not merge `simulated_p` into `empirical_p`**, or `cognitive_level` into either.
- **Do not add a dashboard view event** — `/` redirects to `/dashboard`, so it duplicates
  `session_start`.
- **Do not revert G2's multi-word clue-leak rule** to per-word matching; it rejected 5 of 8 valid items.
- **Do not trust a builder's "done" on scoring or auth without a `reviewer` pass.** Q1's first attempt
  reported success while the answer key still shipped in the JS bundle. Match's submit route is the
  current instance of this rule.
- **Do not `git add -A` with course-material PDFs in the tree** — a 9.8 MB deck was committed by
  accident and had to be amended out. Root `*.pdf` is now gitignored.
- **Gemini prepayment credits are depleted** — every Gemini call 429s. Generation runs on OpenAI
  (`--provider openai`, default `gpt-4.1-mini`).
- **Do not use `thinkingConfig` with `gemini-3.5-flash-lite`** — rejected with a 400.
- **Do not add vitest or jest**, and **do not use `node --test tests/`** — the working form is
  `node --test tests/*.test.ts`.
- **Do not remove `allowImportingTsExtensions`** from `tsconfig.json`.
- **Do not put a CHECK on `events.cognitive_level`** — append-only log on the answer path.
- **Do not reinstate LibreOffice**, add a `passage` content type, or recreate `docs/PROJECT_BACKLOG.md`.
- **Do not learn the professor's spec from summaries.** Read `docs/meeting/Jul 27 at 3-39 PM.txt`.
- All prior "do not redo" items from the 29–31 Jul checkpoints still stand (no Poppler/ImageMagick,
  no npm ZIP library, no `psql`, no bcrypt/argon2, no steering prompt on `codex exec review`).
