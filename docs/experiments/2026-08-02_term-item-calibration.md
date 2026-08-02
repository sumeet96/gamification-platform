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
