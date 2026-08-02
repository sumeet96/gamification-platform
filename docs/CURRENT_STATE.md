# Current state — 2 August 2026

## Where we are

Six packages remain shipped and working (G1 generator, G2 term generator, D1 dashboard, Q1 quiz
hardening, A1 match, A3 choose-the-right-word); 127 tests, `tsc --noEmit` clean, migrations `db/005`–
`db/008` live on Neon project `ancient-brook-62806105`. This session ran the **term-item difficulty
calibration** end to end and it succeeded on every discrimination criterion — but **nothing was
written to the database**, deliberately, and that hold is the single most important thing to carry
forward. Along the way the `--from` apply path in `scripts/calibrate-difficulty.mjs` turned out to be
completely non-functional for term items and was repaired; a second review pass caught that the repair
itself had broken the fresh-simulation path. The headline blocker from the last checkpoint is
unchanged and still the top item: **the professor reportedly dropped the adaptive-difficulty lever,
there is still no transcript, and the experiment currently has no between-arm contrast.**

## Working tree

Branch `main`, clean — nothing uncommitted, nothing untracked.

- `447cdb4` Calibrate the 33 clean term items, and find out what a rerun is worth
- `116a3eb` Make the calibration path able to write term difficulty, and only to the right rows
- `8c6f343` Stop term items giving away their own answer, without eating the good ones (prior session)

**`spike-data/` is entirely gitignored (`.gitignore:69`), so none of the run artifacts or run
wrappers below are versioned.** This is a real durability gap, not an oversight to reproduce: it means
`spike-data/run-term-llama3b.sh` — which CLAUDE.md explicitly tells future sessions to *copy, not
re-derive* for its PID-mutex pattern — would be lost on a fresh clone. Present on this machine only:

| file | what it is |
|---|---|
| `spike-data/termcal-llama3-2-1b.json` | **the kept calibration run** (id-seeded, 33 items) |
| `spike-data/termcal-llama3-2-1b-posseed.json` | the first run, positional seeding — keep, it is the replication pair |
| `spike-data/terms-mcq-clean.json` | the 33-item fixture; **required** by `--from` to recover item ids |
| `spike-data/excerpts-terms-mcq-clean.json` | aligned excerpts for the above |
| `spike-data/term-census-2026-08-02.txt` | the 33/10/7 census with every rejected and repairable row named |
| `spike-data/run-term-llama1b.sh` | the calibration run wrapper |
| `spike-data/termcal-llama1b.log`, `termcal-llama1b-idseed.log` | run logs |

## In progress right now

Nothing is mid-flight. The calibration is finished and committed; the interrupted thing is the
**decision to write it to the DB, which was deliberately deferred to the 4 Aug meeting.**

The write is one command away and fully rehearsed. To execute it (only after the design question is
settled — see below):

```
node scripts/calibrate-difficulty.mjs --from spike-data/termcal-llama3-2-1b.json \
  --items spike-data/terms-mcq-clean.json --dry-run
```

Drop `--dry-run` to write. Expect: 33 items, `simulator_model=llama3.2:1b`,
`simulator_method=grounded-retention`, `simulated_n=30`, distribution `d1=6 d2=7 d3=5 d4=7 d5=8`.

**Do not just run it.** The reason for the hold is a live behaviour change, described under Decisions.

## What the calibration actually produced

`llama3.2:1b`, grounded + retention-gated, n=30, 33 items, 24.5 min, 100% CPU. Passes all five
discrimination criteria: mean facility **0.531**, IQR **0.333**, ceiling **0/33**, floor **0/33**,
retention gradient **0.45 / 0.48 / 0.63 / 0.65 (monotonic)**, 0 unparseable, spread 0.70 (gate is
<0.20 = fail). Simulated cohort per item: Below Basic 8, Basic 11, Proficient 8, Advanced 3.

**Same-simulator replication — the most transferable result of the session.** The run was executed
twice with identical config, differing only in seeding scheme (see Decisions). That is a clean
same-model, same-items, same-n replication, which had never been measured:

- Spearman **ρ = 0.826**; mean |Δp| = **0.088**, max 0.233
- Band stability: **45% identical (15/33), 91% within one band (30/33)**, 3 moved two bands, none more
- First run for comparison: mean 0.516, IQR 0.300, gradient 0.41/0.48/0.64/0.61 — **not** monotonic
  (Advanced 0.61 < Proficient 0.64). The Advanced tier is 3 of 30 students; the inversion is within
  noise and did not reproduce.

Two implications, both written up in `docs/experiments/2026-08-02_term-item-calibration.md`:
1. mean |Δp| = 0.088 is what pure sampling noise looks like at n=30 (CLAUDE.md's own SE ≈ 0.09 predicts
   ≈0.10). The five-band decision is now corroborated by measurement, not only by argument.
2. **ρ = 0.826 is a reproducibility CEILING.** The cross-simulator ρ = 0.62 should be read against
   ~0.83, not against 1.0. Caveat and state it: that 0.62 is a different item type (slide MCQs) and a
   different model pair, so this frames the number, it is not a like-for-like comparison.

Counterweight to state in any write-up: 45% exact band agreement means a per-item band is a **±1 band**
statement, not a point estimate.

## Decisions made this session

- **Calibrate 33 of 50 term rows, not all 50** — the live rows predate `8c6f343`'s validator. Census
  reproduced that commit exactly: 33 clean, 10 repairable, 7 rejected (all 7 genuine chart captions:
  Netflix Subscribers Statistics 2025, Mattel Japan Market Share, Leading Toy Brands Japan/China/USA,
  Leading Toy Markets 2024, Google's Market Share). The 10 repairable are excluded because their
  distractors are due to be regenerated and **distractors are what make an MCQ hard** — calibrating
  them now would measure an item that is about to stop existing.
- **Hold the DB write until the 4 Aug contrast decision** — user's call when given the options.
  Writing is not inert: difficulty-based pool narrowing is still live in the shipped app.
  `app/games/word/page.tsx:115` and `app/games/match/page.tsx:133` both still send a `difficulty`
  param, and `lib/games/match-board-select.ts:92` omits `minCalibrated` so **match narrows its pool as
  soon as one row in a subject is calibrated** (word waits for 20, `MIN_CALIBRATED_FOR_DIFFICULTY` at
  `app/api/word/question/route.ts:60`). Writing 33 of 50 would orphan the other 17 and leave Digital
  Transformation building 6-tile boards from 11 items — the pool-starvation failure A1 already hit.
- **Fresh simulation is `kind='mcq'` only; term items reach the DB solely via `--from`** — widening the
  candidate query for `--from` had broken the fresh path it shares, because term rows have null
  `stem`/`options`/`answer`, so `shuffled()` threw, the throw was swallowed as a transport error, and
  the item scored `p=0.0 → difficulty=5`. It aborted on the 2nd term item today, but under a
  mostly-MCQ pool the error budget absorbs it and writes a wrong difficulty silently.
- **Item identity comes from an explicit `--items` fixture, joined by index, guarded on prompt text** —
  run files carry no id, only an index. Length and `r.i === i` are **not** sufficient: `terms-mcq-clean.json`
  is regenerated in place and ordered by 32-hex id, so the coming repair pass inserts re-admitted rows
  at pseudorandom positions. If one row also drops, length still matches and every `r.i` still equals
  `i` while 20+ items silently take another item's difficulty. Prompt text is now compared per row.
- **A subset apply is refused by default, per kind** — binning is a rank over whatever set you hand it,
  so calibrating 33 now and 17 after repair would put two incompatible d1–d5 scales in one pool where
  hardest-of-17 and hardest-of-33 both read d5. `--allow-partial-apply` overrides deliberately. The
  check is per-kind, so the 17 already-calibrated `kind='mcq'` rows do not block a term apply.
- **Seeds now derive from `hashId(item.id)`, not array position** (`scripts/spike-simulate-difficulty.mjs`,
  shared helper moved to `scripts/lib/simulate-students.mjs`). CLAUDE.md already required this; the
  simulator was not doing it. This is what makes a subsetting flag safe — dropping 17 rows had been
  re-seeding every survivor after the first drop. It is also why the run was executed twice.
- **Stale-lock clearing is now atomic** (`mv` then `rm -rf`, applied to both `run-term-llama1b.sh` and
  `run-term-llama3b.sh`) — the old `rm`+`rmdir` let two racers both clear the same stale lock and both
  `mkdir` successfully, with the second destroying the first's freshly-live lock.
- **Skipped `codex-review`** — the project rule requires a `reviewer` pass before commit on risky
  changes; that happened twice and found real defects both times, and nothing touched the DB.

## Open questions / blocked on

- **Is there still a between-arm experimental contrast, and what is it?** Unchanged from the last
  checkpoint and still the top item. Unblocked only by Prof. Singh, Tue 4 Aug. Everything else is
  secondary.
- **The lever-drop decision still has no transcript.** `docs/meeting/` has no record. Confirm in
  writing or recording.
- **Should the DB write proceed, and in what form?** Three viable shapes, all deferred to 4 Aug:
  (a) hold indefinitely; (b) write and turn the lever off in code (stop clients sending `difficulty`,
  pass `minCalibrated` to match); (c) delete the 7 caption rows, repair the 10 leakers, calibrate all
  43, write once with a single consistent scale. (c) is the cleanest research artifact and costs paid
  generation calls plus ~25 min of Ollama.
- **`spike-data/` being gitignored** — the run wrappers are code, not data. Moving them to `scripts/`
  would version them but changes a path CLAUDE.md cites by name. Needs a call.
- **Windows/libuv crash**, found while building the subset guard: a second `sql` SELECT issued right
  before `process.exit(0)` reliably aborts with `UV_HANDLE_CLOSING` (3/3 repro, neon-serverless on
  Node/Windows). Designed around by reusing the already-fetched `candidates` array; could recur in any
  script doing sequential `sql` calls before exit.
- Carried forward, unchanged: Wordle (A4) viability (5 of 50 terms qualify, all proper nouns); exact
  rapid/normal seconds (10s/15s assumed); points-table numbers including match's 15/30/−20; whether
  asserted 1–5 bands track real student performance (only pilot `empirical_p` answers it); does
  simulated facility track real facility (expect r ≈ 0.5 for prose, not 0.75–0.82).

## Next 3 actions

1. **Settle the experimental contrast with Prof. Singh at the Tue 4 Aug meeting**, and get the
   lever-drop decision in writing or recording so it can land in `docs/meeting/`. Agenda also carries:
   points-table numbers, rapid/normal exact seconds, Wordle's viability, and the r ≈ 0.5 expectation
   for management prose (tell him *before* the pilot, not after).
2. **Then decide the DB write.** Rehearse first with
   `node scripts/calibrate-difficulty.mjs --from spike-data/termcal-llama3-2-1b.json --items spike-data/terms-mcq-clean.json --dry-run`
   and expect `d1=6 d2=7 d3=5 d4=7 d5=8`. If option (c) above is chosen instead, first delete the 7
   caption rows and run the repair pass on the 10 leakers, then
   `node scripts/build-term-mcq-spike.mjs --validated-only` and `bash spike-data/run-term-llama1b.sh`
   again over all 43 so there is one consistent scale.
3. **Fix the match/word narrowing asymmetry** — `lib/games/match-board-select.ts:92` passes no
   `minCalibrated` and so defaults to 0. Independent of the calibration and wrong either way, but it
   only becomes urgent once any term row is calibrated.

## Do not redo

Everything under "Do not redo" in the 1 Aug checkpoint still stands (adaptive machinery stays parked,
`llama3.2:3b` for slide MCQs and `llama3.2:1b` for term items, no `gemma2:9b`/`qwen2.5:1.5b` for
terms, five bands only, no rank-position binning, no whole-history exclusion in item selection, no
per-pair match penalty, no `git add -A` with PDFs present, Gemini credits depleted so generation runs
on OpenAI, no vitest/jest, and the rest). Added this session:

- **Do not write this calibration to the DB without deciding the pool-narrowing question first.** It
  is not a passive data load; it activates a live branch that orphans the 17 uncalibrated term rows.
- **Do not run `calibrate-difficulty.mjs --from` without `--items`.** Run files carry no item id — only
  an index — so identity is unrecoverable from the run file alone.
- **Do not trust length + `r.i === i` as an alignment guard.** Both hold under a reorder-plus-drop, and
  the failure silently writes correct-looking difficulty to the wrong items. Prompt text is compared
  now; keep it.
- **Do not apply two separately-binned subsets into the same kind's pool.** d1–d5 over 17 items and
  d1–d5 over 33 items are different scales and `lib/games/item-select.ts:106` compares them as equals.
- **Do not let the fresh-simulation path see `kind='term_definition'` rows.** Null `stem`/`options`
  throws inside `shuffled()`, gets swallowed as a transport error, and scores `p=0.0 → difficulty=5`.
- **Do not clear a stale lock with `rm`+`rmdir`.** Two racers both clear and both acquire; use the
  atomic `mv` then `rm -rf` now in both run wrappers.
- **Do not re-derive the bake-off values from the clean 33-item run.** The bake-off arms ran over all
  50 rows including the 7 captions and 10 leakers; the sets are not comparable, and removing the
  leakers is why mean facility moved 0.54 → 0.53.
- **Do not treat the two run files as interchangeable.** `termcal-llama3-2-1b.json` (id-seeded) is the
  one to apply; `-posseed.json` is the replication pair and exists to support the ρ = 0.826 figure.
  Deleting either destroys the stability result.
- **Do not quote ρ = 0.826 as cross-simulator agreement.** It is same-model, same-items, differing only
  in seed — a reproducibility ceiling, not an agreement figure.
- **Do not issue a second `sql` SELECT immediately before `process.exit(0)`** on Windows — reliable
  `UV_HANDLE_CLOSING` abort.
