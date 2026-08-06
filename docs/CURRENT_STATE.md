# Current state — 6 August 2026

## READ THIS FIRST (added at session close)

**The next session builds the game. Read `docs/NEXT_SESSION_BUILD_BRIEF.md`, not the analysis
history.** The game-selection work is DONE; repeating it costs a week that is not available — there
is a Friday deadline. **Confirmed by the user: the game is Connections, and it ships with NO time
pressure and NO difficulty** — both deferred to a later package, so register it `lever: 'none'` and
leave difficulty null. That is a decision, not an oversight; it also means the game produces no
experimental data until a lever is added.

**The ungrounded arm COMPLETED. The grounded arm did NOT — it must be re-run.**

170 items from 7 management strategy decks (TCE, PESTEL, Porter's Five Forces, Industry Analysis,
Dynamic Capabilities, RBV, Culture), generated under `--subject "Competitive Strategy"`, rendered to
`spike-data/cs-mcq.json` + `spike-data/excerpts-cs.json`. **Nothing is imported from them.**

**RESULT (ungrounded, `spike-data/cs-ungrounded.json`): mean 0.773, IQR 0.37, 28% at ceiling, 23
items below 0.40, full range 0.00–1.00.** Bimodal, as the term list predicted. Compare 0.57
(management prose) and 0.837 (technical decks).

**The conclusion, which does not depend on the missing grounded arm: filter by UNGROUNDED SCORE, not
by subject.** Pooled across both banks (260 items), 51 fall below 0.60 ungrounded and 83 below 0.80.
Only those can carry an exposure-gated difficulty gradient — everything above the cut is answerable
without the deck by construction. Running the n=120 stability study on all 260 would flatten the tier
gradient and make the method look broken when the item selection was at fault.

**TO RE-RUN (the grounded arm, the quality gate before import):**
```bash
node scripts/spike-simulate-difficulty.mjs spike-data/cs-mcq.json --model llama3.2 --n 30   --concurrency 4 --source spike-data/excerpts-cs.json --out spike-data/cs-grounded.json   --label cs-grounded
```
**Restart Ollama first, or run it on the Mac.** It was killed three times in a row, reaching items
155, then 53, then 14 — progressively sooner, which is memory pressure, not a timeout: 87.4% RAM
used with `llama-server` resident at 8.4 GB after hours of running. The Mac does this arm in ~36 min
against ~2 h here, and needs only `cs-mcq.json` and `excerpts-cs.json` copied over (both gitignored).

After it lands: `analyse-item-gap.mjs` for the verdict, then import with `--additive` and
`--subject "Competitive Strategy"` — the `sources` rows for those 7 decks **do not exist yet** and
must be created first (`import-terms.mjs` looks them up, never creates them; see the 6 Aug INSERT
for the id formula `sha256(subject::filename::byteLength).slice(0,24)`).

**Mixed subjects in the bank are intentional.** The user's requirement is a subject-agnostic
pipeline, not a Digital Transformation-only one; the whole DB will be wiped before real
implementation, so current content is scaffolding for testing the algorithm.

**Adaptive difficulty is BACK** (user decision, 6 Aug, relayed verbally — **no transcript**, same gap
as the lever-drop). Condition: the simulator must behave like MBA students across exposure conditions
at **70–90% accuracy**. Note that 70–90% is achievable as *reliability* (band stability on resample,
which `--seed-offset` + `analyse-band-stability.mjs` measure) but **not** as *validity* against real
students — published expectation for management prose is r ≈ 0.5, and only the pilot settles it.


## Where we are

**No `app/` or `lib/` code has changed for three sessions.** 188 tests, `tsc --noEmit` clean, the
database is untouched since the 4 Aug cohort swap. All work since has been content pipeline and
research-design: choosing game 4, screening a new item bank, and rebuilding the MCQ generator.

Built and working: **88 of 90 new term items are screened and ready to import** (would take the term
bank 34 → 122), and `scripts/generate-questions.mjs` is rebuilt into a three-stage flow that
eliminated the data-point questions the old quota-driven flow produced.

Half-built: the new MCQ bank **cannot ship** — a solver that knows nothing scores **88.6%** by always
picking the longest option. Three attempts to fix that at generation failed. And the **between-arm
experimental contrast is still undecided**, four days after the 4 Aug meeting, so every design
decision below rests on an experiment that does not yet exist.

## Working tree

Branch `main`, **clean**, nothing uncommitted, **0 commits ahead of `origin/main`** (all pushed).

- `7aeb603` Blind the option writer to the answer; it does not fix the giveaway
- `9030316` Rebuild the MCQ generator two-stage, and find the giveaway it does not fix
- `9b87905` Report band stability from two calibration runs, and refuse a fake 100%
- `ccc9332` Add --seed-offset, without which a reproducibility run measures nothing
- `3d2ffeb` Retract the rank-order claim; the screen's verdict is instrument-determined
- `17c5ece` Choose Connections, then measure its main argument down

`spike-data/` is gitignored; everything below lives only on this Windows machine. Eight course PDFs
were added to the repo root and are gitignored — **never stage with a broad `git add`.**

## In progress right now

**Nothing is mid-flight. No background jobs are running.** The last one (`mcq6-ungrounded.json`)
completed and was analysed.

The interrupted decision is the **length giveaway on MCQ options**, and the immediately next concrete
step is to import the screened term items, which is not blocked by it:

```bash
node scripts/import-terms.mjs --help   # confirm flags before running
```
Import source: `spike-data/gen4-mcq.json` (90 rendered items) minus the 2 that failed the gate.
Screen verdict: `spike-data/gen4-gap.json`.

## Decisions made this session

- **Game 4 is Connections, not crossword** — all five model families agreed (RFC:
  `docs/architecture/game4-rfc-prompt.md`). Recorded with the caveat that the brief was not neutral.
- **Retire the 17 pitch-deck MCQs as `superseded`, but only after replacements exist** — user's
  choice among three options. They are the *only* mcq rows, so retiring now would leave both quiz
  tiles with zero items, and `superseded` only becomes an honest label once replacements exist.
  Allowlist is `chart-title-term | superseded | under-determined | trivia`; no `off-curriculum` value
  exists and adding one needs a db/011 DROP + re-ADD of the named CHECK.
- **`generate-questions.mjs` rebuilt three-stage** — glossary (no quota, empty valid) → blind option
  writing (schema has **no `answer` field**) → cold answer marking (`ANSWER_SCHEMA`, can report
  `unanswerable`). `--per-window` deleted, not defaulted lower; passing it now exits with an error.
- **Default model `gpt-5-mini` for that script only** — nano took >10 min on an 11-page deck and lost
  two of six windows to `fetch failed`. `llm-client.mjs` omits `temperature` for `gpt-5*`, which
  reject any value but their default of 1.
- **`--seed-offset` added to `calibrate-difficulty.mjs`** — without it two runs at the same `--n` are
  byte-identical and a band-stability check returns 100% by construction.
- **Mac mini M4/16GB set up and benchmarked** — 0.42 s/item-trial vs Windows' 1.485, i.e. **3.5×
  faster**. The "15-hour" calibration job is ~4 hours there.

## Measured results (all reproducible from `spike-data/`)

**Term screen, 90 items, `llama3.2`, n=30** (`gen4-gap.json`): grounded mean **0.964**, IQR 0.00,
68/90 at ceiling. **2 broken** — `Blockchain Process` (0.40) and `Cloud Computing` (0.43). Prior
banks: original 50 → 5 broken/0.90; gen2 29 → 1/0.96; gen3 37 → 0/0.98. **37 of 90 are fully
answerable with no deck** (ungrounded mean 0.837) — public-vocabulary finding, not a defect.

**MCQ length giveaway** — correct option is longest: **65%** (live bank, gpt-4.1-mini single-stage) →
**81%** (two-stage + emphatic length-parity instruction, gpt-5-nano) → **89%** (blind schema,
gpt-5-mini). Chance is 25%. Always-pick-longest scores **88.6%**. Mean correct option 106.5 chars vs
81.6 for distractors.

**The giveaway does NOT contaminate difficulty calibration** (`mcq6-ungrounded.json`, 44 items):
the simulator scores **0.744** ungrounded, *below* the **0.886** a pure length-picker would get — so
it is using its own knowledge, not the cue. Pearson r between score and length margin = **0.161**,
n=44, CI straddles zero. **Assessment-validity problem, not a measurement problem. The n=120
calibration run is unblocked.**

**Connections no-source screen** — verdict is entirely instrument-determined: boards rejected 0/3
(`gpt-4.1-nano`), 1/3 (`gemma2:9b`), 3/3 (`gpt-4.1-mini` and `gpt-5-nano`). Capability control
(`connections-control-v1.json`) is mandatory before trusting any of it: `llama3.2` 3B scores
**0.00/4** on Colours/Animals/Countries/Fruits and is ineligible; `gemma2:2b` 1.90/4 also ineligible.

## Open questions / blocked on

- **The between-arm experimental contrast (§5.2 of the RFC) is still blank.** Top blocker, four days
  old. Unblocked only by Prof. Singh. Two of five models said a difficulty-only resolution flips
  game 4 away from Connections toward **fill-in-the-blanks** (item-grained, already renders as an MCQ
  so it inherits the existing calibrator).
- **The lever-drop decision still has no transcript in `docs/meeting/`.**
- **How to fix the length giveaway.** Three generation-side attempts failed. Remaining options: (1) a
  length-normalisation rewrite pass; (2) distractors drawn from sibling concepts' true statements
  (note: glossary-sourced distractors failed for *term* items, but those were near-synonym names, a
  different risk); (3) disclose it as a limitation. User was deciding.
- **Is `ANSWER_SCHEMA`'s cold reader trustworthy?** It flagged **0 of 44** items as `unanswerable`
  and the validator rejected 0 (against 9 on an earlier nano run). Untested against a deliberately
  ambiguous item.
- Carried forward: rapid/normal exact seconds, points-table numbers, r ≈ 0.5 expectation for prose.

## Next 3 actions

1. **Import the 88 screened term items.** Read `scripts/import-terms.mjs` first for its flags, then
   import from `spike-data/gen4-mcq.json`, excluding the two ids whose `p_grounded < 0.60` in
   `spike-data/gen4-gap.json`. `--subject "Digital Transformation"` must be explicit — it is part of
   the `sha256(subject::term)` id.
2. **Settle the between-arm contrast with Prof. Singh** and get the lever-drop recorded in
   `docs/meeting/`. Brief already written: `docs/meeting/2026-08-04_pre-meeting-brief.md`.
3. **Decide the length-giveaway fix**, then regenerate MCQs for the five session decks:
   `node scripts/generate-questions.mjs "Session 2 - Cloud.pdf" --subject "Digital Transformation" --window 3 --dry-run --out spike-data/mcq7-cloud.json`
   Only after replacement MCQs exist can the 17 pitch-deck rows be retired as `superseded`.

## Do not redo

- **Do not re-run a multi-hour Ollama job without restarting Ollama first.** Three consecutive kills
  on 6-7 Aug reached items 155, 53 and 14 of 170 — progressively sooner. That is memory pressure
  (87.4% RAM, `llama-server` resident at 8.4 GB after hours of use), not a timeout; two of the three
  were relaunched on a timeout theory that was wrong.
- **`spike-simulate-difficulty.mjs` writes its output ONLY at the end.** The first kill discarded
  ~4,650 completed simulations at item 155/170. Any interruption costs the whole run. It needs
  incremental append or a `--resume` flag before it is trusted with another multi-hour job.


All prior "do not redo" items stand. Added this session:

- **Do not run any rejection gate without a capability control first.** `llama3.2` 3B returned a
  clean-looking 0.10/4 on the Connections screen and scores **0.00/4** on a trivial control — it
  cannot do the task. Third instrument in which "a weak simulator's low score can mean the simulator
  is ignorant" has bitten. Pattern to copy: `spike-data/connections-control-v1.json`.
- **Do not add a sixth instrument to the Connections screen.** The instrument-dependence is the
  finding, not sampling noise to average away.
- **Do not try to fix the MCQ length giveaway with a prompt instruction.** Tried, emphatic, moved
  86% → 81% while dropping validator rejections 9 → 0 — the model equalised spread and kept the
  answer marginally longest.
- **Do not expect blinding to fix it either.** Removing the `answer` field made it *worse* (89%).
  The cause is semantic: a true statement needs more qualification than a false one, and a stronger
  model qualifies more carefully.
- **Do not use `distractors` as Connections board tiles.** They are generated inventions; a tile
  asserts its string is a real concept.
- **Do not run two calibration passes without different `--seed-offset`.** Byte-identical otherwise;
  `analyse-band-stability.mjs` now refuses rather than printing a fake 100%.
- **Do not add a name-length clause to the glossary prompt.** It surfaced no short terms, made terms
  longer, and re-broke the chart-caption guard.
- **Do not launch a long run with a bare `&`.** Same failure as `nohup` — the harness tracks the
  launcher, not the job, and no completion notification fires.
- **Do not guess JSON field names when writing analysis scripts.** Cost two wrong readings this
  session (`simulated_p` vs `p`; `grounded` vs `p_grounded`), one of which nearly reported a working
  fix as broken. Inspect the structure first.
