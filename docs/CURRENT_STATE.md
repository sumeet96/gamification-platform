# Current state — 6 August 2026

## Session of 6 Aug 2026 — Connections chosen, and its headline claim measured down

**Still nothing in `app/` or `lib/` has changed.** 188 tests, `tsc --noEmit` clean, DB untouched.
This session ran the RFC and two spikes against it.

### The RFC came back unanimous, with a caveat we should carry

All five model families (ChatGPT via API and via Playground, Claude, Gemini, DeepSeek, Grok) chose
**Connections** over crossword, on the same three grounds in the same order. **The framing was ours:**
§7.1 listed crossword's open problems and §7.2 listed Connections' settled advantages, and the system
message fixed the justification order as learning/research/build — the order in which Connections
wins. Treat the verdict as real and the unanimity as partly manufactured.

Effort estimates spread 7× (Gemini 30–40h → Claude 215–285h), entirely on whether the content
pipeline and human review were counted. **Three of five independently recommended hand-authoring
boards for the pilot and building the pipeline after.** That is the plan of record.

The Playground chat run broke the output contract (delivered sections 1–3, promised a "Part 2"); the
API run followed it exactly. Use the API panel for any re-run.

### The measured result, which is the important part

The whole learning-value case for Connections was that partitioning requires the material's own
structure where recall does not. `scripts/spike-connections-solve.mjs` tests that directly — 16
shuffled tiles, no deck, no excerpt, no labels — on three hand-curated boards, 10 trials each:

| board | `gemma2:9b` | `gpt-4.1-mini` |
|---|---|---|
| b2 change/process | 40% solved cold | 100% |
| b1 data/AI | 20% | 70% |
| b3 AI systems | **0%** | **40%** |
| control (Colours/Animals/Countries/Fruits) | 90% | 100% |

**Rank order replicates exactly across families. Levels do not, and they cross the keep/reject line.**
On `gemma2:9b` b3 looked clean; on `gpt-4.1-mini` it is solved cold 40% of the time. All three boards
fail the gate on the stronger model.

So the defensible claim is only the weaker one: **grouping is harder to do cold than recall is, not
that it requires the deck.** Do not write "Connections requires the material's structure" into the
paper without human data. Connections is still the right pick over crossword — crossword's construct
is recall, and recall items score ~1.00 ungrounded — but its advantage is smaller than the RFC
asserted. Full detail and the mechanism in `CLAUDE.md`.

### Two near-miss false signals, now standing conventions

1. **`llama3.2:3b` returned 0.10/4 on the real boards — an apparently decisive pass.** A capability
   control (Colours / Animals / Countries / Fruits) then scored **0.00/4 on the same model**: it
   cannot partition at all. The result was measuring the instrument. Third instrument in which "a
   weak simulator's low score can mean the simulator is ignorant" has bitten.
2. **The solve script pooled one verdict across boards** (1.10/4, "PASSES"), hiding a 40% board next
   to a 0% board — and separately printed "PASSES the gate" after all 30 trials had failed on a wrong
   model tag. Both fixed: per-board gate, and no verdict on zero observations (non-zero exit).

### Also corrected

**Do not use `distractors` as Connections tiles**, which §7.2 of the RFC asserted. They are generated
inventions; a tile asserts the string is a real concept, so sorting a fabricated term teaches it as
real. Use them offline as a confusability signal only.

### New files

- `scripts/spike-connections-harvest.mjs` — relation harvest, closed enum, no quota. Run over 8 DT
  decks. Real taxonomies found; also three failure classes needing a structural guard (rhetorical
  bullet lists, mutual-exclusivity violations, company-specific lists) — see `CLAUDE.md`.
- `scripts/spike-connections-solve.mjs` — the no-source screen, `--provider ollama|openai`.
- `spike-data/connections-boards-v1.json`, `connections-control-v1.json` (both gitignored), plus five
  result JSONs.
- 8 new course decks are in the repo root: Cloud, BigData, Blockchain, Sessions 5/6/6-7, Agentic AI,
  DGT-Pook. Root-level `*.pdf` is gitignored — **never stage with a broad `git add`.**

### Next actions from here

1. **Settle the between-arm contrast.** Unchanged top blocker, now 2 days older. §5.2 of the RFC is
   still blank and the lever-drop still has no transcript.
2. **Hand-author more boards and re-screen**, using the deck-specific-anchor rule (it moved a board
   from 100% to 40% solved cold — real, but not sufficient).
3. **Do not build until 1 is answered.** Several models flagged that a difficulty-only resolution
   would flip the verdict — Claude's flip is to fill-in-the-blanks, which is item-grained and already
   renders as an MCQ for the existing calibrator.

---

# Current state — 5 August 2026

## Session of 5 Aug 2026 — game 4 scoped, no app code touched

**Nothing in `app/` or `lib/` changed today.** The work was a design investigation into which game
ships fourth, plus one generation spike. Tests, build and DB are exactly as the 4 Aug section below
describes them.

**The 4 Aug meeting happened**; its outcome was not relayed into this session, so **§5.2 of the RFC
prompt (the between-arm experimental contrast) is still blank** and remains the top blocker.

### What was decided

- **Game 4 is crossword vs Connections, and it is not yet decided.** A multi-model RFC prompt is
  written: `docs/architecture/game4-rfc-prompt.md`. Send to five model families, synthesise, then
  pick. It asks each model to name what would flip its own verdict (§9), which is the most useful
  part of the synthesis.
- **Entry length is no longer the crossword blocker.** Fragment entries (any content word can be the
  grid entry, clue carries the rest) plus constituent expansion (CAGE → CULTURAL / ADMINISTRATIVE /
  GEOGRAPHIC / ECONOMIC) reach ≤8 cells on roughly a third of the bank. This was the user's insight
  and it overturned an earlier "crossword is not viable" reading. The residual problem is **fragment
  collisions**, which is a board-selection constraint, not a content defect. See `CLAUDE.md` and the
  RFC's §4.2–4.3.
- **Letter-constrained vs semantics-constrained game families** is now the frame for game choice.
  Wordle / Strands / the Mini stay dead; Spelling Bee and Letter Boxed are disqualified for having no
  clue channel at all. Connections is unaffected by any length constraint.

### Measured this session

- **The bank's canonical 9-cell floor**: across all 136 domain strings (34 terms + 102 distractors),
  none is ≤8 cells; range 9–35, median ~21, one single word. Verified by SQL against live Neon.
- **`scripts/spike-short-terms.mjs` (new, committed).** Tests whether that floor is a property of the
  material or of the prompt, by running the glossary pass twice over identical pages with one clause
  changed. **Result: 2 decks × 2 arms, 59 concepts, zero at ≤8 cells.** Short canonical terms cannot
  be prompted into existence. Outputs in `spike-data/short-terms-tw.json` and
  `short-terms-cage.json` (gitignored).
- **Unexpected second finding from the same run:** the permissive clause made terms *longer* (CAGE
  median 23→28) and **re-broke the chart-caption guard** — it emitted `Netflix Subscribers
  Statistics` and `Google's Market Share`, strings the prompt explicitly names as forbidden. Recorded
  in `CLAUDE.md` as a standing convention: a permissive instruction is not neutral, and the
  structural caption fix is fragile to unrelated prompt perturbation.
  - Caveats on that finding: it is stage-1 glossary output, so downstream validation would catch some
    captions — the regression is measured at generation, not at ship. Temperature is 0.7 with one run
    per arm, so run-to-run variance is unmeasured. Neither touches the 0-of-59 result.

### Reference material analysed

Four published business crosswords (two Crossword Labs). Findings are written into the RFC's §6 as
givens: consumer crossword generators are greedy freeform placers (~38×38 at <25% fill); density
needs short entries as connective tissue (best example: 6 of 22 at ≤8 cells); when the corpus lacks
them the generator pads with dictionary filler and content validity collapses (one 50-entry
"BUSINESS" puzzle contained PROSODY, PULL, ELEVATE — solvable with zero course exposure, the
quota-manufactures-garbage failure in a new instrument); bounding box is driven by length *variance*,
not mean; a 38-column grid is ~10px/cell at 390px, so mobile needs pan-zoom plus a focused-clue
banner; definitional prose is the right clue register, not the riddle register.

### Also written

`docs/meeting/2026-08-04_pre-meeting-brief.md` — a pre-meeting brief for the 4 Aug supervisor
meeting. **It is a brief, not a transcript, and records no decisions**; it carries a banner saying
so. The lever-drop decision still has no transcript in `docs/meeting/`.

### Next actions from here

1. **Settle the between-arm contrast** and record the lever-drop in `docs/meeting/`. Unchanged top
   blocker; §5.2 of the RFC is blank until it lands.
2. **Send the RFC to five model families and synthesise.** Do not start building either game first.
3. Everything in the 4 Aug "Next 3 actions" below still stands.

---

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
