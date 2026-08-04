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

Branch `main`, clean. **188 tests, `tsc --noEmit` clean, `npx next build` succeeds.**

- `e325e98` Test whether 3 difficulty bands beat 5, and find the real constraint
- `0f2ea75` Stop the badge claiming a level nothing is honoring
- `16c8c3d` Bring HANDOFF and CLAUDE.md up to the cohort swap
- `e5e3e65` Checkpoint: the cohort is swapped and live, and 9 rows may be too few
- `ea3dcb4` Swap the term cohort: 34 screened items in, 34 superseded
- `596fa1c` Apply db/010; the retirement allowlist now has room for the swap
- `f66a851` Widen the retirement reasons, ready for the cohort swap
- `e243022` Make the clue earn its answer, and drop a detector that could not work
- `b457d5e` Checkpoint: the generator is rebuilt, the items are screened, nothing is written
- `ef61550` Screen generated items before they reach the database, not after

`16c8c3d` also fixed HANDOFF.md §16, which had gone stale saying match-the-following was "not
started" though A1 and A3 shipped 1 Aug — the note about that drift in this file is now resolved,
not still open.

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

**MCQ difficulty distribution, verified live (4 Aug 2026):** bands 2/3/4/5 hold 6/5/2/4 rows, **band
1 is empty**, and the six band-2 rows all sit at facility **1.00** — no ranking information; they land
in band 2 rather than 1 only because ties share a band. Usable range is 2–5, one band (2) two items
wide in practice.

## In progress right now

Nothing mid-flight. The cohort swap is complete and committed, the badge bug is fixed and committed,
and the band-count analysis is complete and committed (nothing in the pipeline changed as a result).

**Playing the game (the previous checkpoint's next action 1) is done and found a real defect.**
Every game opened showing "Level 2" (`START_DIFFICULTY`, `lib/game/engine.ts:23`) regardless of
whether item selection actually honoured difficulty. Word already gated correctly on
`difficultyHonored`; match and quiz did not gate at all, and match's route computed the flag,
passed it to `issueBoardToken`, and never returned it in the response — the same client/server seam
that shipped the A3 badge bug in the opposite direction on 1 Aug. Fixed 4 Aug (`0f2ea75`): gated
everywhere. **The badge now correctly disappears from all three games**, because no term row has a
difficulty and the 17 calibrated `mcq` rows sit under the 20-row floor. Record as a "do not redo":
this is a false signal removed, not a regression — nobody should "fix" the badge back on.

This exposed a live risk worth carrying forward: **the quiz's badge is hidden by a row-count floor,
not by a decision.** Calibrate three more MCQs and it switches itself on and difficulty resumes
driving quiz selection — a behaviour change triggered by data volume rather than by anyone choosing
it. Left untouched deliberately, because wiring changes wait on the experimental-contrast decision.

Playing also surfaced the repetition the user had reported separately. **That is not a defect.**
Selection is least-recently-served soft ranking with hard dedup only within a round; against 25
Digital Transformation and 9 International Management rows and 10-question rounds, repeats are
arithmetic, not a bug. The fix is more decks, not code — hard whole-history exclusion is exactly what
once locked a student out of match after 8 boards (see Do not redo, below).

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
- **Gate the Level badge on `difficultyHonored` in every game, not just word** (4 Aug 2026,
  `0f2ea75`) — match and quiz were showing a level nothing was honouring.
- **Keep difficulty at 5 bands; raise `n` toward ~120 rather than cut to 3 bands** (4 Aug 2026,
  `e325e98`) — see the band-count analysis below. This is a recommendation on record, not yet
  actioned; no item set has been re-run at higher `n`.

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

## Band-count analysis (4 Aug 2026, `e325e98`)

Question: would 3 difficulty bands beat the current 5? New: `scripts/analyse-band-count.mjs`,
`scripts/lib/tertile-difficulty.mjs`, `scripts/lib/kappa.mjs`, plus tests. **Nothing in the pipeline
changed as a result** — difficulty stays at 5 bands and `quintile-difficulty.mjs` is untouched.

Result is mixed, not a win for either band count:

| dataset | κ 3-band | κ 5-band | QWK 3 | QWK 5 |
|---|---|---|---|---|
| reproducibility, 33 items | 0.46 | 0.32 | 0.73 | 0.79 |
| term MCQs, 50 items, 6 pairs | 0.17 | 0.23 | 0.26 | 0.35 |
| slide MCQs, 17 items, 10 pairs | 0.36 | 0.29 | 0.56 | 0.57 |

Two caveats that travel with that table:
- Raw agreement always rises when categories are cut (chance goes ⅕ → ⅓), so raw agreement figures
  prove nothing on their own — that is why kappa was used instead.
- **Quadratic-weighted kappa is not comparable across different category counts** — it penalises an
  off-by-one error as 1/16 at five bands but 1/4 at three, so it structurally favours more categories.
  This undercuts the "5 bands wins on QWK" reading. **Flagged as reasoning, not a cited result — it
  needs a source before it goes in the paper.**

**The load-bearing finding, which neither metric above shows directly:** at n=30, two facilities are
only distinguishable if they differ by about **0.26**. The observed facility range gives band widths
of **0.13 at five bands and 0.22 at three — both under that noise floor.** So the band count was never
the binding constraint; **n is.** Roughly **n=42** makes three bands resolvable, **n=118** makes five.
Recommendation on record: keep 5 bands and raise n to ~120, a one-time ~1.5 hours of local CPU per
item set (the 33-item run took 24.5 min at n=30). Cutting to 3 bands at n≈45 is the cheap option but
buys coarser information, not better information.

Supporting evidence: `qwen2.5:1.5b` ties 34 of 50 items and leaves a band empty **even at three
bands** — a ceilinged simulator, not a slicing problem.

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
- Carried forward: Wordle viability, rapid/normal exact seconds, points-table numbers, r ≈ 0.5
  expectation for prose.

_Resolved since the last checkpoint: HANDOFF.md §16's stale "match-the-following not started" note
was fixed in `16c8c3d`._

## Next 3 actions

1. **Settle the experimental contrast with Prof. Singh**, and get the lever-drop decision recorded in
   `docs/meeting/`. Unchanged top blocker — everything else here is secondary to this.
2. **Decide the three marginal CAGE items** (listed under Open questions). Retiring them takes
   International Management to 6 live rows, which would almost certainly break match for that
   subject, given the 9-row pool is already thin for a 6-tile bijection board.
3. **If calibration work resumes, re-run at `n≈120` rather than `n=30`**, per the band-count analysis
   above — the band count (5 vs 3) was never the binding constraint on resolvability, `n` was. Not
   scheduled; recorded as the correct next step whenever calibration is picked back up.

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
- **Do not re-enable the Level badge without calibrating more items.** It is correctly hidden right
  now (`0f2ea75`) because no term row has a difficulty and the 17 calibrated `mcq` rows sit under the
  20-row floor — this is a false signal removed, not a regression.
- **Do not treat repeated items within a round as a defect.** Selection is least-recently-served with
  hard dedup only within a round; with 25 Digital Transformation and 9 International Management rows
  against 10-question rounds, repeats are arithmetic. The fix is more decks, not code — hard
  whole-history exclusion is what once locked a student out of match after exactly 8 boards.
- **Do not cite the QWK columns in the band-count table as evidence 5 bands beat 3.** Quadratic-
  weighted kappa is not comparable across different category counts and structurally favours more
  bands; it is reasoning recorded for later checking, not a result ready for the paper.
