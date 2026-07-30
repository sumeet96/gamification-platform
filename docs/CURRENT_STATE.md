# Current state — 30 July 2026 (second checkpoint of the day)

## Where we are

Package **K is complete, committed and merged to `main`**, and its two migrations are **applied and
verified live** on Neon project `ancient-brook-62806105`. The project has automated tests for the
first time: **10 passing, `tsc --noEmit` clean.**

The session then took on the biggest open threat — **difficulty labels that do not discriminate** —
and found a route that needs no student cohort. Research is written up with citations in
`docs/literature/item-difficulty-without-students.md`. The core idea: **do not ask a model how hard an
item is (that is what produced the broken 1–5 labels); make models attempt it at stated ability levels
and measure how often they fail.**

A **Phase 0 spike ran and passed its gate**, but it also changed the method. Read "What the spike
actually showed" below before building on it — the headline is narrower than it looks.

An approved plan for the build sits at
`C:\Users\96sum\.claude\plans\i-want-to-discuss-compressed-dolphin.md`. **It needs one amendment**
(source excerpts) before execution — see "In progress".

## Working tree

Branch **`main`**, last commit **`559dd40`**. Level with `origin/main` (merged and fast-forwarded this
session; nothing pushed).

**Two files uncommitted:**
```
?? docs/literature/item-difficulty-without-students.md   the cited research note
?? scripts/spike-simulate-difficulty.mjs                 Phase 0 spike, throwaway
```

## What the spike actually showed

Command that produced it:
```
node scripts/spike-simulate-difficulty.mjs <questions.json> --model llama3.2 --n 4 --concurrency 4
```

**Validated:**
- The local pipeline works end to end. Ollama 0.32.1 already installed, `llama3.2` (2 GB, ~3B) runs,
  **2.1 s per response** at concurrency 4, **zero unparseable replies**.
- **The kill criterion did not trigger.** Success rates spread the full range — min 0.00, mean 0.47,
  max 1.00. No clustering. This was the stated fail condition and it did not happen.
- Option order is shuffled per call inside the spike, so the generator's 15/15-at-index-0 bias cannot
  inflate the result.

**NOT validated — do not repeat these as settled:**
- **That it measures difficulty.** It currently measures *how much a question depends on the source
  material*, because the simulated students never saw the deck. The four items scoring 100% (pitch
  deck purpose, Amazon's purpose, price matters to travelers, search→review→book) are all answerable
  with zero deck knowledge. A real student attended the session and has seen the material.
- **Anything about magnitude.** n=4 allows only five possible values per question. Directional only.
- **The grounded method has never been run.** Simulating *with* the source excerpt — the actual
  proposal — is untested.

**Free bonus finding:** the ungrounded run is a good **question-quality detector**. An item answerable
at ~100% without the source teaches nothing and rewards general knowledge — the same defect class as
answer-position bias. It flagged 4 of 15. Worth adding to `scripts/validate-questions.mjs` as a gate.

**Timing for planning:** 2.1 s/response ⇒ ~400 items × n=30 ≈ **7 hours**. An overnight job.

## In progress right now

**Nothing is mid-edit.** The next step is to amend the approved plan, then execute it.

**The amendment: add `source_excerpt` to `content_items`.** Two independent needs now point at the
same column:
1. Difficulty simulation needs to give the simulated student the material, with the ability tier
   controlling how well they use it. Without it we measure source-dependence, not difficulty.
2. `sol-consult` flagged that the generator's page-loop proves which window was *prompted*, not that
   the answer is *supported* — it wanted an evidence span checked against extracted text.

So `db/005` should carry `simulated_p`, `simulated_n`, `simulator_model`, **and `source_excerpt`**,
and the generator (package G1) must store the text it actually used.

## Decisions made this session

*(Earlier decisions from the first checkpoint of 30 Jul still stand — per-game lever semantics, both
levers never at once, rapid = fewer questions, the pilot game roster, two content primitives,
LibreOffice out, live ingestion, multi-tenant schema now.)*

- **Difficulty is seeded by LLM student simulation, not asserted by a model.**
- **Run the simulation on a small LOCAL model via Ollama.** Reasons, in order of strength:
  reproducibility (a hosted model can change mid-pilot and silently shift calibration); the source
  material never leaves the machine; free, so simulation count is not cost-constrained; and the
  research finds **weaker models simulate students better** (Gemma 9B–27B beat Llama-3.3-70B, which
  answered 92% of items correctly but could not convincingly fail).
- **Bin the continuous score into the existing 1–5 integer column.** This avoids touching ~11 coupling
  sites that assume difficulty is an int — `pickQuestion`'s radius algorithm, the lever constants, the
  badge, the tests. The scale keeps its shape and starts meaning something.
- **Store the raw score separately as `simulated_p`, never in `empirical_p`.** Simulated must not
  masquerade as observed, the same way `cognitive_level` must not masquerade as difficulty.
- **Bin by quintiles over the run's observed distribution**, not fixed thresholds, which would collapse
  into one or two bands if the model is uniformly strong or weak on this material.
- **Elo is out of scope for now.** It needs real responses and a server-authoritative answer path,
  neither of which exists. When it comes it will be recipe-level, not per-item.
- **The quiz will migrate to `content_items`;** `questions` gets retired (decided, not yet built).
- **Student-facing display stays five bands** ("Difficulty 3/5"), satisfied for free by binning.

## Open questions / blocked on

- **`gemma4:31b-cloud` in the local Ollama list is a CLOUD model** — using it sends material
  off-machine and defeats the purpose. If a stronger simulator is wanted, pull a genuinely local
  Gemma 9B-class model instead.
- **Does grounded simulation actually track difficulty?** The whole method rests on this and it is
  untested.
- **The research variable across multiple games** — the professor owns it and said he would plan it.
- **"Rapid round" — fewer questions or less time?** We locked it to fewer questions; confirm.
- **Points table numbers**, including whether rapid should pay more than normal (at parity now).
- **Leaderboard yes/no** — SDT relatedness, his turf, but ethics implications and could confound the
  persistence DV.
- **What actually stops students revising?** Never tested; the design assumes it is motivational.
- **Match-the-following points are `{correct: 15}` with a `// per pair` comment** — the type does not
  say per-pair vs per-board. Resolve when package A1 is built.
- **`streak` semantics** — on a wrong answer the clock snaps 5s → 10s; alternating right/wrong
  oscillates. Ours to decide.
- **Next meeting is Tuesday 4 Aug, not Monday 3 Aug** — the transcript has him travelling Monday.

## Next 3 actions

1. **Amend the approved plan** to add `source_excerpt`, then write and apply
   `db/005_add_simulated_difficulty.sql` (`simulated_p`, `simulated_n`, `simulator_model`,
   `source_excerpt`). Paste into the Neon web SQL editor — `psql` is not installed.
2. **Re-run the spike grounded and at n=30**, comparing grounded vs ungrounded on the same 15
   questions. That comparison is the real validation, and it is also a publishable result.
3. **Then the fan-out**, which K unblocked and which is still untouched: **G1** (generator → writes
   `content_items` + `source_excerpt`), **D1** (`app/dashboard/` — the professor's first instruction,
   still does not exist), **Q1** (server-side scoring; `/api/questions` still ships `answer` for all
   200 rows and `/api/events` trusts whatever the client posts).

## Do not redo

- **Do not learn the professor's spec from summaries.** Read `docs/meeting/Jul 27 at 3-39 PM.txt`.
- **Do not ask a model to rate difficulty 1–5.** Tried, failed on three independent samples. Simulate
  attempts and measure failures instead.
- **Do not use a large model as the simulator.** Weaker models simulate students better, and a large
  one would ace the AirBnB validation set from memory rather than from the deck.
- **Do not use `gemma4:31b-cloud`** — it is a cloud model despite appearing in `ollama list`.
- **Do not conclude the method works from the n=4 spike.** It passed its gate; it did not measure
  difficulty.
- **Do not merge `simulated_p` into `empirical_p`**, or `cognitive_level` into either.
- **Do not bin with fixed thresholds.** Use quintiles over the observed distribution.
- **Do not plan to calibrate from a 5–6 person pilot.** At n=5–6 an observed 40% facility spans
  roughly 12–77%.
- **Do not use Wordle data as primary retention evidence.** It manufactures what it measures.
- **Do not build per-item Elo.** ~20 responses per item cannot converge; 200–500 are needed.
- **Do not add vitest or jest**, and **do not use `node --test tests/`** — Node 24.11.1 resolves it as
  a module name. The working form is `node --test tests/*.test.ts`.
- **Do not remove `allowImportingTsExtensions`** from `tsconfig.json` — without it `next build` fails
  on `tests/`.
- **Do not put a CHECK on `events.cognitive_level`** — append-only log on the answer path; a failed
  INSERT loses research data.
- **Do not rename `LeverSupport` back to `Lever`** in `lib/games/registry.ts`.
- **Do not reinstate LibreOffice**, add a `passage` content type nothing consumes, or recreate
  `docs/PROJECT_BACKLOG.md`.
- All prior "do not redo" items from the 29 Jul checkpoint still stand (no Poppler/ImageMagick, no npm
  ZIP library, no `psql`, no bcrypt/argon2, no steering prompt on `codex exec review`).
