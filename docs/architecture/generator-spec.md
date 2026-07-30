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
  hard error — CLAUDE.md requires the model be set via `GEMINI_MODEL`, not by editing the script.
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
