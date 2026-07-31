# Current state — 1 August 2026, continued (supersedes the earlier 1 Aug checkpoint)

## Where we are

**Four P0 packages are shipped: G1 (MCQ generator), G2 (term/definition generator), D1 (dashboard),
Q1 (quiz hardening).** The app generates questions from a PDF into `content_items`, serves them
without leaking the answer key, scores server-side, and lands on a registry-driven dashboard.
Migrations `db/005` and `db/006` are applied and verified live on Neon project
`ancient-brook-62806105`.

**Match-the-following (package A1) is now in progress, slice 1 shipped.** The points question that
blocked it is resolved (see Decisions below). Board-grained scoring logic (`lib/games/match.ts`) and
its points table (`lib/games/registry.ts`) are built and tested — **28 tests pass, `tsc --noEmit`
clean.** The API routes and page are being built by a `builder` subagent as this checkpoint is
written; **not yet reviewed or committed.**

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

Branch **`main`**, last commit **`ad129bf`**. **Level with `origin/main`** — everything prior was
already pushed; the earlier checkpoint's "14 commits ahead" was stale.

**Uncommitted right now:**
- Modified: `app/dashboard/page.tsx`, `lib/games/registry.ts`, `tests/registry.test.ts`
- New: `lib/games/match.ts`, `tests/match.test.ts`
- Still in flight from the builder (not yet written to disk as of this checkpoint, or written but
  unreviewed): `app/api/match/board/route.ts`, `app/api/match/submit/route.ts`,
  `app/games/match/page.tsx`, and flipping `match.enabled` to `true` in the registry.

`spike-data/` and root-level `*.pdf` are **gitignored**. `spike-data/` holds all simulation runs and
generated item sets; losing it costs many hours of local inference. New this session:
`spike-data/run-case-arms.sh` / `run-case-arms.log`, `spike-data/run-deck-arms.sh` /
`run-deck-arms.log`, and three new excerpt files: `excerpts-case-tw.json` (19 items),
`excerpts-cage.json` (17), `excerpts-tw.json` (9).

Three source PDFs sit in the repo root, untracked: `_CB0257-PDF-ENG.pdf` (Thoughtworks case),
`Session 7 - Thoughtworks.pdf`, `INM -Session 6_CAGE-...pdf`.

## In progress right now

**A1 (match-the-following) is mid-build.** Slice 1 (board scoring logic + points table + tests) is
done. Slice 2 — the API routes, the page, and flipping `enabled: true` — is being built by a
`builder` subagent in parallel with this checkpoint. **When resumed, check whether that subagent
finished; if the four files listed above exist and look complete, the next step is `reviewer` +
`codex-review`, NOT more building.**

This is a scoring path (`app/api/match/submit/route.ts` computes points server-side from the answer
key), so the mandatory-reviewer rule applies at full force: Q1's first attempt reported success while
still leaking the answer key and returning `correctIndex` on every POST. Check specifically that:
- the board-clues endpoint never leaks the term↔clue mapping (ids + shuffled bare term strings only)
- scoring happens server-side off the DB, not trusted from the client
- both `question_answered` (per pair) and `board_complete` (per board) rows get written, with
  `adapt_granularity` and `boards_completed` populated — first insert anywhere to write either column

Two background Ollama jobs are also running (see below) and must not be interrupted or joined by a
second concurrent Ollama job.

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

**A1 slice 1 shipped: tests 18 → 28, `tsc --noEmit` clean.**
- `lib/games/registry.ts`: new `BoardPoints` points shape (`kind: 'board'` with
  perPair/perfectBonus/floorAtOrBelow/floorPenalty); the `match` entry repoints to it.
  `enabled` is still `false` in this slice, pending the page.
- `lib/games/match.ts` (new, pure, DB-free): `BOARD_SIZE = 6`, `normaliseTerm`, `matchesTerm` (term +
  declared `variants`, case/punctuation-insensitive, **no fuzzy matching by design**), `scoreBoard`,
  `boardSucceeded` (strictly more than half correct — the board-grained analogue of one correct quiz
  answer).
- `tests/match.test.ts` (new, 10 tests): pins the points table, the achievable-score set, the
  negative-EV property, and that the lever never ramps up on a board that also charges the floor.
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
- **Next meeting Tuesday 4 Aug.**

## Next 3 actions

1. **Check on / finish A1 slice 2** (match API routes + page + `enabled: true`), then run `reviewer`
   and `codex-review` on the full diff — mandatory, this is a scoring path.
2. **Live end-to-end check against Neon** once reviewed, then commit and push. Confirm
   `adapt_granularity` and `boards_completed` actually land in the DB on a real board completion.
3. **Run A0 against the CAGE deck** to settle Wordle:
   `node scripts/generate-terms.mjs "INM -Session 6_CAGE- Challenges of Entering Foreign Markets_claude.pdf" --subject "International Management" --per-window 5 --dry-run`
   and read the "Wordle-eligible" line it prints. (Independent of the Ollama jobs — safe to run now.)

After that: pick up the next game or its blocking dependency, and when the two background simulation
jobs finish, read the logs and write up the pooled ρ.

## Do not redo

- **Do not add a per-pair penalty to match** — it double-bills a single error on a bijection board.
- **Do not make the match board all-or-nothing** — it blinds the facility signal and flatlines the
  board-grained lever.
- **Do not pad the match board with `distractors`** — that column is for choose-the-right-word and
  fill-in-the-blanks; padding breaks the bijection the scoring rests on.
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
