# Current state — 1 August 2026, continued (supersedes the A1 checkpoint)

## Where we are

**Six packages are shipped: G1 (MCQ generator), G2 (term/definition generator), D1 (dashboard),
Q1 (quiz hardening), A1 (match-the-following), A3 (choose-the-right-word).** The app generates
questions from a PDF into `content_items`, serves them without leaking the answer key, scores
server-side, and lands on a registry-driven dashboard with four playable tiles. Migrations
`db/005` through `db/008` are applied and verified live on Neon project `ancient-brook-62806105`.

**A3, choose-the-right-word, is SHIPPED, COMMITTED and PUSHED.** Commit `1805d62` on `main` —
22 files, 2404 insertions. **100 tests pass**, `tsc --noEmit` clean, `npx next build` succeeds,
verified end to end against live Neon, including a deliberate 12-way concurrency salvo and a full
50-item round.

**The adaptive-difficulty lever is real for the first time** — all 17 MCQ `content_items` rows
carry a calibrated `difficulty`, seeded by local `llama3.2` student simulation and stamped with
`simulator_model` / `simulator_method`. `empirical_p` is still null on every row and must stay that
way until real students answer. The 50 `term_definition` rows still have no `difficulty` — see
Decisions below for why that gap is now smaller than previously recorded.

**Voluntary persistence is measurable.** `round_offer` fires when the Keep Going affordance
renders, so the log distinguishes accepted / declined / abandoned. `abandonRound()` is now a
shared obligation (`lib/game/game-context.tsx`), closing the gap where match had reintroduced a
bug already fixed once for the quiz.

**A same-question concurrency race, present since Q1, is closed.** 12 concurrent POSTs for one
question used to all score (12× points, 11 excess rows); after db/008 the same salvo yields
exactly 1 scored row and 11 idempotent 409s, verified live. This was not an A3 regression — A3
inherited the exposure via the shared extraction described below, and closing it fixed the quiz
and match's submit path along with word.

**The cross-simulator replication claim is corrected** (see Decisions below): the previously
recorded ρ ≈ 0.23 was measured on a memorised deck; pooled across unmemorised, genre-matched slide
decks the two simulators agree at ρ = 0.62, CI [0.26, 0.83].

## Working tree

Branch **`main`**, last commit **`1805d62`** ("Ship choose-the-right-word, and close a race the
quiz has had since Q1"). Working tree clean.

New files: `app/api/word/question/route.ts`, `app/api/word/answer/route.ts`,
`app/games/word/page.tsx`, `lib/game/answer-commit.ts`, `lib/games/item-select.ts`,
`lib/games/word.ts`, `db/008_add_answer_dedupe.sql`, `tests/answer-commit.test.ts`,
`tests/item-select.test.ts`, `tests/word.test.ts`. Modified: `app/api/answer/route.ts`,
`app/quiz/page.tsx`, `app/games/match/page.tsx`, `app/dashboard/page.tsx`,
`lib/game/game-context.tsx`, `lib/games/registry.ts`, `lib/games/match-board-select.ts`,
`lib/log/logEvent.ts`, `scripts/lib/terms-validate.mjs`, `db/schema.sql`.

`spike-data/` and root-level `*.pdf` are **gitignored**. `spike-data/` holds all simulation runs and
generated item sets; losing it costs many hours of local inference.

Three source PDFs sit in the repo root, untracked: `_CB0257-PDF-ENG.pdf` (Thoughtworks case),
`Session 7 - Thoughtworks.pdf`, `INM -Session 6_CAGE-...pdf`.

## The game (A3)

Clue is the prompt, term is the answer, `distractors` supply the wrong options (4 options shown).
Item-grained, `FlatPoints` 15/−5 — reuses the quiz's shapes unchanged. A3 went before A2
(fill-in-the-blanks) because all 50 term rows have ≥3 distractors while only 35 have an
`example_sentence`.

## In progress right now

Nothing is mid-build. A3 closed out the item above.
`spike-data/run-simulator-bakeoff.sh` (log `run-simulator-bakeoff.log`) is running in the
background: pulls `llama3.2:1b`, `qwen2.5:1.5b`, `gemma2:2b` and runs arm C on the CAGE deck
(17 items × 30 students) for each, sequentially, behind the ollama-idle + mutex guards. Outputs
`spike-data/bakeoff-<model>.json`. Must not be interrupted or joined by a second concurrent Ollama
job.

## Decisions made this session

### Carried over from the earlier 1 Aug checkpoint (still true)
- `round_offer` added to `EventType` — additive, client-emittable, does not disturb the rule that
  `question_answered` is server-only.
- The per-round difficulty reset is deliberate; the ramp needs two consecutive same-direction answers
  to stop saturating mid-round.
- Five difficulty levels stay (SE ≈ 0.09 at n=30, so ten bands would be false precision).
- The simulator is seeded per (item, student) via Ollama `options.seed`, derived from item id, never
  array position.
- `llama3.2` stays the simulator as the working default, on evidence from three model families —
  but see the new discrimination criterion below, which is now the stated reason, not weakness.
- Cohort is 60–120 students, not ~20.
- A leaderboard (L1) and a global XP bar are wanted; XP must never feed item selection, and any
  motivational overlay must be identical across arms.
- G2's clue-leak rule was wrong and is fixed — multi-word terms only leak if the clue contains every
  content word. Yield went from 3 items to 13 on the same deck.
- Match points are resolved (15/pair, +30 clean-board bonus, −20 floor at ≤2 pairs) and boards are
  selected by least-recently-served ranking, not whole-history exclusion. See the A1 checkpoint
  history in git for the full reasoning; both stand unchanged this session.

### New this session (A3)

**The quiz's hardened commit path was EXTRACTED, not copied**, into `lib/game/answer-commit.ts`
(cookie-only attribution, the `client_student_id` mismatch downgrade, `is not distinct from`
dedupe, the 23503 FK retry). Both `/api/answer` and `/api/word/answer` consume it. Two reviewers
independently verified line-by-line that the extraction is behaviour-preserving for the quiz,
including the properties its comments record: the `'seed-fallback'` marker, the 409 that must not
carry `correctIndex`, `round_net_before` staying informational-only, and scoring still being
returned when logging fails.

**`abandonRound()` is now a shared obligation** in `lib/game/game-context.tsx`, exposed via
`useGame()`, documented next to `round_stop` in `lib/log/logEvent.ts`. Every path that ends a
started round without finishing must call it. The abandoned-round bug was fixed for the quiz on
1 Aug *inside the quiz page*, and match reintroduced it two days later — the shared helper closes
that seam. "Declined an offer" (a direct `round_stop` from the Keep Going screen) stays DISTINCT
in the data from "abandoned" — do not blur them.

**Selection ranking is shared** (`lib/games/item-select.ts`); `match-board-select.ts` delegates to
it after picking a subject. Match's behaviour is unchanged (`tests/match-board.test.ts` untouched
and passing).

**Round exhaustion is a distinct outcome from an empty pool.** `GET /api/word/question` returns
`409 'round exhausted'` (items already answered in this session+round are excluded) versus
`409 'not enough term items'` (the content pool itself is too small). The page treats the first as
a graceful early round-end running the normal `round_offer`/`round_continue`/`round_stop` flow —
NOT as abandonment. Necessary because normal mode is 20 questions against a ~50-item pool.

**db/008 — APPLIED and verified on Neon `ancient-brook-62806105`.** Partial unique index making
the answer insert its own lock:
`events_answer_commit_uidx on events (session_id, round, content_item_id, student_id,
boards_completed) NULLS NOT DISTINCT where event_type='question_answered' and content_item_id is
not null`.
- `NULLS NOT DISTINCT` is required (Postgres 18.4 confirmed on this server). Without it, NULL
  `student_id` and NULL `boards_completed` would each count as distinct and the index would dedupe
  nothing.
- `boards_completed` is in the key because **match legitimately writes the same `content_item_id`
  twice within one `(session, round)` across different boards**. All 18 of match's apparent
  duplicate groups were exactly that; ZERO were true duplicates. A naive key without that column
  would break match.

**The race — proven, not theorised.** 12 concurrent POSTs for one question ALL scored: 12× points,
11 excess `question_answered` rows. This was not an A3 regression — `app/api/answer/route.ts` has
had the identical SELECT-then-INSERT since package Q1, and A3 inherited it via the extraction.
After db/008 the same salvo yields exactly 1 scored row and 11 idempotent 409s, verified live.

**The 409 is now idempotent**: it returns the originally recorded result (`correct`,
`pointsDelta`, correct answer, `duplicate: true`). Safety argument, reviewed and accepted: it
awards nothing (no new row) and reveals nothing new (the answer was already returned by the commit
that scored). Two conditions were required and implemented — `netAfter` must be read from the
stored column, never recomputed from the replayed request; and the client gates accumulation on
"have I already applied a result for this itemId", never on "did this fetch return ok".

**Ten defects found by two reviewers — the memorable ones:**
- `choose-word` was still `enabled: false`, so the package would have **shipped invisible** behind
  a dead dashboard tile.
- `resetSession` cleared `offeredRoundRef` but NOT `abandonedRoundRef` — silently reviving
  round-number reuse across students on a shared tab, through the very helper added to prevent it.
- An item with zero distractors rendered as a **one-option question worth a guaranteed +15** (a
  wrong answer was unrepresentable). Eligibility now requires ≥3 distractors.
- `-Infinity - -Infinity === NaN`, so the difficulty tiebreak was dead while still reporting
  `difficultyHonored: true` — a false claim in the event log that the whole uncalibrated path
  exists to prevent. Fixed with a finite sentinel; the test that "covered" it only passed by
  fixture ordering and was rewritten.
- One calibrated row would have collapsed the entire pool (a vacuous `>= count` guard); now
  requires an absolute minimum of 20 calibrated rows.
- A distractor could equal a declared variant, making two options correct. `terms-validate.mjs`
  now rejects that. 0 collisions among the 50 existing rows (checked under a looser SQL
  normalisation, so it is an upper bound).
- **Found by neither reviewer, only by playing it:** the question route COMPUTED
  `difficultyHonored` and never sent it in the response, so the page's Level badge was hidden for
  the wrong reason and would have stayed hidden after calibration landed. This is the second
  instance of the standing rule — exercise the artifact, cross-agent seams fail silently. (The
  first instance was A1's whole-history board exclusion, found only by playing the game.)

**CORRECTION — term items ARE calibratable now.** Earlier checkpoints and CLAUDE.md said term
items cannot be difficulty-calibrated because the simulator is MCQ-only ("answer A, B, C or D")
and a term/definition pair has no options. That is now outdated. A3 renders each term item as a
clue plus four options built from `distractors` — i.e. an MCQ. So all 50 term rows are calibratable
today with a rendering shim (clue as stem, term+distractors as options), no new method. Match can
borrow that per-item estimate as a defensible proxy, since a match board is essentially six
simultaneous choose-word items with elimination. This shrinks "match's adaptive arm measures
nothing" from a research package to a rendering change. Still true meanwhile: no term row has a
difficulty yet, so `difficultyHonored` is false everywhere for word and match, and the Level badge
is correctly hidden.

**CORRECTION — cross-simulator replication.** All arm-C runs finished (llama3.2 vs gemma2:9b,
grounded + retention-gated, n=30 per item). Spearman ρ between the two simulators:

| deck | items | ρ (all) | ρ (ties excluded) | gemma at ceiling |
|---|---|---|---|---|
| Airbnb slides (memorised baseline) | 15 | 0.23 | 0.14 | 8/15 |
| CAGE slides (unmemorised) | 17 | 0.75 | 0.70 | 8/17 |
| Thoughtworks slides (unmemorised) | 9 | 0.75 | 0.44 | 5/9 |
| Thoughtworks case (unmemorised) | 19 | 0.46 | 0.06 | 16/19 |

Pooled genre-matched slide decks: **ρ = 0.62, 95% CI [0.26, 0.83]** (excludes zero). Memorised
baseline: ρ = 0.14, CI [−0.42, 0.62].

**Interpretation:** the previously standing claim was "the difficulty values do not replicate,
ρ ≈ 0.23". That figure came from the Airbnb deck — the one the other model families recognise from
training data. On unmemorised material the same two simulators agree substantially better on both
the permissive and conservative measures. The memorisation hypothesis is **supported**. Limits
stay explicit: the CI is not tight; only two simulators; `gemma2:9b` ceilings badly everywhere so
it remains a poor instrument regardless (this does NOT reopen keeping `llama3.2`); the
ties-excluded filter is a researcher choice, which is why both numbers are reported.

**The genre control was decisive.** Pooling all three unmemorised decks together (case + both slide
decks) gives ρ = 0.36, CI [−0.01, 0.64] — ambiguous. The case ceilings at 16/19 under gemma and
contributes almost no ranking information. Had the run been case-only as the earlier checkpoint
specified, the result would have been ρ = 0.46/0.06 and the opposite conclusion. Only the two
genre-matched slide decks are pooled for the headline 0.62 figure above.

**Simulator selection criterion — corrects a standing claim.** CLAUDE.md's "weaker models simulate
students better" framing is not the selection rule in practice. The bake-off in flight (see above)
selects on **discrimination, not weakness**: what has broken every run so far is CEILING (an item
scored ~1.0 carries no ranking information), not a model being too strong per se. Target: mean
facility ~0.50–0.65, <~20% at ceiling, <~10% at floor, a MONOTONIC gradient across the four
retention tiers (guards against a model at chance, which shows no gradient and measures noise),
and IQR > ~0.3. `llama3.2` (3B) sits slightly too able at 0.71–0.79 on some decks. All inference is
100% CPU, so smaller models are dramatically faster (gemma2:9b ~108 min per deck vs llama3.2 ~25).

## Test data

All end-to-end test students and events were deleted with the user's explicit approval; 2 real
students and 104 real events remain untouched. The earlier "pending cleanup" item is resolved.

## Next actions

1. Read the bake-off results and pick a simulator against the discrimination criterion above;
   whichever wins, `llama3.2` becomes the replication partner (one simulator is still one
   measurement).
2. Calibrate the 50 term rows via the choose-word MCQ rendering, writing `simulated_p` and binned
   `difficulty` — never `empirical_p`. This unblocks the Level badge for word and gives match a
   defensible per-item proxy.
3. Package A2 (fill-in-the-blanks, 35 rows have `example_sentence`), or L1 leaderboard.
4. Tue 4 Aug with Prof. Singh: points table numbers, Wordle's viability (5 of 50 terms qualify and
   all five are proper nouns — Licca, Barbie, Baidu, Bing, Yandex), rapid/normal exact seconds,
   whether there is a control arm, and the term-difficulty calibration plan.

## Open questions / blocked on

- **Wordle (A4) may be structurally unviable.** Only 5 of 50 terms across both decks are single
  words of 4–8 letters, and all five are proper nouns. No *concept* clears the bar. Raise with the
  professor rather than silently cutting it.
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
- **Term items now have a calibration path (the MCQ rendering shim) but no calibrated values yet.**
  Next action 2 above closes this.
- **Next meeting Tuesday 4 Aug.**

## Do not redo

- **Do not add a per-pair penalty to match** — it double-bills a single error on a bijection board.
- **Do not make the match board all-or-nothing** — it blinds the facility signal and flatlines the
  board-grained lever.
- **Do not pad the match board with `distractors`** — that column is for choose-the-right-word and
  fill-in-the-blanks; padding breaks the bijection the scoring rests on.
- **Do not select boards (or word items) by whole-history exclusion** — it locked a student out
  permanently after 8 boards in live testing. Selection is least-recently-served ranking, shared
  via `lib/games/item-select.ts`.
- **Do not copy the quiz's answer-commit logic into a new game — extract and share it via
  `lib/game/answer-commit.ts`.** A3 followed this; the quiz, match's submit path, and word's answer
  route all benefited from the same race fix in one place.
- **Do not add a new "declined a round" state that blurs with abandonment** — `round_stop` (a
  direct decline) and an unresolved `round_offer` (abandonment) must stay distinct in the log.
- **Do not claim `difficultyHonored: true` without sending it in the API response** — the badge
  bug that shipped silently under two reviews and 100 tests.
- **Do not assume match scores come in even numbers only** — 3 and 1 are reachable (odd-length
  cycles); the only forbidden score is 5-of-6 (no singleton errors).
- **Do not run two Ollama jobs concurrently** — the bake-off's lock/wait guards exist for exactly
  this; don't add a second job that bypasses them.
- **Do not run the simulation ungrounded and call it difficulty.** Settled on three model families.
- **Do not give every tier the full excerpt** — arm B inverts the ability gradient on all three
  models.
- **Do not switch simulator to gemma2:9b or gpt-3.5-turbo without re-checking the bake-off.** Both
  ceiling badly (8/15 and 7/15 on the Airbnb baseline) and both recognise course decks from
  training data; gemma is also ~6× slower. The bake-off may still surface a better small-model
  alternative — that is what it is for.
- **Do not add more than five difficulty levels**, and **do not bin by rank position** — ties must
  share a band (`scripts/lib/quintile-difficulty.mjs`).
- **Do not seed the simulator from array position.** Item id only.
- **Do not carry difficulty across rounds**, and do not "fix" the per-round reset.
- **Do not let XP or a leaderboard feed into item selection.**
- **Do not merge `simulated_p` into `empirical_p`**, or `cognitive_level` into either.
- **Do not add a dashboard view event** — `/` redirects to `/dashboard`, so it duplicates
  `session_start`.
- **Do not revert G2's multi-word clue-leak rule** to per-word matching; it rejected 5 of 8 valid
  items.
- **Do not trust a builder's "done" on scoring or auth without a `reviewer` pass.** Q1's first
  attempt reported success while the answer key still shipped in the JS bundle. A3's concurrency
  race is the current instance of this rule paying off.
- **Do not `git add -A` with course-material PDFs in the tree** — a 9.8 MB deck was committed by
  accident and had to be amended out. Root `*.pdf` is now gitignored.
- **Gemini prepayment credits are depleted** — every Gemini call 429s. Generation runs on OpenAI
  (`--provider openai`, default `gpt-4.1-mini`).
- **Do not use `thinkingConfig` with `gemini-3.5-flash-lite`** — rejected with a 400.
- **Do not add vitest or jest**, and **do not use `node --test tests/`** — the working form is
  `node --test tests/*.test.ts`.
- **Do not remove `allowImportingTsExtensions`** from `tsconfig.json`.
- **Do not put a CHECK on `events.cognitive_level`** — append-only log on the answer path.
- **Do not reinstate LibreOffice**, add a `passage` content type, or recreate
  `docs/PROJECT_BACKLOG.md`.
- **Do not learn the professor's spec from summaries.** Read
  `docs/meeting/Jul 27 at 3-39 PM.txt`.
- All prior "do not redo" items from the 29–31 Jul checkpoints still stand (no Poppler/ImageMagick,
  no npm ZIP library, no `psql`, no bcrypt/argon2, no steering prompt on `codex exec review`).
