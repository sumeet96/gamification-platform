# Per-window question generator — spec

Status: **proposed, not built.** Written 29 Jul 2026.
Supersedes the whole-document approach in `scripts/generate-questions.mjs` (92-line stub).

## Why this shape

The 29 Jul Gemini run on `Pitch_Session 12.pptx` produced 15 questions with four defect classes.
Sorting them by *who can fix them* determines the design:

| Defect | Observed | Fixed by |
|---|---|---|
| All correct answers at index 0 | 15/15 | Deterministic shuffle — **already built** |
| Cites the source ("the advantages slide") | 2/15 | Validator regex — **already built** |
| False slide attribution (title slide) | 2/15 | **Control flow — this spec** |
| Slides 12–26 produced nothing | 0 questions from 15 slides | **Control flow — this spec** |
| Arithmetic that contradicts its own answer | 1/15, survived validation | **Adversarial second pass — deferred, see backlog** |
| Difficulty labels don't discriminate | pervasive | **Empirical p-values — not a generation problem** |

The last two rows matter: a better model does not reliably fix them, and neither does prompting.
The first four are what this spec addresses.

**The core move: the model stops choosing which slides to cover and stops self-reporting where a
question came from.** Today it does both, and it used slide 1 as a dumping ground when unsure while
silently ignoring half the deck. A loop over slide windows makes coverage structural and makes
out-of-window attribution unrepresentable.

## Input is PDF — decided 30 Jul

**Professors export to PDF themselves and upload that.** LibreOffice leaves the pipeline entirely.

Its only job was PPTX → PDF, because Gemini reads PDFs with native vision but does not read PPTX.
PowerPoint's own "export as PDF" produces the same visual render, which is what matters here: these
decks average ~62 characters of extractable text per slide with all real content baked into images,
so we need the slides *rendered as they look*, not parsed. PowerPoint does that as well as
LibreOffice does, in one click, with no binary to install and no host that can run it.

Consequences:
- No render step, no `soffice` dependency, no Windows path handling.
- Ingestion can run anywhere, including a serverless host — which is what makes the eventual
  live-upload platform (see `PROJECT_MAP.md`) feasible at all.
- **The page-count guard is deleted** (see below).
- The PPTX and DOCX branches of `scripts/inspect-source.mjs` become unused. Left in place for now,
  not deleted — flag for a `/simplify` pass once the PDF-only path is proven.
- `page` replaces `slide` as the provenance unit. Same field, honest name.

Residual: PowerPoint also excludes hidden slides from its export, so the prof's "slide 12" may not
be the PDF's page 12. That is a human mismatch, not a data-integrity one — there is no second
representation for the data to disagree with.

## Pipeline

```
PDF ──> Files API upload (once)
             │
             ▼
   for each window of N pages (default 3):
       generateContent(fileUri, window, responseSchema)
             │
             ├── reject any question whose `page` is outside the window
             ▼
       accumulate drafts
             │
             ▼
   validateQuestions(drafts)  ← imported, not shelled out
             │
             ▼
   upsert only the passing, shuffled set
```

The PDF is uploaded **once** and its URI reused across every window call. Files persist 48 hours
(verified against Google's docs 29 Jul 2026), which comfortably covers a single deck run.

## The mandatory guard

**Nothing reaches the database without passing `validate-questions.mjs`.** Today
`generate-questions.mjs:79-81` runs its own weaker inline check that *clamps* rather than rejects:
`Number(q.answer) || 0` turns a null answer into index 0 and upserts it. That code is deleted, not
improved.

*(The former second guard — asserting PDF page count equals PPTX slide count — is gone with
LibreOffice. It protected against a mismatch between two representations of the same deck. With
PDF-only input there is only one representation, and the page number is ground truth.)*

## Structured output

Every call uses `responseMimeType: 'application/json'` plus a `responseSchema`. Confirmed supported
on `gemini-3.5-flash-lite` (29 Jul 2026).

```js
{
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    // Gemini honours propertyOrdering; keep it stable so output diffs stay readable.
    propertyOrdering: ['topic','difficulty','prompt','options','answer','slide','why_this_difficulty'],
    required: ['topic','difficulty','prompt','options','answer','slide'],
    properties: {
      topic:      { type: 'STRING' },
      difficulty: { type: 'INTEGER' },           // 1..5, range enforced in the validator
      prompt:     { type: 'STRING' },
      options:    { type: 'ARRAY', items: { type: 'STRING' }, minItems: 4, maxItems: 4 },
      answer:     { type: 'INTEGER' },
      slide:      { type: 'INTEGER' },
      why_this_difficulty: { type: 'STRING' },
    },
  },
}
```

**Constrained decoding guarantees shape, not truth.** It cannot know that an answer is wrong, that
a question cites the deck, or that a slide number is a lie. The validator still runs on everything.

## Window size

Default **3 slides**, overridable with `--window N`.

`--window 1` gives exact provenance for free (the code knows the slide) but loses questions that
span consecutive slides — a TAM/SAM/SOM breakdown often runs across two. At 3, the model still
reports `slide`, and the code rejects anything outside the current window. Either way the
"everything came from slide 1" failure becomes impossible.

**Residual risk, stated honestly:** the model sees the whole PDF via the file URI, so it can still
write a question about slide 20's content while claiming slide 13. Window enforcement narrows the
blast radius from 26 slides to 3; it does not eliminate the failure. Spot-checking survivors against
the deck stays a human step until the adversarial pass exists.

## Difficulty is a prior, not ground truth

The generator keeps asking for `difficulty` and `why_this_difficulty`, but these are **seed values
to be overwritten**. Difficulty is a property of a question *against a population*, which no model
can know a priori. The real value comes from empirical p-values computed from `events` once the
pilot-of-the-pilot has run. See backlog item R1 — this is the biggest threat to the paper and it is
not a generation problem.

## Schema change

`db/003_add_question_provenance.sql`, additive only:

```sql
alter table questions add column if not exists slide int;
alter table questions add column if not exists generator_model text;
```

`slide` is how fabrication is caught, and today it is discarded at the DB boundary — the `questions`
table has no column for it. `generator_model` records which model wrote each row, which the paper
will need to report and which will matter the first time output quality shifts under us.

Both nullable, so existing rows stay valid. Fold into `db/schema.sql` per the existing convention.

## File plan

`validate-questions.mjs` is currently CLI-only — top-level argv parsing, `process.exit`, no exports.
It must become importable so guard 2 is structural rather than a convention someone can forget.

| File | Change | Ceiling |
|---|---|---|
| `scripts/lib/questions-validate.mjs` | **new** — checks + seeded shuffle, exported as `validateQuestions(questions, {ignoreSlides})` → `{passed, rejected}`. Moved code, no behaviour change. | 150 |
| `scripts/validate-questions.mjs` | **rewrite** — thin CLI over the module. Same flags, same output format, same exit codes (0/2/1). | 55 |
| `scripts/lib/gemini-client.mjs` | **new** — Files API upload, `generateContent` with `responseSchema`, retry + backoff. | 120 |
| `scripts/generate-questions.mjs` | **rewrite** — orchestration only: upload → window loop → validate → upsert. Callable as a library, `(pdf, subject) → primitives`, not hardcoded to one course. | 160 |
| `db/003_add_question_provenance.sql` | **new** | 30 |

~535 lines total, ~180 of it relocated. Nothing else is touched.

## Other defects in the current stub, fixed on the way

- `MODEL` falls back to `gemini-2.0-flash`, **shut down 1 Jun 2026**. Replace the fallback with a
  hard error — the standing rule (now `docs/architecture/product-design-rules.md`) requires the
  model be set via `GEMINI_MODEL`, not by editing the script.
  Confirmed current id: `gemini-3.5-flash-lite`.
- `pdf-parse` text extraction (lines 33–37) becomes dead — Gemini reads the PDF natively. Check
  whether `pdf-parse` is referenced elsewhere before dropping the dependency.
- Row ids are `${slug}-d${difficulty}-${i}` where `i` is an array index, so re-running with
  different output silently overwrites unrelated questions. Use a content hash of the prompt:
  stable, idempotent, re-runnable.
- The insert ignores `topic` and `format`, both of which exist in the schema and in the model output.

## Deliberately NOT built

- **Batch mode.** 50% cheaper and architecturally a good fit (generation is off the critical path),
  but the whole corpus costs ~$1.42 interactive. Saving $0.71 is not worth a 24-hour feedback loop
  during development. Revisit if per-deck volume grows.
- **Context caching.** At 258 tokens/page a 26-slide deck is ~6,700 tokens. Caching would save
  fractions of a cent against real added complexity.
- **The adversarial critique pass.** Genuinely needed — it is the only thing that would have caught
  the $222.6M-vs-$200M contradiction — but it is a separate slice with its own model-choice
  decision. Backlog item C4.

## Acceptance checks

1. `node scripts/validate-questions.mjs <session-12.json> --ignore-slides 1,26` produces **byte-identical
   output** to today's run: 11 passed, 4 rejected, `A=1 B=5 C=4 D=1`. Proves the extraction changed
   nothing.
2. A dry run (`--dry-run`, no DB write) over the 26-page PDF of `Pitch_Session 12` yields questions
   citing pages across the **full 1–26 range**, not 1–11.
3. Force a model response with an out-of-window `page` → that question is rejected, the rest survive.
4. Nothing appears in `questions` that did not pass `validateQuestions`.
5. The generator runs with no `soffice` on PATH — proving the LibreOffice dependency is really gone.

## Open questions

- **Which model produced the 29 Jul output?** Still unknown — `GEMINI_MODEL` was empty and the JSON
  was generated by hand. Until this is pinned down, the observed defect rate is not attributable to
  any particular tier.
- **Free-tier RPD is unverified.** Google no longer publishes per-model limits; the docs redirect to
  per-project figures in AI Studio. The 15 RPM / 1,000 RPD in `CURRENT_STATE.md` comes from
  third-party blogs that disagree with each other. Read the real numbers at
  `aistudio.google.com/rate-limit` before sizing a full 20-deck run.
- **How many questions per window?** 3 slides × K questions. K=2 gives ~17 per deck before
  rejections; at a ~73% pass rate that lands near 12 usable. Overgenerate — it costs cents.

---

## G1 rebuilt three-stage, and the defect it does not fix (moved from CLAUDE.md, 7 Aug 2026)

Moved out of launch-time context on 7 Aug 2026; this is the same subject as the rest of this
file. Nothing was edited in the move.

- **G1 rebuilt three-stage, 6 Aug 2026 (`9030316`, `7aeb603`) — and one defect it does NOT fix.**
  `scripts/generate-questions.mjs` had kept the single-call-per-window flow under a `--per-window`
  quota, which is exactly what manufactured chart captions in G2. It shows in the bank it produced:
  `Which team member has a background in computer science from Harvard`, `Based on the cartoon…`.
  **The gap screen cannot catch that class** — those items are answerable from their own excerpt, so
  they pass the grounded arm. Now: glossary (no quota, empty valid) → option writing → cold answer
  marking. `--per-window` is deleted and passing it exits with an error. Default model on this script
  only is **`gpt-5-mini`**; `llm-client.mjs` omits `temperature` for `gpt-5*`, which reject any value
  but their default of 1 (a hard 400, and it means gpt-5 output is not drawn under the same sampling
  regime as gpt-4.1 output). Content fix verified: the blockchain deck now yields
  `What is a consensus mechanism`, `Which scenario BEST exemplifies decentralization`.
  - **UNRESOLVED — MCQ options leak their answer by length.** Correct option is the longest in
    **65%** of the live bank, **81%** with an emphatic length-parity instruction, **89%** with a
    blind schema. Chance is 25%; always-pick-longest scores **88.6%**; mean correct option 106.5
    chars vs 81.6 for distractors. **A prompt instruction does not fix it** (86→81% while validator
    rejections went 9→0 — the model equalised spread and kept the answer marginally longest), and
    **blinding does not either** — stage 2's schema has no `answer` field and it got *worse*. The
    mechanism is semantic, not procedural: a true statement needs more qualification than a false
    one, so a stronger model qualifies more carefully. Any fix must make **distractors equally
    qualified**, not the writer blind.
  - **But it does NOT contaminate difficulty calibration** (measured 6 Aug, `mcq6-ungrounded.json`,
    44 items): the simulator scores **0.744** ungrounded, *below* the **0.886** a pure length-picker
    gets, so it is using knowledge rather than the cue; r between score and length margin = 0.161,
    n=44, CI straddles zero. **Assessment-validity problem, not a measurement one — the n=120
    calibration run is unblocked.** One simulator only (`llama3.2` 3B).

---

## Validator and rejection-gate conventions (moved from CLAUDE.md, 7 Aug 2026)

These were standing conventions in CLAUDE.md. They are generator-methodology rules and are
read when working on generation, not on every session launch. Nothing was edited in the move.

- **An over-rejecting validator is not automatically the safe direction.** G2's clue-leak rule
  (1 Aug 2026) rejected 5 of 8 valid items by testing each word of a multi-word term independently; a
  guard that is too strict can silently destroy yield the same way a guard that is too loose lets bad
  data through. Check yield, not just precision, before trusting a new validation rule.
- **A rejection gate is meaningless until a CAPABILITY CONTROL has passed on the same instrument.**
  Found 6 Aug 2026. The Connections no-source screen returned 0.10/4 on `llama3.2:3b` — an apparently
  decisive "these boards need the deck". It was disbelieved only because board 1 contained
  Volume/Velocity/Variety/Veracity, which any model that knows anything should group. A control board
  of Colours / Animals / Countries / Fruits then scored **0.00/4 on the same model**: it cannot
  partition at all, and the real result was measuring the instrument, not the material. `gemma2:9b`
  scores 3.65/4 on that control and is a valid instrument. This is the third instrument in which the
  standing lesson "a weak simulator's low score can mean the simulator is ignorant" has bitten (after
  `llama3.2:1b` not knowing Bing). **Ship a trivially-solvable control alongside any new gate, and
  run it first** — `spike-data/connections-control-v1.json` is the pattern.
- **Never pool a verdict across heterogeneous units when the unit is what gets rejected.** Same run.
  The solve script's first version printed one aggregate: 1.10/4, "PASSES". That average concealed one
  board solved cold 40% of the time and another 0% — memorability is a property of a board, and a
  board is the thing shipped. The gate now fires per board. Related, same script, same day: it also
  printed "PASSES the gate" after all 30 trials had failed on a wrong model tag. **A gate that can
  pass on zero observations is a false signal**; it now refuses a verdict and exits non-zero.
- **A permissive instruction is not neutral either — loosening one constraint loosens the ones next
  to it.** The mirror of the rule above, found 5 Aug 2026 by `scripts/spike-short-terms.mjs`. Adding
  "a concept's name may be of ANY length" to the glossary prompt was meant to surface short terms. It
  surfaced none, made terms *longer* (median 23→28, max 37→42 on the CAGE deck), and **re-broke the
  chart-caption guard** — arm B emitted `Netflix Subscribers Statistics` and `Google's Market Share`,
  strings the same prompt names as forbidden examples. So the structural caption fix (ask what the
  deck teaches before asking for questions) is **fragile to unrelated prompt perturbation**: any new
  clause added to `glossaryPromptFor` must be re-screened for caption leakage, not just for the thing
  it was added to do. **Do not add a name-length clause to the glossary prompt.**
- **A clue must name what distinguishes its answer from its nearest distractor — "not a synonym" is
  not sufficient.** Checked against each distractor in turn, inside the same call that writes them
  (commit `e243022`, 4 Aug 2026). `Extreme Programming` with distractors Scrum / Kanban / Lean Startup
  and a clue describing "a framework that integrates business demands with software development rules
  to achieve shared and realizable goals" scored 0.10 grounded — worse than chance — because that clue
  also fits Scrum; the older, looser clue scored 0.93. Making distractors more confusable without
  tightening the clue is what broke it. After the rule, the same item scores 0.97.
- **Do not build a templated-distractor detector on lexical/structural grounds.** Tried and deleted,
  same commit as above (4 Aug 2026). Hypothesis: a chart caption's distractors are template variants
  with one slot swapped, a real item's are different concepts. Run against 38 real generated items it
  flagged 8, and 4 were good (`Agile Software Development` vs Waterfall/Spiral, `Thin Slice Team` vs
  Scrum Team, `Intraregional Trade` vs International Trade, `User Story` vs User Scenario) — items that
  share a head noun with their distractors, which the clue-precision rule above requires rather than
  forbids. `Agile Software Development → Waterfall Software Development` is structurally identical to
  the real chart-caption swap `Android Sessions by Game Category → iOS Sessions by Game Category`; the
  difference (rival concepts vs two slices of one chart) is semantic, not structural, and no token rule
  reaches it. Third over-rejecting guard of the session; cost nothing because it was caught before
  shipping.
