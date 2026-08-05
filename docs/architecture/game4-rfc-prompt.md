# Game-4 RFC — multi-model deliberation prompt (crossword vs Connections)

Paste everything below the line into ChatGPT, Claude, Gemini, DeepSeek, and Kimi separately.
Collect the five answers and synthesise. The output format at the end is fixed so the replies are
comparable section by section.

Rewritten 5 Aug 2026, replacing the 4 Aug crossword-only version. Changes: the question is now a
choice between two games rather than a crossword design brief; the entry-length objection is
recorded as **resolved** (fragment entries + constituent expansion) rather than left for five models
to rediscover; and the empirical findings from four real puzzles and one generation spike are stated
as givens.

Before sending, fill in §5.2 if the between-arm experimental contrast has been decided. It is the
one slot that changes every answer.

---------------------------- COPY EVERYTHING BELOW THIS LINE ----------------------------

You are acting as a systems architect and a research-methods critic at once. I want a reasoned
architecture, not encouragement. Where I state something as settled, treat it as settled unless you
have a specific reason it is wrong — and say so plainly if you do.

## 1. The decision I need

I have to pick the **fourth game** for a gamified adaptive-learning platform, and then architect it.
Two candidates:

- **A. Crossword** — freeform criss-cross grid, definitional clues, phrasal domain terms.
- **B. Connections** — the NYT format: 16 tiles, partition into 4 groups of 4 by shared category.

Pick one. Justify it against the other. Then design it properly. Do not hedge into "build both".

## 2. What this is

A Design Science Research artifact for a management-school pilot. A dashboard is the spine; each
game is a tile in it. 60–120 postgraduate students, ~20 sessions of a Digital Transformation course,
starting mid-September 2026. **Per-question event logging is the research dataset** — the app is the
instrument, not the product.

Three games are live: an MCQ quiz, match-the-following, and choose-the-right-word. Fill-in-the-blanks
is specced and unbuilt. Wordle is dead (see §4.1).

## 3. The technical system

- **Stack:** Next.js 16 App Router, React 19, Tailwind v4, TypeScript. Neon serverless Postgres over
  an HTTP driver — **no transactions**. Vercel Hobby. Node's built-in test runner only (`node --test`);
  no Jest/Vitest. ~190 tests pass.
- **A single game registry** declares, per game: the content primitive it consumes, whether it
  supports the adaptivity lever, whether it adapts at **item** or **board** granularity, and a points
  shape. Three points shapes exist: flat per-answer, guess-count, and board-grained
  (`perPair` / `perfectBonus` / `floorAtOrBelow` / `floorPenalty`). Nothing outside the registry may
  hardcode a point value.
- **Scoring is server-side; the answer key never reaches the browser.** Hard rule, violated once,
  fixed. Any design must say how the client renders without being told the answers.
- **Concurrency defence is structural.** With no transactions, check-then-insert dedupe is not
  atomic, so the INSERT itself is the lock via partial unique indexes, and a repeat submission
  returns an idempotent 409 that reads back the stored result. A 12-way concurrent POST salvo is
  part of acceptance testing.
- **Content items are retired, never deleted** — the append-only event log references them by FK.
- **Item selection is least-recently-served soft ranking**, difficulty distance as a tiebreak only
  when enough calibrated rows exist, hard de-duplication only *within* a round. Hard whole-history
  exclusion was tried once and permanently locked a student out of a game after 8 boards. Recency
  reorders; it never excludes.
- **Board-grained games already have machinery**: board tokens, board-level dedupe via a partial
  unique index, a board-selection module with a subject-grouping rule ("a board never spans two
  subjects"), and a board timing profile. A second board game reuses all of it.

## 4. The content layer

One normalised `content_items` table. Kinds: `mcq` and `term_definition`. A `term_definition` row
carries `term`, `clue` (a definitional sentence, ~85–180 chars), `distractors` (3, generated not
selected), optional `example_sentence`, an **empty** `variants` array, `subject`, `topic`, `page`,
a 1–5 `difficulty`, and provenance.

Live bank: **34 term rows** (25 Digital Transformation, 9 International Management) + 17 MCQ rows.
This is two sample decks from two unrelated subjects. **Production will be much larger** — do not
build your argument on current pool size.

### 4.1 Entry lengths — canonical forms

Stripped of spaces and punctuation, the 34 terms run **9 to 35 cells, median ~21**. Exactly one is a
single word. Across all 136 domain strings (34 terms + 102 distractors), **none is ≤8 cells**.

Representative: Inception 9 · User story 9 · Empathy Map 10 · Release Wall 11 · Standup Meeting 14 ·
Thin Slice teams 14 · Technical Vision 15 · Priority Analysis 16 · Extreme Programming 18 ·
Cultural Adaptation 18 · Globalization journey 20 · Digital transformation 21 ·
CAGE Distance Framework 21 · Minimum Viable Products 21 · Build-Measure-Learn model 22 ·
Gravity Model of Trade Flow 23 · Agile software development 24 · Lean and agile delivery model 25 ·
Applications of CAGE Framework 27 · Waterfall Software Development 28 ·
Cross-functional Demand Analysis 29 · Language Complexity in Market Entry 31 ·
Product Wall for Information Sharing 32 · CAGE Framework for Different Industries 35

This killed Wordle (needs 5 letters), Strands, and the NYT Mini.

### 4.2 …and why that is NOT the crossword blocker (settled — do not re-argue)

A grid entry does not have to be the canonical term. Two moves fix the length problem:

**Fragment entries.** Any content word can be the entry, with the clue carrying the rest. From the
real bank: EMPATHY(7) · STANDUP(7) · RELEASE(7) · SLICE(5) · PRIORITY(8) · EXTREME(7) · CULTURAL(8) ·
GRAVITY(7) · LEAN(4) · CAGE(4) · FORECAST(8) · LANGUAGE(8) · DEMAND(6) · VISION(6) · TRADE(5).
Roughly a third of the bank reaches ≤8 cells — the same ratio as a working published puzzle we
analysed (6 of 22).

**Constituent expansion.** A framework with named parts becomes several short entries, each clued by
position. CAGE → CULTURAL(8) · ADMINISTRATIVE(14) · GEOGRAPHIC(10) · ECONOMIC(8).
Build-Measure-Learn → BUILD(5) · MEASURE(7) · LEARN(5). Design Thinking → EMPATHISE · DEFINE(6) ·
IDEATE(6) · PROTOTYPE · TEST(4). This is *better* pedagogy than asking for the framework's name,
and management education is dense with such constructs (SWOT, PESTEL, Five Forces, 4Ps, 7S, Scrum
ceremonies). The sample decks contain one; a 20-session course will contain many.

**Consequence:** a crossword clue is a *contextualizing device*, not a standalone definition. It gets
two channels an MCQ clue does not — enumeration (cell count) and framing scaffolds ("the C in CAGE",
"the first step in Lean Startup's cycle"). That is a real relaxation of our clue-precision rule, in
one specific direction.

### 4.3 The residual crossword problem: collisions

Fragments collide. The natural short fragment is often claimed by several terms:

| Fragment | Claimed by |
|---|---|
| CAGE (4) | CAGE Distance Framework · Applications of CAGE Framework · CAGE Framework for Different Industries |
| ANALYSIS | Priority · Pain Point · Risk Factor · Technical Vision · Cross-functional Demand |
| STORY (5) | User story · Story cards · Coarse-grained Story Maps |
| MAP (3) | Empathy Map · Stakeholder Map · Story Maps |
| AGILE (5) | Agile software development · Agile innovation process · Lean and agile delivery model |
| TRADE (5) | Future of Trade Forecast · Gravity Model of Trade Flow |
| JOURNEY (7) | User Journey · Globalization journey |
| DISTANCE (8) | CAGE Distance Framework · Other Dimensions of Distance |

Note the collisions concentrate on the *shortest, most useful* fragments. `Technical Vision` and
`Technical Vision Analysis` are the worst case — one is a strict prefix of the other.

This is a **board-selection constraint**, structurally the same as the existing "a board never spans
two subjects" rule, not a content defect.

### 4.4 How content is generated

Terms are LLM-generated from lecture PDFs by a **two-stage** pipeline: a glossary pass asks only what
a deck teaches (no quota, empty is a valid answer), then items are written from that glossary.
This replaced a single-call-per-page flow that, under a per-page quota, manufactured chart captions
as fake terms. Items are screened before writing by making a small local model attempt them.

**Standing lesson: a quota manufactures garbage.** Any design that forces the generator to produce
N of something from material that does not contain N will get N fabrications.

**Spike result, 5 Aug 2026:** we tested whether the 9-cell floor was a prompt artefact by re-running
the glossary pass with an added clause explicitly asking for short and single-word canonical names.
Across 2 decks × 2 arms, 59 concepts: **zero at ≤8 cells**, on both arms. Worse, the permissive
clause *raised* median length (23→28) and re-broke the caption guard — it emitted "Netflix
Subscribers Statistics" and "Google's Market Share", strings the prompt names as forbidden examples.
**Loosening one constraint loosened the ones next to it.** So: canonical short terms cannot be
prompted into existence; fragments and constituent expansion are the only route.

## 5. The research frame — this constrains the design more than the tech does

### 5.1 Adaptivity levers

Students were each assigned exactly one lever — **adaptive difficulty** (item difficulty ramps with
performance) or **time pressure** (clock tightens with a correct streak) — never both, enforced by a
single resolver returning a `(difficulty, timeLimit)` pair with exactly one field tracking
performance. Time pressure has an item profile (10s base, 5s floor, −2s/correct) and a board profile
(90s base, 45s floor, −15s/correct board). All numbers are placeholders.

The professor has since **dropped the adaptive-difficulty lever**; every student gets time pressure.

### 5.2 The consequence you must design around

**FILL THIS IN IF RESOLVED. If blank, treat the between-arm contrast as UNDECIDED and say how that
changes your recommendation.**

> Between-arm experimental contrast: ______________________

Dropping the difficulty lever removed the independent variable. Candidates: time pressure on vs off;
rapid vs normal mode; within-subject alternation; or reinstating difficulty now that calibration
works.

**This is a live discriminator between the two games.** A crossword is slow, reflective and
non-linear — students jump between entries and revise. The board clock tops out at 90s. If time
pressure is the only lever and a crossword cannot carry it, the crossword produces engagement but
**no experimental data** and sits outside the study. A Connections board is a bounded few-minute
task and plausibly can carry it. Address this explicitly rather than letting it be decided by
accident.

### 5.3 Difficulty is empirical, never asserted

We never ask a model how hard an item is. Small local models **attempt** items at four simulated
ability tiers, gated on how much of the source excerpt each tier sees (30/55/80/100% of lines); the
failure rate is the estimate, binned 1–5.

Constraints that follow:
- **At n=30 simulated students, two facilities are distinguishable only if they differ by ~0.26.**
  Observed band widths are 0.13 at five bands. `n` is the binding constraint, not band count.
- **Calibration cannot distinguish a broken item from a hard one** — both read as low facility.
- **No term row has a difficulty value today.**
- The calibrator renders items as MCQs. **A crossword entry has no options, so the existing method
  does not apply to it.** Connections has the same issue at the group level.
- Difficulty is plausibly **item × game**, not a property of the item: the same term is easier as a
  crossword entry (enumeration given) than as bare recall, and harder than as a 4-option MCQ.

State how your game gets difficulty, or argue it cannot before the pilot.

### 5.4 What is logged

Each event row carries session, event type, game, mode, lever, round, content item id, difficulty
level, time limit, time taken, correctness, points delta, negative-marking flag, a free-text
`submitted_text` for non-MCQ answers, and a granularity marker. Scored events are server-side only,
enforced at both the type level and as a runtime allowlist.

The persistence loop is instrumented: the "keep going" affordance logs when **offered**, **accepted**
and **declined**, so a decline is distinguishable from never being asked, and an offer followed by
neither is a detectable abandonment.

Design your game's event vocabulary — including what to deliberately **not** log, since 60–120
students × 20 sessions makes fine-grained interaction logging both a volume and a
signal-to-noise problem.

## 6. Empirical findings from real puzzles (givens — do not rediscover)

We analysed four published business crosswords, including two from Crossword Labs.

1. **Consumer/educational crossword generators are greedy freeform placers.** A 50-entry puzzle
   measured ~38×38 cells at under 25% fill. Dense symmetric grids come from backtracking constructors
   over large curated fill lists — a different and much harder build.
2. **Density requires short entries as connective tissue.** The one well-interlocked example had 6 of
   22 entries at ≤8 cells (NEEDS, WANTS, STARTUP, REVENUE, SERVICES, SCARCITY).
3. **When the corpus lacks short terms, generators pad with dictionary filler and content validity
   collapses.** One 50-entry "BUSINESS" puzzle contained PROSODY ("the study of poetic meter"), PULL,
   ELEVATE, RELEASE — solvable with zero course exposure. This is the quota failure again.
4. **Bounding box is driven by length *variance*, not mean.** One 29-cell outlier forces a sprawling
   mostly-empty grid.
5. **Mobile is a real constraint.** A 38-column grid at 390px is ~10px per cell — four times below
   the minimum touch target. Any interactive crossword needs pan-and-zoom with a focused-cell
   viewport, plus a focused-clue banner: every example separates clues from grid across a page or
   scroll boundary, and you cannot see a clue and its cell at once.
6. **Definitional prose is the right clue register** — the riddle register ("I focus on the future…
   What am I?") is deliberately vaguer and rhyme constraints push generators into filler and semantic
   drift. Our existing `clue` field is already in the correct register.
7. **Contrast sets work when clues are explicitly contrastive** — PRIMARY/SECONDARY/TERTIARY SECTOR
   coexist happily because the clues discriminate and the lengths differ. This is our own
   clue-precision rule, independently arrived at.

## 7. The two candidates

### 7.1 Crossword — what is settled and what is open

Settled: freeform criss-cross (not dense symmetric); definitional prose clues; fragment entries and
constituent expansion solve entry length; collisions are a board-selection constraint.

Open: grid construction and packing; the mobile viewport; how difficulty is obtained without an MCQ
rendering; whether the time lever is compatible; and — the sharpest one — **with crossing density
this low, is a crossword meaningfully different from fill-in-the-blanks arranged decoratively?** The
"use crossings as evidence" mechanic requires checked letters, and sparse freeform grids barely have
them.

New generation work required: fragment forms with cell counts (the empty `variants` column is the
natural home), a contextualized clue per fragment (not reusable from `clue`), a collision key, and a
constituent-expansion pass ("does this concept have named parts? empty is a valid answer" —
structurally identical to the proven glossary pass).

### 7.2 Connections — what is settled and what is open

Settled: entry length is irrelevant by construction, so §4.1–4.3 cost it nothing. It reuses the
existing board machinery (tokens, board dedupe, board selection, board scoring, board timing). It
tests **taxonomy rather than recall**, which addresses a live problem: our recall items score ~1.00
against a model given no source material, because public professional vocabulary (`Agile Manifesto`,
`User Story`) is answerable without the deck. Grouping requires the structure of the material. The
`distractors` column — 102 deliberately confusable near-miss strings — becomes trap material rather
than being discarded. Boards re-partition, so the pool multiplies combinatorially instead of being
consumed. It is mobile-native.

Open: **trap-category generation is the entire difficulty.** Non-overlapping obvious groups make a
trivial puzzle; overlapping groups with more than one valid partition make a broken one. You need
items that plausibly fit two groups where only one is correct — which is exactly the failure mode
that once took an item from 0.93 to 0.10 facility when distractors were made more confusable without
tightening the clue. Also open: the 4-guess mistake budget does not map cleanly onto the existing
board points shape; and how a *group* gets a difficulty estimate.

## 8. Hard constraints

- **~6 weeks to pilot.** ~400–450 hours total across 6 months, near-zero cash (<$10/month runtime).
  One artifact. Scope creep is the main risk.
- **Mobile matters.** Students play on phones.
- **No new paid services or heavy dependencies** without a strong case.
- **Any motivational overlay must be identical across arms** or it becomes a confound.
- The dashboard still has **no visual statistics** — no charts, no per-game progress. That work is
  queued behind this decision, partly because anything a student sees about their own performance
  could differ by arm and become a confound.

## 9. What I want from you

Answer in exactly these nine sections, with these headings.

**1. Verdict.** Crossword or Connections. Justify against the other on learning value, research
value, and build cost — in that order. If you think the honest answer is "neither, do the dashboard
statistics instead", say so and defend it.

**2. Content generation design.** The pipeline changes your choice needs. Respect the
quota-manufactures-garbage rule and the two-stage pattern. Say what is generated, in what order,
under what constraints, and what the validation gate is.

**3. Data model and migrations.** Changes to `content_items`, new tables, how boards/grids are
persisted, versioned, and de-duplicated per student.

**4. Board or grid construction.** The algorithm and its complexity. For crossword: placement,
collision avoidance, and the mobile viewport. For Connections: how a 16-tile board with four
non-degenerate groups is selected, and how you *prove* only one valid partition exists.

**5. Scoring economics.** Propose a points shape. Note the precedent: on a board where one error
structurally forces another, a per-item penalty **bills a single mistake twice**. Crossword crossings
and Connections groups both create that coupling. Cover partial completion, hints, revision, and
whether guessing must be negative-expected-value.

**6. Lever and experiment integration.** Can your game carry time pressure without destroying it?
If not, should it declare no lever support and sit outside the study — and is a non-experimental tile
worth building with 6 weeks left? How does it get difficulty given §5.3?

**7. Event schema.** Vocabulary, grain, volume estimate, and an explicit list of what NOT to log.

**8. Effort, risk, minimum viable cut.** Hours for full vs minimum viable. Three biggest risks.

**9. What would change your mind.** Name the specific finding, measurement, or constraint that would
flip your §1 verdict. Be concrete enough that I could go and test it.

Be specific and be blunt. I would rather be told this is the wrong build now than in six weeks.

---------------------------- END OF PROMPT ----------------------------
