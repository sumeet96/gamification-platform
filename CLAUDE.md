# CLAUDE.md — Gamified Adaptive Learning Platform

Read `HANDOFF.md` for full project history. Read `docs/PROJECT_MAP.md` next — it is the project
spine: decomposition, work packages, and what is decided vs assumed. This file is the working brief.

## What we're building
A gamified adaptive-learning dashboard — the dashboard is the spine and the quiz is one tile in it,
per the professor's first instruction (`docs/meeting/Jul 27 at 3-39 PM.txt`). **Built 31 Jul 2026**
(package D1): `app/dashboard/page.tsx` renders one tile per entry in `GAME_REGISTRY`
(`lib/games/registry.ts`), the single source of truth for what games exist and how each scores.
Points are fixed *within* a game and vary *across* games and difficulty —
that spread is the intended "high and low" feeling, not a flat rate. Each student was to pick exactly
one adaptivity lever: either adaptive difficulty (which ramps up/down per performance) or time
pressure (clock tightens), never both. **Superseded, reported 1 Aug 2026 (not yet transcribed):** the
professor has reportedly dropped the adaptive-difficulty lever — difficulty tagging proved difficult,
and every student is to get time pressure. See "Core design rules" below for the full status, the
open experimental-design gap this creates, and why the machinery stays in the codebase. Rapid and
normal modes. A "keep going → next round" loop drives
persistence. Course material is not a build prerequisite — the professor said any PDF on any topic
works for building the pipeline — but the pilot itself is Prof. Singh's Digital Transformation course
(~20 sessions), from ~mid-Sept 2026. The artifact is a Design Science Research piece; per-question
event logging is the research dataset.

## Core design rules
- **Dashboard is the spine, quiz is one tile.** "You need to have a dashboard kind of a thing where
  quiz is one part of it... start with the dashboard" (`docs/meeting/Jul 27 at 3-39 PM.txt`). This was
  the professor's first instruction; **shipped 31 Jul 2026** as package D1 — see `docs/PROJECT_MAP.md`
  §3.
- **Points: fixed within a game, varying across games and difficulty.** Corrected 30 Jul 2026 against
  the transcript — "Fixed point economy: +20/−10 everywhere" was a misreading. A hard game pays more
  than an easy one; that variability is the mechanic the professor asked for, resolved by a published,
  predictable points table (values are placeholders pending his sign-off; see `docs/PROJECT_MAP.md` §1).
- **SUPERSEDED 1 Aug 2026 — one adaptivity lever per student:** adaptive difficulty (ramps) or time
  pressure (clock). Not both. Clean experimental design. Kept here, marked superseded rather than
  deleted, because it is the rule that made the levers a two-arm experiment in the first place.
  - _Superseded by, reported 1 Aug 2026, NOT YET TRANSCRIBED:_ per the user, Prof. Singh has said to
    drop the adaptive-difficulty lever — difficulty tagging is proving difficult — and stick with time
    pressure for everyone. The project rule that professor decisions cite a transcript in
    `docs/meeting/` (five drifts were found on 30 Jul 2026 by re-reading one) applies here: there is no
    transcript or recording for this yet. Treat as reported, not settled, until one exists.
  - **OPEN AND URGENT: this removes the between-arm contrast.** The difficulty-vs-time split WAS the
    independent variable. If everyone gets time pressure, nothing is established to vary between
    conditions — time-on vs time-off? rapid vs normal? something else? Without a contrast there is no
    experiment, only an instrumented app. This is the top item for the 4 Aug meeting, ahead of any
    further build work that assumes a design.
  - **Difficulty moves from item-selection INPUT to analysis COVARIATE, not out of the project.** Even
    under random or least-recently-served item assignment, item difficulty is still needed to say
    anything credible about a time-pressure effect — otherwise a student who drew harder items merely
    looks slower. It also opens whether time pressure hurts disproportionately on hard items. The
    calibration work below (bake-off, term-MCQ rendering) keeps a home in the paper.
  - **Do not delete the adaptive machinery.** The "delete obsoleted machinery" convention below was
    written for code that never changed an outcome; this is a working, tested capability the professor
    may want back once tagging is easier. `nextDifficulty`, the adaptive branch of
    `resolveLever()`/`advanceLeverState()` in `lib/game/engine.ts`, and the difficulty ranking in
    `lib/games/item-select.ts` all stay, parked behind the registry flag, until the decision is
    confirmed in writing. Full detail: `docs/CURRENT_STATE.md`.
- **Both levers must never be active at once, enforced structurally.** Games consume `resolveLever()`
  from `lib/game/engine.ts` and never branch on `config.lever` themselves — both-levers-at-once becomes
  a single tested function instead of ~25 scattered branches. Not literally unrepresentable — the
  return type does not forbid both varying — but centralised and covered by tests
  (`docs/PROJECT_MAP.md` §1, package K-4).
- **Difficulty is empirical, never asserted.** Cognitive level (recall / apply / discriminate / deduce
  / transfer) is a generation control stored separately — it is not a hardness ordering
  (`docs/PROJECT_MAP.md` §1.6).
  - _Method decided 30 Jul 2026:_ do not ask a model how hard an item is — make models **attempt** it
    at stated ability levels via **LLM student simulation on a small local model, run through Ollama**,
    and take the failure rate as the difficulty estimate. Cited in
    `docs/literature/item-difficulty-without-students.md`. The continuous score is **binned into the
    existing 1–5 column** so current difficulty plumbing (`pickQuestion`, lever constants, badge,
    tests) is untouched. The raw score is stored in `content_items.simulated_p` and must **never** be
    written to `empirical_p`, which is reserved for observed human facility. See `docs/CURRENT_STATE.md`
    for the Phase 0 spike result and its limits.
  - _Revised 31 Jul 2026, grounded simulation:_ the simulated student must be given the **source
    excerpt the item came from**, and the **ability tier must control how much of that excerpt it
    sees** — Below Basic 30% of lines, Basic 55%, Proficient 80%, Advanced 100%. Given the full
    excerpt every tier scored the same (81/87/85/89) and the persona instruction was ignored; thinned
    per tier the gradient appeared (57/71/78/89). Ungrounded simulation measures how much a question
    depends on its source, not difficulty. Implemented as `recall()` in
    `scripts/spike-simulate-difficulty.mjs`, behind `--retention`. Full run:
    `docs/experiments/2026-07-31_grounded-difficulty-simulation.md`. Known limit for package G1: text
    transcription loses *position*, so chart/matrix/2×2 slides cannot be difficulty-calibrated by text
    simulation (the 2×2 competitive-matrix item scored 33/30/33 — grounding did not help it at all).
  - _Replicated 31 Jul 2026 on two more model families (`gpt-3.5-turbo-0125`, `gemma2:9b`):_ the
    method — retention-gated grounding produces an ability gradient — holds on all three. The
    difficulty **values** it produces do not replicate, ρ ≈ 0.23 between every pair. `llama3.2` stays
    the simulator: `gemma2:9b` and `gpt-3.5-turbo` ceiling (8/15 and 7/15 items) and recognise the
    source deck from training data, which a struggling-student simulator cannot afford. See the
    standing rule under Conventions: **one simulator is one measurement.**
  - _Reproducibility is now a build property, not an aspiration (31 Jul 2026):_ `options.seed` in
    `scripts/spike-simulate-difficulty.mjs` is threaded per (item, student) so a run repeats; seeds
    derive from the item **id**, never its position in the result set. Honest limit: reproducible
    under a pinned model and environment, not deterministic across model updates or CPU/GPU changes.
    OpenAI's `seed` is best-effort and Gemini exposes none — this only works on the local Ollama path,
    one more reason the local-model rule below is the methodologically correct choice, not a
    convenience.
  - _Deck screening added 1 Aug 2026, now a standing cheap gate:_ before spending the ~85-minute
    grounded `gemma2:9b` run on a source, run a ~20-minute ungrounded screen on `llama3.2` first to
    check whether the model already knows the material from training data rather than genuinely
    reading it. Screened so far, all usable: CAGE slides (mean facility 0.42, 0 at ceiling), the
    Thoughtworks case (0.51, 0 at ceiling), Thoughtworks slides (0.50, 0 at ceiling), Airbnb (0.45, 1
    at ceiling). **Unverified, flagged not resolved:** the Thoughtworks case's ungrounded screen
    showed a monotonic positive ability gradient (43/51/54/63%) where every slide deck showed flat or
    inverted — possibly because the case's items are reasoning-heavier and general ability helps on
    reasoning even without the source, while recall items give ability nothing to bite on. The
    Advanced tier here is only 3 simulated students, and the clean test — the grounded-retention arm
    on the same case — has not run. Do not fold this into the grounding finding above until it does.
  - _Correction, 1 Aug 2026 — term items are calibratable after all:_ this file and
    `docs/CURRENT_STATE.md` previously said term/definition items cannot be difficulty-calibrated
    because the simulator is MCQ-only ("answer A, B, C or D") and a term/definition pair has no
    options. That is now outdated. Package A3 renders each term item as a clue plus four options
    built from `distractors` — i.e. an MCQ — so all 50 term rows are calibratable today with a
    rendering shim (clue as stem, term+distractors as options), no new method needed. Match can
    borrow the same per-item estimate as a proxy, since a match board is essentially six
    simultaneous choose-word items with elimination. This shrinks "match's adaptive arm measures
    nothing" from a research package to a rendering change. Not yet done: no term row has a
    `difficulty` value yet, so `difficultyHonored` is still correctly false for word and match.
  - _Bake-off complete, 1 Aug 2026 — simulator choice is ITEM-TYPE dependent, no global winner:_ five
    local models (`llama3.2:1b`, `qwen2.5:1.5b`, `gemma2:2b`, `llama3.2:3b`, `gemma2:9b`) run on two
    arms, both grounded + retention-gated, n=30 per item. Slide MCQs (CAGE deck, 17 items):
    `llama3.2:3b` is best (mean 0.72, 2/17 ceiling, monotonic gradient); `llama3.2:1b` is unusable
    (0/17 ceiling looks good but the gradient does not resolve, 0.30/0.40/0.44/0.35). Term MCQs
    (50 items, rendered via `build-term-mcq-spike.mjs`): the ranking flips — `llama3.2:1b` is best
    (mean 0.54, 0/50 ceiling, monotonic though step-shaped) and `llama3.2:3b` is marginal (31/50 at
    ceiling). **Recommendation: `llama3.2:3b` for the quiz's MCQs, `llama3.2:1b` for term items
    (match, choose-the-right-word).** Mechanism: a choose-word item is recognition (match a definition
    to a short label among near-miss options), which saturates a competent model; a slide MCQ is
    reasoning, which does not. Full tables: `docs/CURRENT_STATE.md`.
- **Difficulty stays at five levels.** At n=30 simulated students per item the standard error on a
  success rate is ~0.09, so ten bands would be about one standard error wide — false precision. Ties
  share a band (`scripts/lib/quintile-difficulty.mjs`); do not bin by rank position.
- **Adaptive difficulty moves only after two consecutive same-direction answers, and resets every
  round — both deliberate, not defects.** Two-in-a-row damps single-question noise; carrying
  difficulty across rounds would imply one global student level, conflating six different games'
  worth of performance into a single number.
- **Cohort is 60–120 students, not ~20.** Corrects a figure that had propagated into
  `docs/PROJECT_MAP.md` and `docs/literature/item-difficulty-without-students.md`. Response-budget
  figures derived from ~20 students (e.g. "~8,000 responses") are wrong — the real range is
  24,000–48,000 — which also changes the recipe-level Elo convergence argument in `HANDOFF.md` §13
  (more headroom above the 200–500-response convergence threshold, not less).
- **A leaderboard (package L1) and a global XP/level bar are planned**, decided by the user, not yet
  discussed with the professor. XP is a wrapper over all games and is safe only because it is an
  output, not an input: **XP must never feed back into item selection** — that would recreate exactly
  the cross-game conflation the per-round difficulty reset (above) exists to avoid. **Any motivational
  overlay (XP, leaderboard) must be identical across every experimental arm**, or it becomes a
  confound rather than a constant.
- **Rapid mode decided 31 Jul 2026: fewer questions *and* a fixed per-question timer**, not fewer
  questions alone. Working assumption, pending confirmation: rapid = 10s, normal = 15s, pinned for
  difficulty-lever students while time-lever students still tighten from that base rather than from a
  pinned value — exact seconds UNCONFIRMED. Live collision: `TIME_BASE`/`TIME_MIN`/`TIME_STEP`
  (`lib/game/engine.ts:26-28`) currently tighten the clock only under the time lever; if rapid mode
  pinned the timer for everyone, a time-lever student in rapid mode would get an inert lever. See
  `docs/PROJECT_MAP.md` §1.
- **Persistence loop:** "keep going → next round" incentivizes repeated engagement.
  - _Made measurable 1 Aug 2026:_ `round_offer` was added to `EventType` (`lib/log/logEvent.ts`),
    emitted when the Keep Going affordance renders. The log now distinguishes accepted
    (`round_continue`), declined (`round_stop`), and abandoned (an offer followed by neither) — before
    this, declining and never being offered were the same in the data. Round-number reuse on abandoned
    rounds, which had been corrupting this same measure, was fixed in the same pass.
- Log all events (session, round, per-question interactions, score, adaptivity feedback) for DSR dataset. Do not train on student data.

## Stack & constraints (28 Jul 2026 rebuild — details in HANDOFF.md §4)
- **Six packages shipped: G1 (generator, 31 Jul), G2 (term/definition generator, 1 Aug), D1
  (dashboard, 31 Jul), Q1 (quiz hardening, 31 Jul), A1 (match-the-following, 1 Aug), A3
  (choose-the-right-word, 1 Aug).** `app/dashboard/page.tsx` drives its tiles from
  `GAME_REGISTRY`; `scripts/generate-questions.mjs` writes `content_items` plus `source_excerpt`;
  `scripts/generate-terms.mjs` + `scripts/lib/terms-validate.mjs` extract `term_definition`
  primitives, unblocking match-the-following, fill-in-the-blanks, choose-the-right-word, and Wordle
  (all four consume that primitive and were blocked on zero rows); `app/api/answer/route.ts` scores
  server-side off the DB answer key and the client bundle no longer ships it. Migrations `db/005` and
  `db/006` are applied and verified on Neon project `ancient-brook-62806105`. Tests **10 → 18**,
  `tsc --noEmit` clean, `npx next build` succeeds.
  - _Validator lesson, 1 Aug 2026:_ G2's first clue-leak rule tested each word of a multi-word term
    independently, so a clue for "Minimum Viable Product" was rejected for containing the ordinary
    word "product" — it rejected 5 of 8 valid items. Fixed: single-word terms leak on any inflection;
    multi-word terms only leak if the clue contains every content word. Yield went from 3 items to 13
    on the same deck. General lesson: an over-rejecting guard is not automatically the safe
    direction — it can silently destroy yield the same way an under-rejecting one lets bad data
    through. See the standing convention below.
  - _Wordle's viability is now in doubt, 1 Aug 2026 (package A0):_ 0 of 13 terms extracted from the
    Thoughtworks deck are single words of 4-8 letters — management terminology is phrasal ("Lean and
    Agile Delivery Model"); the one single word, "Inception", is nine letters. Run A0 against a second
    deck before dropping Wordle, but the reason likely generalises: a case study yields a taxonomy of
    terms, not a lexicon of words.
  - _A1, match-the-following, shipped 1 Aug 2026 (commit `fe871e1`):_ the dashboard's third playable
    tile, and the first game that is not the quiz. `app/games/match/page.tsx` +
    `app/api/match/{board,submit}/route.ts` + `lib/games/match.ts`. **Scoring is per board, graded, not
    per pair:** on a bijection board (n clues, n terms, every term used exactly once, no distractors)
    the correct-pair count is the fixed-point count of a permutation, so one mistake always drags at
    least one other pair down — out of 6 the achievable scores are 6, 4, 3, 2, 1, 0, **never 5**. A
    flat per-pair penalty would bill a single error twice. Shipped table: 15 points per correct pair,
    +30 clean-board bonus, −20 floor penalty at 2 or fewer pairs. The floor is deliberate: a random
    permutation has exactly 1 expected fixed point at any board size, so accrual alone would pay for
    pure guessing — a test asserts `perPair + floorPenalty < 0`. The reachability rule is "no singleton
    errors", **not parity** — 3 and 1 are both reachable via odd-length cycles; this was a live
    misconception during the session and would silently corrupt any tier-based scoring table if
    reintroduced. Score per board, log per pair: board economics on `board_complete`, per-pair facility
    on `question_answered`. 68 tests, `tsc --noEmit` clean, `npx next build` succeeds, verified end to
    end against live Neon.
  - _A3, choose-the-right-word, shipped 1 Aug 2026 (commit `1805d62`):_ clue is the prompt, term is
    the answer, `distractors` supply the wrong options. Item-grained, `FlatPoints` 15/−5, the
    dashboard's fourth tile. Went before A2 (fill-in-the-blanks) because all 50 term rows have ≥3
    distractors while only 35 have an `example_sentence`. Two things worth keeping: the quiz's
    hardened answer-commit path (cookie-only attribution, dedupe, the 23503 FK retry) was
    **extracted, not copied**, into `lib/game/answer-commit.ts`, so `/api/answer` and
    `/api/word/answer` share one implementation instead of two that can drift — this closed a
    same-question concurrency race (12 concurrent POSTs all scoring) that had existed since Q1 and
    affected the quiz and match too, not just word. And `abandonRound()` is now a shared obligation
    in `lib/game/game-context.tsx` — the abandoned-round bug was fixed for the quiz on 1 Aug inside
    the quiz page, then match reintroduced it two days later because the fix wasn't shared; every
    game now calls the same helper. 100 tests, `tsc --noEmit` clean, `npx next build` succeeds,
    verified end to end including a 12-way concurrency salvo (db/008's partial unique index makes
    the answer insert its own lock; the 409 it returns on a repeat is idempotent, reading the
    already-stored result rather than recomputing it).
- **Runtime LLM: Gemini paid Tier 1** (Flash-class), not free tier — free tier's ~10 RPM and training-data clause fail a classroom pilot. Pending prof sign-off on the small spend; until then, develop against free tier but architect for Tier 1.
  - _Provider reality, 31 Jul 2026:_ **Gemini prepayment credits are depleted** — every Gemini call
    429s. Generation currently runs on **OpenAI** via the provider-agnostic adapter
    (`scripts/lib/llm-client.mjs`, default `gpt-4.1-mini`, `--provider openai`). This is the
    adapter-abstraction rule above paying off exactly as designed — a provider outage is a flag
    change, not a rewrite.
  - _Model guidance revised 29 Jul 2026:_ `gemini-2.0-flash` is two generations stale. As of 21 Jul 2026 the current tier is **Gemini 3.6 Flash** ($1.50/$7.50 per 1M tokens) and **Gemini 3.5 Flash-Lite** ($0.30/$2.50). **Flash-Lite is the right default for bulk MCQ generation** — the task is schema-constrained, not reasoning-heavy. Confirm the exact API model string in Google AI Studio and set it via `GEMINI_MODEL` in `.env.local`, not by editing the script fallback. Google no longer publishes universal RPM limits; they are project-specific in the console.
- **All LLM calls through one provider-agnostic adapter** (Vercel AI SDK pattern). Fallback: Gemini → retry → alternate. **Hard rule: student-derived data never goes to Chinese-hosted endpoints.** Non-student calls (MCQ drafts from course material) may use cheap open-model providers.
- **Rate-limit-proof by design:** MCQs pre-generated from session PDFs and served from DB; no live LLM calls on the critical path. Queue + backoff + cache.
- **DB: Neon serverless Postgres** — SQL queryable event logs for the DSR dataset; schema in `db/schema.sql`. Vercel Hobby hosting. Front-end: Next.js 16 / React 19 / Tailwind v4.
- **Auth (28 Jul 2026, commits b569cc5 + 408bd54):** real email+password login/signup; `events.student_id` is populated from the session cookie, never the request body. The whole app is gated (`proxy.ts`, deny-by-default) — only `/login`, `/signup` and the login/signup/logout API routes are public. Dashboard reads lifetime totals from `GET /api/stats`. Exercised end to end against live Neon on 28 Jul. First automated tests landed 30 Jul 2026 (`tests/lever.test.ts`) — see the testing rule below.
- **Quiz hardening (Q1, 31 Jul 2026):** the quiz no longer ships the answer key to the browser.
  `app/api/answer/route.ts` looks the answer up server-side, scores the submission, and is the only
  place `question_answered` gets written — `correctIndex` comes back only on the one POST that
  actually scores an item, never on a repeat. See the reviewer-pass rule under Conventions.
- **Dev tools:** Claude Code = primary builder. v0 free = frontend scaffolds. Antigravity = free overflow agent. DeepSeek/Qwen via OpenRouter = code review 2nd opinion. Codex = diffs-only review, never the builder. Cursor and Emergent are deliberately excluded.
  - _Revised 28 Jul 2026:_ the original "mini model, $10/mo cap" rule is superseded. `gpt-5.1-codex-mini` was retired by OpenAI (API 404s), and Codex now runs on pay-per-token API-key auth: **`gpt-5.6-terra` for routine diff review, `gpt-5.6-sol` only when explicitly requested.** Cost control moved from model choice to usage discipline: one run per invocation, scoped diffs, no retry fan-out. Watch the credit balance.
  - _Added 28 Jul 2026:_ **GPT-5.6's role in this project is adversary, not author.** Gemini Flash-class models generate bulk content such as question drafts; GPT-5.6 is used to attack and validate that output, and for anything requiring schema-guaranteed JSON via Structured Outputs. It is not the bulk generator — that would spend premium tokens on exactly the high-volume, low-stakes work cheap models are for.
- **Ollama, local-only, added 30 Jul 2026 — difficulty simulation only, never content generation
  (that stays on Gemini).** Already installed, v0.32.1. Three reasons it must be local, in order:
  (1) reproducibility — a hosted model can change mid-pilot and silently shift calibration, which
  would break the paper's instrument; (2) course material never leaves the machine; (3) the research
  finds **weaker models simulate students better up to a point — the live selection rule is
  discrimination, not raw weakness** (`docs/literature/item-difficulty-without-students.md`; corrected
  1 Aug 2026, see the bake-off result above), so a small local model is the methodologically correct
  choice, not a compromise. **Warning: `gemma4:31b-cloud` shows up in `ollama list` but is a CLOUD
  model — do not use it for simulation.** **Locally installed as of 1 Aug 2026:** `llama3.2:1b`,
  `qwen2.5:1.5b`, `gemma2:2b`, plus the earlier `llama3.2` (3B) and `gemma2:9b`.
  - _Tooling lesson, 1 Aug 2026:_ the simulation runner scripts guarded against concurrent Ollama jobs
    by waiting for `ollama ps` to be **empty**. That check is wrong: `ollama ps` lists **loaded**
    models, not **busy** ones, and Ollama keeps a model resident ~5 minutes after use — a warm idle
    model is not a conflict, and two runs sat in the wait loop until they aborted instead of running.
    The check was **removed, not repaired**; the mutex is the real protection. Second half: a hard
    kill does not fire an EXIT trap, so a killed run left its lock directory behind and silently
    blocked the next run. **A mutex whose release depends on graceful exit is only half a mutex** —
    the lock now records the owning PID so a stale lock is distinguishable from a live one
    (`spike-data/run-term-llama3b.sh` has the working pattern; copy it, don't re-derive the fix).
- Knowledge layer: **input is PDF. LibreOffice is out of the pipeline** (corrected 30 Jul 2026 —
  professors export PDFs from PowerPoint themselves; rationale in `docs/architecture/generator-spec.md`).
  Course material is not a build prerequisite — the professor said any PDF on any topic works for
  building against — but pilot content is sourced from Prof. Singh's decks, no hardcoded questions.
  Clean text/prose material first; mathematics support is deferred (see HANDOFF.md §3a).
  - _Added 31 Jul 2026:_ `scripts/extract-slide-text.mjs` recovers text from image-only slides by
    sending the PDF to **Gemini vision** — 12 of 26 pages of the test deck have no text layer. This is
    content work, so it stays on Gemini, consistent with the existing split: Ollama is local and
    simulation-only, LibreOffice stays out of the pipeline. Gemini's `kind` classification is
    unreliable (mislabelled a real example slide as a template); slide provenance is keyed on the
    number printed on the slide, not on `kind`.
- Total budget ~400–450 hours over 6 months and near-zero cash (~$0–15/mo dev, <$10/mo runtime during pilot). One artifact. Resist scope creep.

## Cadence
Weekly supervisor meetings Mon/Tue afternoons. Next: **Tue 4 Aug 2026 (confirm)** — the transcript has
him travelling Monday and proposing Tuesday same time (`docs/meeting/Jul 27 at 3-39 PM.txt`);
`CLAUDE.md` previously said Monday in error.

## Conventions for Claude Code
- Ask before adding dependencies or paid services.
- Prefer small, verifiable increments matching the week plan in HANDOFF.md §6.
- Any claim destined for the paper must cite a source in `/docs/literature/` or be flagged as unverified.
- When a design decision changes, delete the machinery it obsoleted. The OCR heuristics in `scripts/inspect-source.mjs` survived past "the image path is mandatory," got defended and duplicated across two files, and were reviewed by two model families before a 29 Jul 2026 `/simplify` pass found they never changed a routing outcome.
- **An over-rejecting validator is not automatically the safe direction.** G2's clue-leak rule
  (1 Aug 2026) rejected 5 of 8 valid items by testing each word of a multi-word term independently; a
  guard that is too strict can silently destroy yield the same way a guard that is too loose lets bad
  data through. Check yield, not just precision, before trusting a new validation rule.
- **Never stage with a broad `git add` (e.g. `git add -A`) when course-material PDFs are in the
  working tree.** A 9.8 MB deck was committed by accident on 1 Aug 2026 and had to be amended out.
  Root-level `*.pdf` is now gitignored; stage files by name regardless.
- **Read the transcript, not the summaries.** Anything stated as a professor decision cites
  `docs/meeting/Jul 27 at 3-39 PM.txt` or is marked as our inference. Five drifts in this file were
  found on 30 Jul 2026 by re-reading the transcript, because summaries are lossy
  (`docs/PROJECT_MAP.md` §2.7 and §0).
- **Tests exist now.** `npm test` runs `node --test tests/*.test.ts`. No external test framework — do
  not add vitest or jest. 100 tests as of 1 Aug 2026 (`tests/lever.test.ts`,
  `tests/quintile-difficulty.test.ts`, `tests/registry.test.ts`, `tests/match.test.ts`,
  `tests/match-board.test.ts`, `tests/board-token.test.ts`, `tests/events-allowlist.test.ts`,
  `tests/stats-potential.test.ts`, `tests/answer-commit.test.ts`, `tests/item-select.test.ts`,
  `tests/word.test.ts`, and others).
- **Anything touching scoring or auth gets a `reviewer` pass before commit.** The first Q1 attempt
  reported success while the answer key still shipped in the client JS bundle and
  `app/api/answer/route.ts` returned `correctIndex` on every POST, not just the one that scores. A
  builder's "done" is not sufficient evidence on this class of change.
- **Do not rely on a model's self-reported difficulty, and do not claim it has been disproved
  either.** Status as of 31 Jul 2026 is **unresolved**: the old "failed on three independent samples"
  was eyeballed, never measured; measuring it gave ρ = −0.63 under `llama3.2` but −0.09 under
  `gpt-3.5-turbo-0125` on the identical 15 items. No simulator is ground truth — only observed
  student responses settle it. Simulate an attempt and measure the failure rate rather than asking
  for a rating (`docs/literature/item-difficulty-without-students.md`,
  `docs/experiments/2026-07-31_grounded-difficulty-simulation.md`, `docs/PROJECT_MAP.md` §1.6).
  - _Reopened, not reversed, 1 Aug 2026:_ Hoard et al. (2026 arXiv preprint, math items only) reports
    that pairwise comparison plus calibration examples substantially rescues direct LLM difficulty
    rating, where plain absolute rating still fails. This is an untested middle ground on prose, not
    evidence the project's own finding was wrong — cheap to try later, not prioritised over settling
    the experimental-contrast question. See `docs/literature/publishing-llm-item-difficulty.md`.
- **Expect r ≈ 0.5 for management prose, not the 0.75–0.82 figure already cited.** That figure
  (Acquaye et al.) is confirmed NAEP-mathematics-MCQ only. SMART (Chen et al., preprint) reports
  Spearman 0.57 on reading comprehension and 0.42 on coding with the same simulation approach —
  reading-comprehension-style domains land near r ≈ 0.5–0.7. Tell Prof. Singh before the pilot, not
  after. `docs/literature/publishing-llm-item-difficulty.md`.
- **One simulator is one measurement, not a result.** Any difficulty claim must name the simulator,
  and anything load-bearing must be replicated on a second. Tested on three model families as of
  31 Jul 2026 (`llama3.2`, `gpt-3.5-turbo-0125`, `gemma2:9b`): the *method* — retention-gated
  grounding — replicates on all three, but the difficulty **values** do not, ρ ≈ 0.23 between every
  pair. `llama3.2` stays the simulator: `gpt-3.5-turbo` scores 0.72 with no material at all against
  `llama3.2`'s 0.45 (ceilings on 7 of 15 items), and `gemma2:9b` ceilings on 8 of 15 and is ~6× slower
  — both recognise the source deck from training data, which a struggling-student simulator cannot
  afford.
  - _Correction, 1 Aug 2026:_ **ceilinging is model × material, not a model property.** `llama3.2`
    itself ceilinged on 11 of 19 items on the Thoughtworks case (grounded-retention arm), where it
    ceilings on only 1 of 15 on the Airbnb slide baseline — the case's connected prose grounds too
    well, collapsing the task toward reading comprehension. `gemma2:9b` and `gpt-3.5-turbo` were
    rejected as simulators for ceilinging on 8/15 and 7/15, but that was never purely a model fact
    either. This does not overturn keeping `llama3.2` (the recognition-of-famous-decks argument for
    rejecting the other two stands), but the stated reason needed correcting.
  - _Correction, 1 Aug 2026 — the pooled run finished and revises the headline ρ ≈ 0.23 figure:_
    that number was computed on only 15 items (95% CI roughly [−0.32, +0.66], too wide to support
    "the values do not replicate") and, worse, on the **Airbnb deck specifically, which every model
    family recognises from training data.** The pooled arm-C run (llama3.2 vs gemma2:9b) on three
    unmemorised decks gives: CAGE slides ρ = 0.75 (17 items), Thoughtworks slides ρ = 0.75 (9 items),
    Thoughtworks case ρ = 0.46 (19 items, gemma ceilings on 16/19 so it carries little ranking
    information). **Pooled across the two genre-matched slide decks: ρ = 0.62, 95% CI [0.26, 0.83]**
    — a real, if not tight, agreement — versus ρ = 0.14, CI [−0.42, 0.62] on the memorised Airbnb
    baseline. The memorisation hypothesis is supported: the genre control was decisive, since
    pooling all three unmemorised decks together (including the case, which ceilings on gemma) gives
    an ambiguous ρ = 0.36. Update the standing claim from "ρ ≈ 0.23, values do not replicate" to:
    **on unmemorised, genre-matched material the two simulators substantially agree; the earlier
    figure was an artefact of testing on a deck the larger models had memorised.** Full detail:
    `docs/CURRENT_STATE.md`.
  - _Simulator selection criterion, 1 Aug 2026 — corrects "weaker models simulate students
    better" as a selection rule:_ the bake-off (`llama3.2:1b`, `qwen2.5:1.5b`, `gemma2:2b`,
    `llama3.2:3b`, `gemma2:9b`, two arms) selects on **discrimination, not weakness**. What breaks a
    run is CEILING — an item scored ~1.0 carries no ranking information — not a model simply being too
    strong. Target: mean facility ~0.50–0.65, <~20% at ceiling, <~10% at floor, a monotonic gradient
    across the four retention tiers (guards against a model at chance, which shows no gradient and
    measures noise), IQR > ~0.3.
  - _Bake-off COMPLETE, 1 Aug 2026 — the result is item-type dependent, not one winner:_ on slide
    MCQs (CAGE deck) `llama3.2:3b` wins (mean 0.72, 2/17 ceiling, monotonic); `llama3.2:1b` fails
    there (0/17 ceiling but the gradient does not resolve, 0.30/0.40/0.44/0.35). On term MCQs
    (50 items, `build-term-mcq-spike.mjs`) the ranking flips: `llama3.2:1b` wins (mean 0.54, 0/50
    ceiling) and `llama3.2:3b` is marginal (31/50 at ceiling). **Recommendation: `llama3.2:3b` for
    quiz MCQs, `llama3.2:1b` for term items.** Recognition tasks (choose-word) saturate a competent
    model; reasoning tasks (slide MCQs) do not. `llama3.2:1b`'s term gradient is step-shaped
    (0.49/0.49 then 0.63/0.63) — it separates low from high retention but does not resolve four
    tiers cleanly; state that caveat in any write-up. Full tables: `docs/CURRENT_STATE.md`.
- **Exercise the artifact against real data before believing a package is done.** A1's board-selection
  logic passed 66 unit tests and two adversarial review passes (17 defects found and fixed across
  them), but whole-history exclusion still locked a test student out of match permanently after
  exactly 8 boards — which would have manufactured the ceiling the persistence loop exists to measure.
  It was found only by playing the game against the live database and counting. Static review and unit
  tests are necessary, not sufficient, for anything with state that accumulates across sessions.
  - _Second instance, A3, 1 Aug 2026:_ `app/api/word/question/route.ts` computed
    `difficultyHonored` and never sent it in the response. This passed **100 tests, a clean
    `tsc --noEmit`, a clean build, and two adversarial reviewer passes** — every static check the
    project has. It surfaced only by playing the game: the Level badge was hidden, for the wrong
    reason, and would have stayed hidden even after the term rows get calibrated. Cross-agent seams
    — one route computing a value, another consuming it — are exactly where static review looks
    away from, because each side individually looks correct.
- **`EventType` is derived from `CLIENT_EMITTABLE_EVENT_TYPES`, not maintained in parallel with it**
  (`lib/log/logEvent.ts`). `/api/events` used to be a denylist checked against a separately-written
  type; the two could drift. Now the runtime allowlist and the compile-time type come from the same
  const array, so they cannot diverge. Applied 1 Aug 2026 during the A1 review pass.

## Orchestration (added 28 Jul 2026 — full rationale in `docs/architecture/agent-orchestration.md`)
Two sessions have already died of context exhaustion. The main session is an **orchestrator**: it
holds the plan and delegates the bulk work to subagents in `.claude/agents/`, then reads their short
reports.

- `scout` (haiku, read-only) — "where is X / what does Y do". **Use instead of grepping and reading
  files in the main conversation.**
- `builder` (sonnet) — one scoped code change, verified, reported in <300 words.
- `reviewer` (opus, read-only) — adversarial defect hunt on the diff.
- `codex-review` (sonnet bridge → `codex exec review`) — second opinion from **`gpt-5.6-terra`** by
  default, passed explicitly with `-m`. **Escalates to `gpt-5.6-sol` only when you say so** in the
  request; it will never upgrade on its own judgment. Requires API-key auth (Sol is blocked on
  ChatGPT-account auth). Diffs only, never a builder, one run per invocation, scoped diffs.
  **codex-cli 0.145.0 rejects a steering prompt in every form tested** (found 28 Jul, confirmed
  29 Jul 2026): `--uncommitted "<prompt>"`, `--base <branch> "<prompt>"`, and
  `--commit <sha> "<prompt>"` all fail at argument parsing (`the argument '--commit <SHA>' cannot
  be used with '[PROMPT]'`). No workaround found — a codex review on this version is always
  unsteered; it picks its own focus. Treat topics not mentioned in its report as unreviewed, not
  cleared. `--title` is accepted and is the only way to give it context. The parse errors cost
  nothing (no model call, no billing).
- `gemini-bulk` (haiku bridge → `gemini`) — bulk generation from course material. **Never student data.**
- `db-engineer` (sonnet) — schema, migrations, event-log design. Additive migrations only.
- `scribe` (sonnet) — HANDOFF.md and docs/. Moved up from haiku on 28 Jul after a haiku run
  invented an unverified claim in a doc derived from code.
- `researcher` (sonnet) — cited notes into `docs/literature/`.
- `sol-consult` (sonnet bridge → two-pass `codex exec` with GPT-5.6 Sol) — added 30 Jul 2026 for
  expensive-to-reverse design and research-methods questions. Not a code reviewer (that's
  `codex-review`), never a builder, premium spend, run only when the user approves.

Rules: one agent, one job. Independent agents get spawned in parallel in a single turn. Don't run two
writing agents on the same files at once. Architectural decisions and anything needing the user stay
in the main session.

Session lifecycle: `/resume` at the start, `/checkpoint` before context gets tight — it writes
`docs/CURRENT_STATE.md` so a fresh session loses nothing.
