# Current state — 3 August 2026

## Where we are

The session started on term-item difficulty calibration and ended somewhere more useful: **the
generator was rebuilt, because the item bank it produced was indefensible.** Playing
choose-the-right-word surfaced items answerable by matching a country name. Root cause was not the
50 rows but `scripts/generate-terms.mjs`, which asked one model call to find a concept, define it,
and invent wrong answers, per page window, under a quota — so a page of charts yielded chart
captions. It is now **two-stage**: a glossary pass asks only what the deck teaches (no quota, empty
is a valid answer), then items are written from that glossary. Verified: on the 9 pages where the
old flow produced 6 drafts and 3 captions, the new flow produced zero captions.

**29 regenerated items exist as JSON and have been screened. NOTHING has been written to the
database.** The app is still serving the old, bad cohort — 43 live term rows plus 7 retired. The
screenshots that started this will still mostly reproduce.

Also unchanged and still the top blocker: the professor reportedly dropped the adaptive-difficulty
lever, there is no transcript, and **the experiment has no between-arm contrast.**

## Working tree

Branch `main`, clean.

- `ef61550` Screen generated items before they reach the database, not after
- `4a0a557` Ask the deck what it teaches before asking it for questions
- `70a4c37` Retire the seven chart captions, and stop screening items with regexes
- `3a8dcf5` Ignore Playwright CLI's working files

**153 tests, `tsc --noEmit` clean.** `db/009_add_item_retirement.sql` is **applied** to Neon
`ancient-brook-62806105` (its in-file banner was corrected to say so).

`spike-data/` is gitignored, so none of the below is versioned. Present on this machine only:

| file | what it is |
|---|---|
| `gen2-cage.json` / `gen2-tw.json` / `gen2-cb.json` | raw generator output, 15 / 12 / 11 items |
| `gen2-mcq.json` + `excerpts-gen2-mcq.json` | **the 29 screened items**, merged, correct subjects, unique ids |
| `gen2-gap-ungrounded.json` / `gen2-gap-grounded.json` / `gen2-gap-report.json` | the screen on those 29 |
| `gap-ungrounded.json` / `gap-grounded.json` / `gap-report.json` | the screen on the OLD 50 |
| `termcal-llama3-2-1b.json` + `-posseed.json` | yesterday's calibration pair — **keep both**, they carry the ρ=0.826 result |
| `run-gap-gen2.sh`, `run-gap-screen.sh`, `run-term-llama1b.sh` | run wrappers with the PID mutex |

## Database state — verified live

67 `content_items`: 17 `mcq` (all calibrated), 50 `term_definition` (7 retired, 43 live).
162 events. **`simulated_p`, `difficulty` and `empirical_p` are all null on every term row** — the
calibration write is still deliberately unmade.

## In progress right now

Nothing mid-flight. The regenerated items are screened and waiting on three fixes before they can be
written.

**The immediate next step is the clue prompt in `scripts/generate-terms.mjs`.** The screen found
exactly one broken item and it is the instructive one:

```
STEM:    "A software development framework that integrates business demands with software
          development rules to achieve shared and realizable goals."
OPTIONS: Extreme Programming / Scrum Framework / Kanban Method / Lean Startup Model
```
Grounded score **0.10 — worse than chance**, so the model reads the source and picks Scrum. The
clue describes Scrum as well as XP. The *old* version of this same item scored 0.93 grounded, so
**regeneration made it worse**: pushing for genuinely confusable sibling distractors, paired with a
generic clue, produces an unanswerable item. The fix is not "never a synonym" — it is that **the
clue must state what distinguishes the answer from its nearest sibling.**

## What the screen actually established

Both arms, `llama3.2` (3B), n=30, on 29 items:

| | old bank (50) | regenerated (29) |
|---|---|---|
| broken (grounded < 0.5) | 5 | **1** |
| grounded mean | 0.90 | **0.96** |
| ungrounded mean | 0.72 | 0.687 |

- **The grounded arm is the gate and it works.** It caught the one broken item, which reading the
  text would never have revealed.
- **The ungrounded arm does NOT work as a gate.** It measures how *famous* a concept is. `Agile
  Manifesto`, `User Story` and `Standup Meeting` all score 1.00 ungrounded because `llama3.2:3b` has
  read every Agile blog written — not because the items are defective. For a syllabus made of public
  professional vocabulary that is not a defect. This is the memorisation confound the project already
  hit on the Airbnb deck, resurfacing in a new instrument.
- **When the grounded arm ceilings, the gap collapses to `1 − ungrounded`** and carries no
  information beyond it. Do not treat gap as a second dimension when grounded is at ceiling.

## Decisions made this session

- **Retire, never delete, bad content items** — 6 of the 7 chart captions already had `events` rows,
  and events are the append-only research dataset. `db/009` adds `retired_at` + `retired_reason` as a
  matched pair on a CHECK allowlist (currently only `chart-title-term`), plus a partial index on live
  rows. All three selection routes exclude retired rows.
- **Two-stage generation** — the single call under a quota is what manufactured captions. Verified
  fix, not a hoped-for one.
- **Distractors are generated, not selected from the glossary.** Glossary-sourced distractors paired
  `Globalization Journey` with `Global Footprint` as each other's distractor, each clue describing
  both — two unanswerable items. Invention cannot accidentally produce a correct answer; selection
  from a glossary of near-synonyms routinely does. `scripts/lib/distractor-select.mjs` was deleted,
  not parked.
- **`example_sentence` no longer rejects an item** — only fill-in-the-blanks reads it and that game is
  unbuilt, so it was destroying term/clue/distractor sets word and match would have used (2 of 5
  drafts on one run). It is nulled instead, via `scripts/lib/terms-example-sanitize.mjs`. Multi-line
  or >220-char examples are nulled too; one "sentence" was an 8-line Netflix timeline.
- **Screen before writing, never after** — `build-term-mcq-spike.mjs --from-json` reads generator
  output directly. Ids use the same `sha256(subject::term)` the generator uses on write, so results
  join back to the row that will exist.
- **Dedup is subject-scoped and normalised** — the two Digital Transformation decks independently
  produced 9 of the same concepts, including `Minimum Viable Products (MVPs)` and `Minimum Viable
  Product (MVP)`: different strings, different hashes, one concept. 38 items → 29.
- **Do not write the pending calibration.** 24 of its 33 rows fail the screen, and it ranked two
  unanswerable items as its hardest.
- **Playwright MCP removed, Playwright CLI installed** — an MCP server loads tool schemas every
  session; a CLI costs nothing until called. `.playwright-cli/` and `.playwright/` are gitignored.

## Open questions / blocked on

- **Is there still a between-arm experimental contrast?** Unchanged, still top. Prof. Singh, Tue 4 Aug.
- **The lever-drop decision still has no transcript.**
- **Can a recall-style item ever require the deck, for a course teaching public vocabulary?** The
  ungrounded results suggest not — which is an argument that term games should test *application*
  rather than recall, as the quiz's reasoning MCQs already do. This is a design question for the
  professor, not a bug.
- **Difficulty calibration cannot distinguish a broken item from a hard one** — both read as low
  facility. `Bing` (0.23) and `Yandex` (0.17) were ranked hardest and are trivia and broken
  respectively. Worse: a weak simulator's low score can mean *the simulator is ignorant*, not that the
  item is hard — `llama3.2:1b` does not know Microsoft's search engine is Bing, `3b` does. None of the
  discrimination criteria (mean, ceiling, gradient, IQR) detect this.
- **`spike-data/` is gitignored**, so the run wrappers — including the PID mutex CLAUDE.md tells
  future sessions to copy verbatim — are unversioned. They are code, not data.
- **Windows/libuv**: `UV_HANDLE_CLOSING` on a second `sql` SELECT before `process.exit(0)`. Confirmed
  this session to be a **Node 24.11.1-on-Windows exit bug, not neon-serverless** — `playwright-cli
  --version` triggers the identical assertion. The prior checkpoint mis-attributed it.
- Carried forward: Wordle viability, rapid/normal exact seconds, points-table numbers, whether
  simulated facility tracks real facility (expect r ≈ 0.5 for prose).

## Next 3 actions

1. **Fix the clue prompt in `scripts/generate-terms.mjs`** so a clue must state what distinguishes
   the answer from its nearest sibling distractor. Then re-run
   `node scripts/generate-terms.mjs "INM -Session 6_CAGE- Challenges of Entering Foreign Markets_claude.pdf" --subject "International Management" --dry-run --pages 1-18 --out spike-data/regen-clue.json`
   and check the Extreme Programming item specifically.
2. **Encode the templated-distractor tell.** Every remaining caption has distractors that are rigid
   template-variants of the answer with one axis swapped (`Android Sessions by Game Category` →
   `Android Sessions by Social Media Category` / `iOS Sessions by Game Category`). Every good item has
   distractors that are different concepts. That structure is a far more reliable caption signal than
   classifying the term text, and it is what the lexical rules keep missing.
3. **Then write the 29 (minus fixes) and retire the old cohort.** Needs `db/010` to widen the
   `content_items_retired_reason_check` allowlist — Postgres has no `alter constraint`, so DROP and
   re-ADD the same named CHECK with a longer IN-list. Suggested new reasons: `superseded`,
   `under-determined`. Rehearse the write with `--dry-run` first.

## Do not redo

All prior "do not redo" items stand (adaptive machinery stays parked, `llama3.2:3b` for slide MCQs
and `1b` for term items, five bands only, no rank-position binning, no whole-history exclusion, no
per-pair match penalty, no `git add -A` with PDFs present, Gemini credits depleted so generation runs
on OpenAI, no vitest/jest). Added this session:

- **Do not try to fix caption generation with string rules on the output.** The prompt already names
  `Netflix Subscribers Statistics 2025` and `Mattel Japan Market Share` as forbidden examples and the
  model produced `Mattel Market Share Variation` anyway. The validator rejects `Google's Market Share`
  and passes `Market Share of Google`. Rephrasing defeats every lexical rule tried.
- **Do not source distractors from the glossary.** Tried, verified worse — near-synonym entries become
  each other's distractors and both items become unanswerable.
- **Do not use the ungrounded arm as a rejection gate.** It measures fame, not defect.
- **Do not treat the gap as informative when the grounded arm is at ceiling** — it is then just
  `1 − ungrounded`.
- **Do not write the pending term calibration** (`termcal-llama3-2-1b.json`) — 24 of its 33 rows fail
  the screen.
- **Do not delete either `termcal-llama3-2-1b.json` or `-posseed.json`** — they are a matched pair and
  deleting either destroys the ρ = 0.826 reproducibility result.
- **Do not quote ρ = 0.826 as cross-simulator agreement** — it is same-model, differing only in seed.
- **Do not hard-delete a content item that has events.** Retire it.
- **Do not default `--subject` when building from JSON.** Subject is part of `sha256(subject::term)`,
  so a wrong subject produces ids matching nothing. A first pass defaulted all 38 items to Digital
  Transformation and mis-keyed all 15 International Management ones.
- **Do not `nohup`-detach a long run** — the harness then tracks the launcher, not the job, and no
  completion notification ever fires. Launch it as a tracked background command.
- **Do not trust a subagent's report that it ran a verification.** Two separate builders this session
  reported results they had not produced; one quoted the previous run's file verbatim. Check file
  mtimes and re-run the command.
- **Do not issue a second `sql` SELECT immediately before `process.exit(0)`** on Windows.
