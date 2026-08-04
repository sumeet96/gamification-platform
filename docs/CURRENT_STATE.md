# Current state — 4 August 2026

## Where we are

**The term-item cohort has been swapped and is live.** The game now serves 34 screened items
(25 Digital Transformation, 9 International Management) in place of the 43 unscreened rows that
produced the indefensible screenshots — items answerable by matching a country name. The generator
was rebuilt from a single-call-per-window flow into **two stages**: a glossary pass asks only what a
deck teaches (no quota, empty is a valid answer), then items are written from that glossary. Broken
items went **5 → 1 → 0** across three generations, and the one item the screen caught (Extreme
Programming, 0.10 grounded) was fixed to 0.97 by a new rule requiring the clue to name what
distinguishes its answer from its nearest distractor.

Half-built: the **calibration write is still deliberately unmade** (`simulated_p`, `difficulty`,
`empirical_p` are null on every term row), and the **between-arm experimental contrast is still
missing** — the professor reportedly dropped the adaptive-difficulty lever, there is no transcript,
and nothing has replaced it as the independent variable. That remains the top blocker and no amount
of item-bank work substitutes for it.

## Working tree

Branch `main`, clean. **164 tests, `tsc --noEmit` clean.**

- `ea3dcb4` Swap the term cohort: 34 screened items in, 34 superseded
- `596fa1c` Apply db/010; the retirement allowlist now has room for the swap
- `f66a851` Widen the retirement reasons, ready for the cohort swap
- `e243022` Make the clue earn its answer, and drop a detector that could not work
- `b457d5e` Checkpoint: the generator is rebuilt, the items are screened, nothing is written
- `ef61550` Screen generated items before they reach the database, not after

`db/009` and `db/010` are both **applied** to Neon `ancient-brook-62806105`; their in-file banners say
so. `spike-data/` is gitignored — the generator output (`gen3-*.json`), the screen inputs
(`gen3-mcq.json`, `excerpts-gen3-mcq.json`), the screen results (`gen3-gap-*.json`) and every run
wrapper live only on this machine.

## Database state — verified independently, not taken from an agent report

| kind | status | subject | rows |
|---|---|---|---|
| term_definition | **LIVE** | Digital Transformation | **25** |
| term_definition | **LIVE** | International Management | **9** |
| term_definition | superseded | Digital Transformation | 10 |
| term_definition | superseded | International Management | 24 |
| term_definition | chart-title-term | International Management | 7 |
| mcq | LIVE | Digital Transformation | 17 |

92 rows total, 184 events, no orphaned `source_id`, and **`simulated_p` / `difficulty` /
`empirical_p` null on every term row.**

Note for analysis: `events` went 162 → 184 mid-session, so ~22 responses were logged against the OLD
cohort. `retired_at` is what separates pre- from post-swap items in the log.

## In progress right now

Nothing mid-flight. The cohort swap is complete and committed.

**The next step is to play the game.** This project has found two defects — match locking a student
out after exactly 8 boards, and `difficultyHonored` computed but never sent — *only* by playing,
after each had passed every static check the project has. The database has been verified; the
experience has not. Run the app, play choose-the-right-word and match, and confirm the new items
actually appear and read well.

## Decisions made this session

- **Two-stage generation** (`scripts/generate-terms.mjs`) — the single call under a per-window quota
  is what manufactured chart captions: asked for N items from a page of charts, the model makes N.
  Verified — on the 9 pages where the old flow gave 6 drafts and 3 captions, the new flow gave zero.
- **A clue must name what distinguishes its answer from its nearest distractor.** `Extreme Programming`
  with distractors Scrum / Kanban / Lean Startup and a clue about "a framework that integrates
  business demands with software development rules" scored **0.10 grounded — worse than chance**,
  because that describes Scrum. The older, looser version scored 0.93. Making distractors more
  confusable without tightening the clue is what broke it. After the rule: 0.97.
- **Distractors are generated, never selected from the glossary** — glossary-sourced distractors paired
  `Globalization Journey` with `Global Footprint` as each other's distractor, both clues describing
  both, both items unanswerable. Invention cannot accidentally produce a correct answer.
- **Retire, never delete** — `db/009` + `db/010`. Six of the first seven bad rows already had `events`
  referencing them, and `events` is the append-only research dataset.
- **Screen before writing, never after** — `build-term-mcq-spike.mjs --from-json` reads generator
  `--dry-run` output; `scripts/import-terms.mjs` writes exactly what was screened, because generation
  is not deterministic and re-running it would write items nobody looked at.
- **Three items excluded by hand after passing the screen** — `Android Sessions by Game Category`,
  `Globalization Case Study`, `Other Dimensions of Distance`. All score >0.9 grounded and all are
  chart captions or slide headings. This is the honest boundary of the instrument.
- **Playwright MCP removed, Playwright CLI installed** — an MCP server loads tool schemas every
  session; a CLI costs nothing until called.

## What the gap screen is and is not worth

`scripts/analyse-item-gap.mjs`, both arms on `llama3.2` (3B), grounded arm on the FULL excerpt and
deliberately **without** `--retention` (that flag spreads ability tiers for difficulty; this arm only
asks whether the source answers the question at all, so ceiling here is a good sign).

- **The grounded arm is the gate and it works.** It caught Extreme Programming at 0.10, which reading
  the text would never have revealed.
- **The ungrounded arm does NOT work as a rejection gate.** It measures how *famous* a concept is.
  `Agile Manifesto`, `User Story`, `Standup Meeting` all score 1.00 ungrounded because the model has
  read every Agile blog written — they are good items. For a syllabus of public professional
  vocabulary this would reject the curriculum.
- **When the grounded arm ceilings, the gap collapses to `1 − ungrounded`** and carries nothing extra.
- Measured: old 50 — 5 broken, grounded mean 0.90, ungrounded 0.72. gen2 29 — 1 broken, 0.96, 0.687.
  **gen3 37 — 0 broken, 0.98, 0.79.** Grounded IQR on gen3 is 0.00, so the gate now only catches
  catastrophic items; it certifies "not broken", never "good".

## Open questions / blocked on

- **Is there still a between-arm experimental contrast?** Top blocker, unchanged. Prof. Singh.
- **The lever-drop decision still has no transcript.**
- **Should the three marginal CAGE items be retired?** `Applications of CAGE Framework` and
  `CAGE Framework for Different Industries` are near-duplicates of the real `CAGE Distance Framework`;
  `Future of Trade Forecast` is a projection, not a concept. One `UPDATE` with reason
  `under-determined` or `superseded`, and reversible. Human judgement — not a screen verdict.
- **Can a recall-style item ever require the deck, for a course teaching public vocabulary?** The
  ungrounded results say no. That argues term games should test *application*, as the quiz's reasoning
  MCQs already do. Design question for the professor, not a bug.
- **`generate-terms.mjs --out` records no provenance**, so `generator_model` and `recipe` were inferred
  at import. Both values are correct (`openai/gpt-4.1-mini`, windows of 3 — the run logs say so) but
  the next person cannot verify that from the file. `--out` should record what produced it.
- **Difficulty calibration cannot distinguish a broken item from a hard one** — both read as low
  facility. Worse: a weak simulator's low score can mean *the simulator is ignorant* — `llama3.2:1b`
  does not know Microsoft's search engine is Bing, `3b` does. None of the discrimination criteria
  detect this.
- **`spike-data/` is gitignored**, so run wrappers — including the PID mutex CLAUDE.md says to copy
  verbatim — are unversioned. They are code, not data.
- **HANDOFF.md §16 still says match-the-following is "not started"** though A1 and A3 shipped 1 Aug.
  Spotted by scribe, which correctly refused to invent a fix.
- Carried forward: Wordle viability, rapid/normal exact seconds, points-table numbers, r ≈ 0.5
  expectation for prose.

## Next 3 actions

1. **Play the game.** Start the app and play choose-the-right-word and match against the new cohort.
   The database is verified; the experience is not, and this project's two worst defects were found
   only this way. Check that the new items appear, that clues read well, and that match can still
   build boards from 25 Digital Transformation and only 9 International Management rows — **9 is thin
   for a 6-tile bijection board plus least-recently-served rotation, and is the most likely new
   defect.**
2. **Decide the three marginal CAGE items** (listed under Open questions). Retiring them takes
   International Management to 6 live rows, which would almost certainly break match for that
   subject — so action 1 informs this one.
3. **Settle the experimental contrast with Prof. Singh**, and get the lever-drop decision recorded in
   `docs/meeting/`. Everything else is secondary to this.

## Do not redo

All prior "do not redo" items stand. Added or reconfirmed this session:

- **Do not try to catch chart captions with lexical rules on the output.** Three attempts failed. The
  validator rejects `Google's Market Share` and passes `Market Share of Google`; a prompt naming
  `Netflix Subscribers Statistics 2025` as forbidden still produced `Mattel Market Share Variation`.
  Only the structural fix — ask what the deck teaches before asking for questions — worked.
- **Do not build a templated-distractor detector.** Tried, deleted. Run against the 38 real items it
  flagged 8 and 4 were good: `Agile Software Development` vs Waterfall/Spiral, `Thin Slice Team` vs
  Scrum Team, `Intraregional Trade` vs International Trade, `User Story` vs User Scenario. Those are
  shared head nouns, which this project's own giveaway fix requires. `Agile Software Development →
  Waterfall Software Development` is structurally identical to `Android Sessions by Game Category →
  iOS Sessions by Game Category`; the difference is semantic and no token rule reaches it.
- **Do not source distractors from the glossary.** Tried, verified worse.
- **Do not use the ungrounded arm as a rejection gate.** It measures fame, not defect.
- **Do not treat the gap as informative when the grounded arm is at ceiling.**
- **Do not write the pending term calibration** (`spike-data/termcal-llama3-2-1b.json`) — it was
  computed against the OLD cohort, which is now superseded. It is stale, not merely unapplied.
- **Do not delete `termcal-llama3-2-1b.json` or `-posseed.json`** — a matched pair carrying the
  ρ = 0.826 same-simulator reproducibility result.
- **Do not hard-delete a content item that has events.** Retire it.
- **Do not default `--subject`** in any script that computes `sha256(subject::term)` — a wrong subject
  produces ids matching nothing. One pass defaulted all 38 items to a single subject and mis-keyed 15.
- **Do not re-run the generator to reproduce a screened set.** Generation is not deterministic; import
  the JSON with `scripts/import-terms.mjs`.
- **Do not `nohup`-detach a long run** — the harness then tracks the launcher, not the job, and no
  completion notification fires.
- **Do not trust a subagent's claim that it ran a verification.** Three separate agents this session
  reported results they had not produced; one quoted the previous run's file verbatim, one claimed a
  migration was unapplied policy when asked to apply it, one inferred provenance and presented it as
  recorded. Check file mtimes and re-run.
- **Do not issue a second `sql` SELECT immediately before `process.exit(0)`** on Windows — it is a
  Node 24.11.1 exit bug, not neon-serverless; `playwright-cli --version` triggers the same assertion.
