# Current state — 31 July 2026 (end of a long session; supersedes the 30 Jul checkpoint entirely)

## Where we are

**Three P0 packages shipped this session: G1 (generator), D1 (dashboard), Q1 (quiz hardening).** The
app now generates real questions from a PDF into `content_items`, serves them without leaking the
answer key, scores server-side, and lands on a dashboard that drives its game tiles from
`GAME_REGISTRY`. Migrations `db/005` and `db/006` are applied and verified live on Neon project
`ancient-brook-62806105`. Tests went **10 → 18**, `tsc --noEmit` clean, `npx next build` succeeds.

**The adaptive-difficulty lever works for the first time.** All 17 `content_items` rows carry a
calibrated `difficulty`, seeded by LLM student simulation on a local `llama3.2` and stamped with
`simulator_model` / `simulator_method`. `empirical_p` is still null on every row and must stay that
way until real students answer.

**The simulation method is validated across three model families** (llama3.2, gpt-3.5-turbo-0125,
gemma2:9b) and is now reproducible run-to-run. Full write-up:
`docs/experiments/2026-07-31_grounded-difficulty-simulation.md`.

**Half-built:** the experimental arm structure. A third "control" condition (fixed time + fixed
difficulty) is planned but **not built** — `Lever` is still `'adaptive' | 'time'`. The approved plan
is `C:\Users\96sum\.claude\plans\i-might-have-stated-noble-squid.md`; Steps 1–3 are done, **Step 4
(logging the continuation offer) is not started**.

## Working tree

Branch **`main`**, last commit **`9239f2a`** ("Make the simulator reproducible, and seed the
difficulty column"). **Working tree is clean.** Nothing pushed this session (as usual — nothing is
ever pushed without asking).

Eight commits this session, oldest first: `a00964d` (db/005) → `17e21e9` (G1) → `f4fa360` (D1) →
`aefb6c5` (hydration) → `e7af686` (Q1) → `66853ec` (lever resolver) → `748accf` (tie binning) →
`9239f2a` (reproducible simulator + calibration).

`spike-data/` is **gitignored** and holds course material and every simulation run. Contents that
matter: `questions-session12.json`, `excerpts-session12.json`, `run-A/B/C-*.json` (llama3.2),
`run-OA/OB/OC-*.json` (gpt-3.5), `run-MA/MB/MC-*.json` (gemma2:9b), `calibration-run1.json`,
`g1-final.json`, and the `run-arms*.sh` drivers. **Losing it costs ~7 hours of simulation.**

## In progress right now

**Nothing is mid-edit and no job is running.** The session ended on an explanation, not a task.

**The next concrete step is Step 4 of the approved plan: log the continuation offer.** Today
`round_continue` is emitted only when a student *accepts* another round
(`lib/game/game-context.tsx:128`), so "declined" and "was never offered" are indistinguishable — and
voluntary persistence is the dependent variable. Add `'round_offer'` to `EventType`
(`lib/log/logEvent.ts:9-14`), emit it where `app/results/page.tsx` renders the Keep Going
affordance, and fix the related defect that abandoned rounds reuse a round number because
`session.roundsPlayed` never increments on quit. Additive only — no migration, `events` is
append-only, and `question_answered` must stay server-only (403 at `app/api/events/route.ts:50-55`).

**Also promised:** the user is supplying **conceptual-framework decks tonight** to run on both
llama3.2 and gemma2:9b, to test whether cross-simulator disagreement is caused by memorisation of
the famous Airbnb deck. Run **arm C (grounded-retention) only** on both models plus one ungrounded
run per deck as the memorisation check — arms A and B are settled. Budget ~20 min/deck on llama3.2,
~85 min/deck on gemma2:9b. Run the first deck **twice on llama3.2** to prove pipeline-level
reproducibility end to end; only a single prompt has been verified so far.

## Decisions made this session

- **Cohort is 60–120 students, not ~20.** Corrects a figure that propagated through
  `docs/PROJECT_MAP.md:560` and `docs/literature/item-difficulty-without-students.md:112`. Three arms
  gives 20–40 per group, so underpowering is no longer the decisive objection to self-selected arms.
  Every response-budget number derived from ~20 students needs revisiting (24,000–48,000 responses,
  not 8,000).
- **Experimental arms: self-selection with a control as a third choice on `main`; a branch explores
  randomised within-subject.** Closest to the professor's stated design, and preserves the student
  choice that is itself an SDT autonomy driver.
- **Control arm pins difficulty at the student's own choice on `main`; the branch uses a yoked
  control** (replaying a matched adaptive round's difficulty sequence).
- **Rapid = fewer questions AND a fixed timer.** Exact seconds still unconfirmed.
- **A leaderboard will be built** (package L1) — decided by the user, never discussed with the
  professor.
- **A global XP / level bar is wanted**, as a wrapper over all games. Safe *because* it is an output,
  not an input. **Hard rule: XP must never feed back into item selection** — the moment it does, it
  recreates the cross-game conflation that carrying difficulty across rounds was rejected for.
- **Any motivational overlay (XP, leaderboard) must be identical across all arms.** Identical across
  conditions makes it a constant; varying by condition makes it a confound.
- **Five difficulty levels stay.** More bands would be false precision: at n=30 the standard error on
  a success rate is ~0.09, so ten bands would be about one standard error wide.
- **Adaptive difficulty now moves only after two consecutive same-direction answers**, and **the
  per-round reset is deliberate, not a defect** — it makes each round an independent trial. Carrying
  difficulty across rounds would imply a global student level conflating six games.
- **`llama3.2` stays the simulator**, now on evidence from three model families rather than one.
- **The simulator is seeded per (item, student) via `options.seed`**, and seeds derive from the item
  **id**, not its position in the result set.

## Open questions / blocked on

- **Rapid/normal exact seconds** — working assumption 10s rapid / 15s normal; the user's "10/15
  seconds" was ambiguous. User unblocks.
- **The professor has never been asked about a control arm.** The transcript line "at least we can
  give them a control" means a *knob for the student*, not a control group — it is the only use of
  the word in either transcript. Raise as a proposal, never as settled.
- **The research variable across multiple games** — the professor owns it and said he would plan it.
- **Points table numbers**, including whether rapid pays more than normal (at parity now).
- **Whether the 1–5 asserted labels discriminate is UNRESOLVED**, and cannot be settled by a
  simulator that ceilings. ρ = −0.63 under llama3.2 but −0.09 under both gpt-3.5 and gemma — and
  those two ceiling on 7–8 of 15 items, which mechanically destroys rank correlation.
- **Does simulated facility match *real* facility?** Needs the pilot. Only the ordering is validated.
- **The retention fractions 0.30/0.55/0.80/1.00 are a chosen knob**, never calibrated.
- **Leaderboard ethics + persistence-DV confound** — unresolved despite the decision to build it.
- **Next meeting Tuesday 4 Aug**, not Monday.

## Next 3 actions

1. **Step 4 — log the continuation offer.** `lib/log/logEvent.ts`, `app/results/page.tsx`,
   `lib/game/game-context.tsx`. Additive; no migration. Verify by playing a round and accepting,
   declining and abandoning, then confirming all three are distinguishable in `events` and round
   numbers are unique.
2. **Run tonight's decks** when the user supplies them:
   `node scripts/generate-questions.mjs "<deck>.pdf" --subject "<name>" --title "<t>"`, then
   `node scripts/calibrate-difficulty.mjs --subject "<name>" --dry-run`. For the cross-model check use
   `scripts/spike-simulate-difficulty.mjs ... --provider ollama --model gemma2:9b --source <excerpts> --retention`
   and compare with `node scripts/spike-compare-arms.mjs <runA.json> <runB.json>`.
3. **Fix the G1 content problem.** 7 of 17 items score ≥0.95 and difficulty 1 is **empty**, so the
   lever can ramp up but has nothing easier for a struggling student. Push
   `scripts/generate-questions.mjs`'s prompt toward discriminate/deduce/transfer and regenerate.

## Do not redo

- **Do not run the simulation ungrounded and call it difficulty.** Settled on three model families.
- **Do not give every tier the full excerpt.** Arm B inverts the ability gradient on all three models
  (llama +8, gpt-3.5 −5, gemma −4). Only retention-gating produces a slope.
- **Do not switch simulator to gemma2:9b or gpt-3.5-turbo.** Both ceiling badly (8/15 and 7/15 items)
  and both recognise the Airbnb deck from training data. gemma is also ~6× slower.
- **Do not re-test whether excerpt length drives the arm C ordering.** ρ = −0.08.
- **Do not add more than five difficulty levels.** False precision at n=30.
- **Do not carry difficulty across rounds**, and do not "fix" the per-round reset — it is deliberate.
- **Do not let XP or a leaderboard feed into item selection.**
- **Do not bin difficulty by rank position.** Ties must share a band; splitting them invents
  distinctions the measurement never made (`scripts/lib/quintile-difficulty.mjs`).
- **Do not seed the simulator from array position.** Item id only.
- **Do not merge `simulated_p` into `empirical_p`**, or `cognitive_level` into either.
- **Do not add a dashboard view event** — `/` redirects to `/dashboard`, so it would fire for every
  session and duplicate `session_start`.
- **Do not trust a builder's "done" on scoring or auth without a review pass.** The first Q1 attempt
  reported success while the answer key still shipped in the JS bundle and `correctIndex` came back
  on every POST.
- **Do not use `thinkingConfig` with `gemini-3.5-flash-lite`** — rejected with a 400.
- **Gemini prepayment credits are depleted** — every Gemini call 429s. Generation runs on OpenAI
  (`--provider openai`, default `gpt-4.1-mini`).
- **Do not trust Gemini's `kind` field** from `scripts/extract-slide-text.mjs`; key on the number
  printed on the slide.
- **Do not add vitest or jest**, and **do not use `node --test tests/`** — the working form is
  `node --test tests/*.test.ts`.
- **Do not remove `allowImportingTsExtensions`** from `tsconfig.json`.
- **Do not put a CHECK on `events.cognitive_level`** — append-only log on the answer path.
- **Do not reinstate LibreOffice**, add a `passage` content type, or recreate `docs/PROJECT_BACKLOG.md`.
- **Do not learn the professor's spec from summaries.** Read `docs/meeting/Jul 27 at 3-39 PM.txt`.
- All prior "do not redo" items from the 29–30 Jul checkpoints still stand (no Poppler/ImageMagick,
  no npm ZIP library, no `psql`, no bcrypt/argon2, no steering prompt on `codex exec review`).
