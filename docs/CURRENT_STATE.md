# Current state — 29 Jul 2026

## Where we are

Two pipeline tools are built, verified and committed: `scripts/inspect-source.mjs` (routes a source
document to TEXT PATH / IMAGE PATH / UNUSABLE) and `scripts/validate-questions.mjs` (rejects
generated questions that break the rules, and shuffles option order deterministically). LibreOffice
is installed and the exact PPTX → PDF export command is verified.

**The approach is proven.** One real deck was run end to end through Gemini and produced usable
questions from slides containing zero text — visual reading works. It also exposed four concrete
defects in the generated output, which is what `validate-questions.mjs` now catches.

What does **not** exist: any automated ingestion. `scripts/generate-questions.mjs` is still a
PDF-only first-draft stub, nothing sends a document to a model programmatically, and the
`db/002` migration is written but unapplied. No automated tests anywhere in the project.

## Working tree

Branch **`feat/source-diagnostic`**, **clean — nothing uncommitted, nothing stashed.**

```
10fd55b  Reject generated questions that break the pipeline rules
e64d732  Record the verified PDF export settings and the slide-alignment hazard
2c23030  Checkpoint the session state for a clean handoff
154ee76  Correct two false claims in the project record
a75a79c  Route source documents to a text or image path before ingestion
a6cd8cd  Add a format column to questions ahead of the renderer
2d75381  <- where this branch left main
```

**Not merged to `main` and not pushed.** Project history is otherwise main-only:

```
git checkout main && git merge --ff-only feat/source-diagnostic
```

## In progress right now

**`/simplify` was requested and interrupted before it ran.** No review agents were launched, no
cleanup was applied. This is the one unfinished item.

Motivation: Sumeet said the project is "seeming to be overengineered." The scope is the two new
scripts — **`scripts/inspect-source.mjs` is 750 lines** and `scripts/validate-questions.mjs` is 179
(over the 150-line ceiling that was set for it). Restart with:

```
/simplify
```

Diff scope is `git diff main...HEAD`. The single most promising lead, worth checking first:
**`scripts/inspect-pdf.mjs` may now be dead code** — `inspect-source.mjs` was built as a
behaviour-preserving superset of it, and its PDF thresholds are duplicated byte-for-byte across both
files. If nothing else references `inspect-pdf.mjs`, deleting it removes a whole file and the
duplication in one move. Verify before deleting: the two-file equivalence is currently the regression
guard on the OCR thresholds, so if it goes, that guard needs to live somewhere else.

## Decisions made this session

- **The image path is mandatory, not a fallback** — Sumeet confirmed `Pitch_Session 12.pptx` (26
  slides, ~62 chars/slide, 1 real speaker note) represents how course material will arrive. A
  separate design-tool deck had **2 text runs across 16 slides**, all wording baked into images.
- **`inspect-source.mjs` routes rather than rejects** — visual-heavy decks are normal, so flagging
  them as WARN/FAIL called normal material broken.
- **A garbled OCR text layer routes to IMAGE PATH** — the page images underneath are intact.
- **No PDF→image tool is needed** — Gemini reads PDFs with native vision. Poppler was proposed,
  challenged by Sumeet, tested, and **withdrawn**.
- **Answer-position bias is fixed in code, not by prompting** — the model put 8 of 15 correct answers
  at index 1 and none at index 3; always guessing B scored 53%, profitable under +20/−10 while
  learning nothing. `validate-questions.mjs` shuffles with a hash of the prompt as seed, so runs stay
  reproducible.
- **Questions keep a `slide` field permanently** — it is how fabrication gets caught. It caught three
  cases on the first run.
- **Self-containment matches word boundaries, not substrings** — `"the slide"` misses `"the
  competitive landscape slide"`, which was the real failing sentence.
- **Committed on a branch rather than `main`**, so the merge stays Sumeet's call.

## Open questions / blocked on

- **`/simplify` never ran.** Unblocked by running it. See "In progress" above.
- **Difficulty labels do not discriminate.** Confirmed empirically this session: a question labelled 4
  was answerable cold, and the 1s and 2s were indistinguishable. The adaptive lever is built directly
  on this scale. Still the biggest threat to the paper. Fix: compute empirical p-values from `events`
  and calibrate against a pilot-of-the-pilot (5–6 people) **before** the real cohort.
- **Free tier's training-data clause on Prof. Singh's unpublished material.** No student data reaches
  the LLM (questions are pre-generated offline), so this is his consent call. **Unblocked by asking
  him.** Free-tier limits as of this session: Flash-Lite 15 RPM / 1,000 RPD, Flash 10 RPM / 250 RPD,
  250k TPM shared. ~20 decks generated once, so volume is not the constraint. Google cut free quotas
  50–80% in Dec 2025 without notice — architect for paid Tier 1 regardless.
- **`GEMINI_MODEL` is still empty in `.env.local`.** Note the AI Studio playground demanded a paid
  key, but a `GEMINI_API_KEY` already exists in `.env.local` — that was a playground gate, not an
  account one. The API path is not blocked.
- **`db/002_add_question_format.sql` is unapplied.** Paste into the **Neon web SQL editor** (`psql`
  is not installed). Safe to re-run.
- **`db/001_add_students.sql` (~line 60)** has an unscoped `pg_constraint` guard. Deliberately not
  fixed — already applied to the live DB. Only bites in a fresh environment.
- **`.ppt` / `.doc` (pre-2007) are unsupported** — `inspect-source.mjs` handles `.pdf`, `.docx`,
  `.pptx` only. LibreOffice could convert legacy files if Prof. Singh sends them.
- Carried over: adaptive difficulty saturates (`START_DIFFICULTY = 2`, caps at 5, resets each round);
  the quiz badge reads "Level 5" at `app/quiz/page.tsx:189` and should read `Difficulty 5/5`; a
  cosmetic ToS checkbox sits beside the real research-consent checkbox on signup; no shared-device
  protocol; `potential` in `/api/stats` assumes one flat scoring rule.

## Next 3 actions

1. **Run `/simplify`** over `git diff main...HEAD`. Start with whether `scripts/inspect-pdf.mjs` is
   now dead code (see "In progress"). This is the interrupted task.
2. **Wire the generation script** to render a deck via LibreOffice, send the PDF to Gemini with the
   revised prompt, and pipe the output through `validate-questions.mjs` before any DB write. The
   render command and the prompt are both recorded below/in HANDOFF.md §3a. Set `GEMINI_MODEL` in
   `.env.local` first — do not edit the script fallback.
3. **Ask Prof. Singh:** (a) free-tier training-data clause on his material, or approve paid Tier 1;
   (b) two or three sample decks — everything so far was tested against Sumeet's personal files.

### The verified PPTX → PDF command

```bash
soffice --headless --norestore \
  --convert-to 'pdf:impress_pdf_Export:{"ExportNotesPages":{"type":"boolean","value":"false"},"UseLosslessCompression":{"type":"boolean","value":"true"},"MaxImageResolution":{"type":"long","value":"300"},"UseTaggedPDF":{"type":"boolean","value":"true"},"ExportBookmarks":{"type":"boolean","value":"true"},"EncryptFile":{"type":"boolean","value":"false"}}' \
  --outdir <outdir> <input.pptx>
```

On Windows, `soffice` is `"C:/Program Files/LibreOffice/program/soffice.exe"`. Verified: 26 slides →
26 pages, exit 0. **Ingestion must assert PDF page count equals PPTX slide count** — hidden slides
are excluded from the render, which shifts every attribution silently.

## Do not redo

- **Do not install Poppler / ImageMagick / any PDF→image tool.** Gemini reads PDFs natively.
- **Do not expect LibreOffice to export slide images.** `--convert-to png` on a 26-slide deck yields
  **1 PNG** (first slide only). `--convert-to pdf` is correct and 1:1.
- **Do not enable `Export notes pages`** — it doubles page count and breaks slide-to-page alignment.
  Notes are read from the PPTX directly.
- **Do not run `soffice --version` and wait** — it hangs on this Windows install. Test with an actual
  `--convert-to` run.
- **Do not try to fix answer-position bias by prompting.** It was tried; the model does not comply
  reliably. It is fixed in `validate-questions.mjs`.
- **Do not pass a steering prompt to codex on codex-cli 0.145.0.** `--uncommitted`, `--base` and
  `--commit` all reject `[PROMPT]`. Reviews are **always unsteered**; `--title` is the only context
  that gets through. Treat unmentioned topics as unreviewed, not cleared.
- **Do not add an npm ZIP/OOXML library** (jszip/mammoth/officeparser). The `node:zlib` reader was
  reviewed and is correct.
- **Do not touch the PDF verdict thresholds** in `inspect-source.mjs` without reading the note in
  "In progress" — they are byte-identical to `inspect-pdf.mjs` and that equivalence is the current
  regression guard.
- **Do not point any generator at the 140 MB maths book** — watermarked commercial practice guide,
  wrong for a published DSR paper. NCERT publishes Class 11 Mathematics free at ncert.nic.in.
- **Do not re-verify the auth code or `data-layer.md`** — two Opus passes plus a Codex pass, eight
  defects found and fixed.
- **Do not use `psql`** — not installed. Neon web SQL editor only.
- **Do not add bcrypt/argon2/an auth library** — the `node:crypto` approach is built and reviewed.
- If `git add` fails with `short read while indexing nul`, a Windows reserved device name was captured
  by a `> nul` redirect. `rm -f ./nul`; both are gitignored now.

## Session notes worth keeping

- **The one-deck test paid for itself.** Visual reading works — questions came from slides 5, 9 and 11,
  which contain literally zero text. But the model also **fabricated**: three questions cited slide 1,
  which contains only `'Art' of Pitching (WITH AIRBNB AS AN EXAMPLE) Session 12`, and one asked about
  Amazon's mission statement, which is not in this deck. Source discipline needs enforcement, not
  instruction.
- **Two model families caught disjoint defects.** Opus found 7 (including a false USABLE from
  slide-number placeholders counted as speaker notes). Codex, unsteered, found 3 Opus missed —
  including a false FAIL that rejected thin slides carrying thorough notes, the best-case source shape.
- **Verify inherited doc claims before repeating them.** The "LibreOffice produces slide images" claim
  was read out of this file and repeated unchecked; Sumeet caught the contradiction and one test
  refuted it. It would have caused an unnecessary install.
- **A subagent stalled mid-task** (the validator builder, at 600s during a cleanup step). It had
  written a complete file but run **none** of its verification. Check what an agent actually verified
  before trusting "done" — two real bugs were sitting in that file.
- **Personal files were used as test data** (a resume, several unrelated decks) because no course
  material exists. Switch to a dedicated folder once real decks arrive.
