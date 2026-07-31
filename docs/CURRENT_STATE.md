# Current state — 1 August 2026 (supersedes the 31 Jul checkpoint entirely)

## Where we are

**Four P0 packages are shipped: G1 (MCQ generator), G2 (term/definition generator), D1 (dashboard),
Q1 (quiz hardening).** The app generates questions from a PDF into `content_items`, serves them
without leaking the answer key, scores server-side, and lands on a registry-driven dashboard.
Migrations `db/005` and `db/006` are applied and verified live on Neon project
`ancient-brook-62806105`. **18 tests pass, `tsc --noEmit` clean, `npx next build` succeeds.**

**The adaptive-difficulty lever is real for the first time** — all 17 `content_items` rows carry a
calibrated `difficulty`, seeded by local `llama3.2` student simulation and stamped with
`simulator_model` / `simulator_method`. `empirical_p` is still null on every row and must stay that
way until real students answer.

**Voluntary persistence is now measurable.** `round_offer` fires when the Keep Going affordance
renders, so the log distinguishes accepted / declined / abandoned. Before this, declining and never
being offered were identical in the data.

**Half-built / next:** `match-the-following` (package A1) is unblocked but **not started**. It is the
first `board`-grained game and has an unresolved points question (see Open questions).

## Working tree

Branch **`main`**, last commit **`9728d19`**. **Working tree clean.** **14 commits ahead of
`origin/main`** — this session ends by pushing them (`https://github.com/sumeet96/gamification-platform.git`).

`spike-data/` and root-level `*.pdf` are **gitignored**. `spike-data/` holds all simulation runs and
generated item sets; losing it costs ~8 hours of local inference. Key contents:
`run-A/B/C-*.json` (llama3.2), `run-OA/OB/OC-*.json` (gpt-3.5), `run-MA/MB/MC-*.json` (gemma2:9b),
`calibration-run1.json`, `repro-1.json`, `repro-2.json`, `deck-cage.json`, `deck-tw.json`,
`case-tw.json`, `screen-*.json`, `terms-case.json`.

Three source PDFs sit in the repo root, untracked: `_CB0257-PDF-ENG.pdf` (Thoughtworks case),
`Session 7 - Thoughtworks.pdf`, `INM -Session 6_CAGE-...pdf`.

## In progress right now

**Nothing is mid-edit and no job is running.** The next task is **package A1, match-the-following**,
not yet begun.

Before writing UI, resolve the points question below and read `lib/games/registry.ts` (the `match`
entry, `adaptGranularity: 'board'`) and `lib/game/engine.ts` (`resolveLever`, now genuinely consumed
by `app/quiz/page.tsx`). Match is the first game where the lever fires **between boards, not between
items**, and `db/004` added `adapt_granularity` and `boards_completed` for exactly this — **no insert
currently writes either column.** Match should be the first to write them.

Item supply is ready: `node scripts/generate-terms.mjs "_CB0257-PDF-ENG.pdf" --subject "Digital Transformation" --per-window 5`
(drop `--dry-run` to write) yields 13 terms, all with ~3 distractors.

## Decisions made this session

- **Match-the-following is the first new game**, chosen over fill-in-the-blanks for demo value,
  accepting that board-granularity is new machinery.
- **`round_offer` added to `EventType`** — additive, client-emittable, does not disturb the rule that
  `question_answered` is server-only.
- **The per-round difficulty reset is deliberate, not a defect** (each round is an independent trial);
  the ramp now needs **two consecutive same-direction answers** to stop saturating mid-round.
- **Five difficulty levels stay.** At n=30 the standard error on a facility estimate is ≈0.09, so ten
  bands would be about one standard error wide — false precision.
- **The simulator is seeded per (item, student) via Ollama `options.seed`**, and seeds derive from the
  item **id**, not array position.
- **`llama3.2` stays the simulator**, on evidence from three model families.
- **Cohort is 60–120 students, not ~20.** Several docs still carry the stale figure.
- **A leaderboard will be built (L1) and a global XP bar is wanted.** Hard rule: **XP must never feed
  back into item selection**, and any motivational overlay must be identical across all arms.
- **G2's clue-leak rule was wrong and is fixed** — multi-word terms now only leak if the clue contains
  every content word. Yield went from 3 items to 13 on the same deck.

## Open questions / blocked on

- **Match points: per pair or per board?** `lib/games/registry.ts` says `{ correct: 15 }` with a
  `// per pair` comment the type does not enforce. Blocks A1's scoring. The professor's
  comprehensibility constraint applies — a student must be able to predict the number mid-game.
- **Wordle (A4) may be structurally unviable.** 0 of 13 terms are single words of 4–8 letters.
  Management terminology is phrasal ("Lean and Agile Delivery Model"). Run A0 against the CAGE deck
  before deciding; if it also returns zero, drop A4 and tell the professor why.
- **Rapid/normal exact seconds** — working assumption 10s rapid / 15s normal, unconfirmed.
- **The professor has never been asked about a control arm.** "At least we can give them a control"
  in the transcript means a *knob for the student*, not a control group. Raise as a proposal.
- **The research variable across multiple games** — his, and he said he would plan it.
- **Points table numbers**, including whether rapid pays more than normal.
- **Whether the asserted 1–5 labels discriminate is UNRESOLVED**, and a ceilinged simulator cannot
  answer it (ρ = −0.63 under llama3.2, −0.09 under both gpt-3.5 and gemma, which both ceiling).
- **Does simulated facility track real facility?** Needs the pilot.
- **Next meeting Tuesday 4 Aug.**

## Next 3 actions

1. **Build package A1, match-the-following** — `app/games/match/`, `lib/games/match.ts`. First
   board-grained game; must write `adapt_granularity` and `boards_completed`. Resolve the points
   question first.
2. **Run A0 against the CAGE deck** to settle Wordle:
   `node scripts/generate-terms.mjs "INM -Session 6_CAGE- Challenges of Entering Foreign Markets_claude.pdf" --subject "International Management" --per-window 5 --dry-run`
   and read the "Wordle-eligible" line it prints.
3. **Grounded-retention comparison on the Thoughtworks case**, llama3.2 vs gemma2:9b, to test whether
   cross-simulator disagreement (ρ ≈ 0.23) was memorisation of the famous Airbnb deck. Arm C only —
   arms A and B are settled. ~20 min llama, ~85 min gemma.

## Do not redo

- **Do not run the simulation ungrounded and call it difficulty.** Settled on three model families.
- **Do not give every tier the full excerpt** — arm B inverts the ability gradient on all three models.
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
  reported success while the answer key still shipped in the JS bundle.
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
