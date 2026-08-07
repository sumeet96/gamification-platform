# Term-item (`term_definition`) difficulty calibration

Run 2 Aug 2026. Simulator `llama3.2:1b`, the bake-off's pick for term MCQs
(`docs/CURRENT_STATE.md`, 1 Aug 2026). Grounded, retention-gated, n=30 simulated students per item,
provider Ollama, 100% CPU. Items rendered as 4-option MCQs by `scripts/build-term-mcq-spike.mjs`
(clue as stem, term + 3 distractors as options).

## Lead finding — run-to-run stability, not the headline numbers

The calibration was run twice with identical configuration, differing only in RNG seeding: once
under the old positional seeding, once after seeding was corrected to hash the item **id** (the
standing rule in `CLAUDE.md`, forced by the same `8c6f343` cleanup that produced this item set). That
accident produced a clean same-simulator, same-model, same-items, same-n replication.

| | Run 1 (positional seed) | Run 2 (id-based seed, the kept run) |
|---|---|---|
| mean facility | 0.516 | 0.531 |
| IQR | 0.300 | 0.333 |
| ceiling (p≥0.95) | 0/33 | 0/33 |
| floor (p≤0.05) | 0/33 | 0/33 |
| gradient (BB/B/P/A) | 0.41/0.48/0.64/**0.61** | 0.45/0.48/0.63/0.65 |
| monotonic | no — Advanced dips below Proficient | yes |

Between the two runs: Spearman ρ = **0.826**, mean |Δp| = 0.088, max |Δp| = 0.233. Band movement on
the 1–5 column: exact agreement 15/33 (45%), moved 1 band 15/33, moved 2 bands 3/33, moved 3+ bands 0
— 91% within one band.

Two things follow, both arithmetic on the numbers above, not new claims:

1. **The noise matches the theory CLAUDE.md already states.** At n=30 the standard error on a success
   rate is ~0.09 (the reason difficulty stays at five bands, not ten). Two independent estimates each
   with SE 0.09 imply an expected mean absolute difference of about 0.10. The observed 0.088 sits
   right there — this run corroborates the five-band decision, it does not add a new one.
2. **ρ = 0.826 is a same-simulator ceiling, not a target.** The project's cross-simulator agreement
   figure — pooled ρ = 0.62 on genre-matched unmemorised slide decks (`docs/CURRENT_STATE.md`,
   1 Aug 2026) — should be read against ~0.83, not against 1.0. That comparison is a frame of
   reference only: different item type (slide MCQ vs term MCQ) and a different model pair, so it is
   not like-for-like.

Run 1's non-monotonic Advanced tier (0.61 below Proficient's 0.64) did not reproduce in run 2 and is
most likely sampling noise — Advanced is only 3 of 30 simulated students per item, the thinnest tier.

## Item set: 33 of 50, and why

The 50 live term rows predate the giveaway/chart-title validator added in `8c6f343`. A new
`--validated-only` flag on `scripts/build-term-mcq-spike.mjs` runs the live rows through
`validateTerms()` and keeps only the passing bucket. Census on the 50 rows matches `8c6f343`'s own
census exactly: **33 clean, 10 repairable, 7 rejected.**

- The 7 rejected are all `chart-title-term`: Netflix Subscribers Statistics 2025, Mattel Japan Market
  Share, Leading Toy Brands Japan, Leading Toy Brands China, Leading Toy Markets 2024, Leading Toy
  Brands USA, Google's Market Share.
- The 10 repairable are all `option-set-giveaway`, including Minimum Viable Products, Story Wall and
  User story cards — the exact items `8c6f343` records as false-positive casualties of the earlier,
  over-strict rule.

The 17 were excluded rather than calibrated as-is because distractors drive an MCQ's difficulty, and
the repairable rows' distractors are due to be regenerated on repair — an estimate taken now would go
stale. Subject split of the kept 33: International Management 22, Digital Transformation 11.

## The kept run in full

mean facility 0.531, IQR 0.333, ceiling 0/33, floor 0/33, gradient 0.45/0.48/0.63/0.65 monotonic,
0 unparseable responses, spread (max − min) 0.70 against the script's own <0.20 flatness gate,
runtime 24.5 min. Simulated cohort per item: Below Basic 8, Basic 11, Proficient 8, Advanced 3.
Against the project's discrimination criterion — mean ~0.50–0.65, ceiling <20%, floor <10%,
monotonic gradient, IQR >0.30 — this run passes on all five. Resulting band distribution: d1=6, d2=7,
d3=5, d4=7, d5=8.

## Honest limitations

- 45% exact band agreement across the reproducibility pair means a single band assignment is not
  stable across reruns; treat any per-item difficulty here as ±1 band, using the 91%-within-one figure
  as the support for that, not the 45%.
- Simulator-vs-simulator throughout. `empirical_p` is null on every row — nothing here is validated
  against human students.
- Advanced is 3 simulated students per item, the thinnest of the four tiers.
- `llama3.2:1b`'s term gradient was step-shaped in the bake-off (0.49/0.49 then 0.63/0.63); this run's
  0.45/0.48/0.63/0.65 shows the same low-pair/high-pair structure, not four cleanly resolved tiers.
- Reproducible only under a pinned model and environment (established for the slide-item simulator in
  `docs/experiments/2026-07-31_grounded-difficulty-simulation.md`, Result 9; not independently
  re-verified here).

## Status — nothing was written to the database

Verified by dry-run only. `content_items` still shows 0 of 50 term rows with `simulated_p` or
`difficulty`; `empirical_p` is null on all 67 rows. The hold is deliberate, not an oversight:
difficulty-based pool narrowing is already live in the shipped app —
`app/games/word/page.tsx:115` and `app/games/match/page.tsx:133` both send a `difficulty` param, and
`lib/games/match-board-select.ts:92` omits `minCalibrated`, so match narrows its pool as soon as any
row in a subject is calibrated. Writing 33 of 50 would orphan the other 17 and leave Digital
Transformation match boards drawing 6 tiles from 11 items — the pool-starvation failure package A1
already hit once (`CLAUDE.md`, "exercise the artifact" convention). Per the standing rule that
difficulty is now an analysis covariate rather than a selection input, the write waits until the
experimental contrast is settled at the 4 Aug meeting.

## Reproduce

```
node scripts/build-term-mcq-spike.mjs --validated-only
bash spike-data/run-term-llama1b.sh
node scripts/calibrate-difficulty.mjs --from spike-data/termcal-llama3-2-1b.json \
  --items spike-data/terms-mcq-clean.json --dry-run
```

`spike-data/` is gitignored, so neither the run wrappers nor the raw outputs are versioned.

---

## Standing calibration rules (moved from CLAUDE.md, 7 Aug 2026)

These were conventions in CLAUDE.md. They belong with the calibration results rather than in
launch-time context. Nothing was edited in the move.

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
  - _Correction, 3 Aug 2026 — discrimination is necessary, not sufficient:_ a weak simulator's low
    facility score can mean the simulator is ignorant, not that the item is hard. `llama3.2:1b` does
    not know Microsoft's search engine is Bing (`3b` does); the 1b term calibration ranked `Bing`
    (0.23) and `Yandex` (0.17) as its two hardest items, where the item gap screen (above) shows one
    is trivia and the other is a broken item. None of the discrimination criteria above — mean,
    ceiling, gradient, IQR — detect this. Stated plainly: **difficulty calibration cannot distinguish
    a broken item from a hard one; both read as low facility.**
  - _Bake-off COMPLETE, 1 Aug 2026 — the result is item-type dependent, not one winner:_ on slide
    MCQs (CAGE deck) `llama3.2:3b` wins (mean 0.72, 2/17 ceiling, monotonic); `llama3.2:1b` fails
    there (0/17 ceiling but the gradient does not resolve, 0.30/0.40/0.44/0.35). On term MCQs
    (50 items, `build-term-mcq-spike.mjs`) the ranking flips: `llama3.2:1b` wins (mean 0.54, 0/50
    ceiling) and `llama3.2:3b` is marginal (31/50 at ceiling). **Recommendation: `llama3.2:3b` for
    quiz MCQs, `llama3.2:1b` for term items.** Recognition tasks (choose-word) saturate a competent
    model; reasoning tasks (slide MCQs) do not. `llama3.2:1b`'s term gradient is step-shaped
    (0.49/0.49 then 0.63/0.63) — it separates low from high retention but does not resolve four
    tiers cleanly; state that caveat in any write-up. Full tables: `docs/CURRENT_STATE.md`.

---

## How difficulty is established (moved from CLAUDE.md, 7 Aug 2026)

The full method and its corrections, moved verbatim out of launch-time context. The one-line rule
that stays in AGENTS.md is: difficulty is empirical, never asserted, and cognitive level is a
generation control rather than a hardness ordering. Everything below is how that was established.

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
  - _Open design question, not a bug, flagged 3 Aug 2026:_ if a course teaches public professional
    vocabulary — the item gap screen below turned up `Agile Manifesto`, `User Story`, and `Standup
    Meeting` scoring 1.00 ungrounded because a competent model has read every Agile blog written — no
    recall-style item can require the deck, since the vocabulary predates and outlives the course
    material. That is a property of the subject matter, not a generation defect. It argues term games
    should test *application* rather than recall, the way the quiz's reasoning MCQs already do. Raise
    at the 4 Aug meeting; not resolved.
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
