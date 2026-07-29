# Current state — 29 Jul 2026

## Where we are

Two pipeline tools are built, verified and committed: `scripts/inspect-source.mjs` (560 lines, routes
a document to TEXT PATH / IMAGE PATH / UNUSABLE) and `scripts/validate-questions.mjs` (179 lines,
rejects bad generated questions and shuffles option order deterministically). LibreOffice is installed
and the exact PPTX → PDF export command is verified.

**The approach is proven.** One real lecture deck was run end to end through Gemini and produced
usable questions from slides containing zero text — visual reading works. It also exposed four
defects in the generated output, which `validate-questions.mjs` now catches.

**A full `/simplify` pass ran and is complete** — 673 deletions, 102 insertions, net ~571 lines
removed (~16% of the codebase) with no capability lost.

What does **not** exist: automated ingestion. `scripts/generate-questions.mjs` is still a PDF-only
first-draft stub, nothing sends a document to a model programmatically, and `db/002` is unapplied.
No automated tests anywhere.

## Working tree

Branch **`feat/source-diagnostic`**, **clean**. **11 commits ahead of `main`, not pushed.**

```
404f2cb  Make round_stop mean one thing in the event log
7895e69  Drop OCR heuristics that misfire on ordinary business prose
08df8b1  Delete five files nothing references
6c5dd85  Record the question-validation stage in the project record
10fd55b  Reject generated questions that break the pipeline rules
e64d732  Record the verified PDF export settings and the slide-alignment hazard
154ee76  Correct two false claims in the project record
a75a79c  Route source documents to a text or image path before ingestion
a6cd8cd  Add a format column to questions ahead of the renderer
```

Project history is otherwise main-only:

```
git checkout main && git merge --ff-only feat/source-diagnostic
```

`.env.local` (gitignored) holds `DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY`, and an
intentionally **empty** `GEMINI_MODEL`.

## In progress right now

**Nothing is mid-edit. `/simplify` finished.** The next task is a fresh build, deliberately not
started so it begins with a clean context window: **wire the generation script end to end** —
render a deck via LibreOffice, send the PDF to Gemini with the prompt recorded in `HANDOFF.md` §3a,
pipe the output through `scripts/validate-questions.mjs`, then write to Neon. Nothing does this today.

Two guards that must go into that script and do not exist yet:
1. **Assert PDF page count equals PPTX slide count.** Hidden slides are excluded from the render, so
   page count can fall short and shift every slide attribution silently. Both numbers are already
   produced by `inspect-source.mjs`.
2. **Nothing reaches the database without passing `validate-questions.mjs`.** Today
   `generate-questions.mjs:79-81` has its own weaker inline check that *clamps* rather than rejects —
   `Number(q.answer) || 0` turns a null answer into index 0 and upserts it.

### The verified PPTX → PDF command

```bash
soffice --headless --norestore \
  --convert-to 'pdf:impress_pdf_Export:{"ExportNotesPages":{"type":"boolean","value":"false"},"UseLosslessCompression":{"type":"boolean","value":"true"},"MaxImageResolution":{"type":"long","value":"300"},"UseTaggedPDF":{"type":"boolean","value":"true"},"ExportBookmarks":{"type":"boolean","value":"true"},"EncryptFile":{"type":"boolean","value":"false"}}' \
  --outdir <outdir> <input.pptx>
```

On Windows `soffice` is `"C:/Program Files/LibreOffice/program/soffice.exe"`. Verified 26 slides → 26
pages, exit 0.

## Decisions made this session

- **The image path is mandatory, not a fallback** — Sumeet confirmed `Pitch_Session 12.pptx` (26
  slides, ~62 chars/slide, 1 real speaker note) represents how course material will arrive. A
  design-tool deck had **2 text runs across 16 slides**, all wording baked into images.
- **No PDF→image tool is needed** — Gemini reads PDFs with native vision. Poppler was proposed,
  challenged by Sumeet, tested, and **withdrawn**.
- **Answer-position bias is fixed in code, not by prompting** — the model put 8 of 15 correct answers
  at index 1 and none at index 3; always guessing B scored 53%, profitable under +20/−10 while
  learning nothing. `validate-questions.mjs` shuffles seeded on a hash of the prompt, so runs stay
  reproducible.
- **Questions carry a permanent `slide` field** — it is how fabrication is caught. It caught three
  cases on the first run.
- **The OCR "tell" heuristics were deleted, not tuned** — they misfired on the pilot's own subject
  matter (`IndianOil`, `D2C`, `PowerPoint`, `B2B` all trip them) *and* never changed a routing
  outcome, since low-quality and sparse text both go to the image path. `spaceRatio < 0.12` and the
  caret check survive.
- **`round_stop` is emitted with one shape** — the round number is now stamped onto `RoundSummary`
  at commit time in `app/quiz/page.tsx`, and `app/results/page.tsx` reads `lastRound.round` instead
  of re-deriving it. They previously agreed only by commit-timing coincidence.
- **Committed on a branch, not `main`**, so the merge stays Sumeet's call.

## Open questions / blocked on

- **Difficulty labels do not discriminate.** Confirmed empirically: a question labelled 4 was
  answerable cold; the 1s and 2s were indistinguishable. The adaptive lever is built on this scale.
  **Still the biggest threat to the paper.** Fix: compute empirical p-values from `events` and
  calibrate against a pilot-of-the-pilot (5–6 people) **before** the real cohort.
- **Free tier's training-data clause on Prof. Singh's unpublished material.** No student data reaches
  the LLM (generation is offline), so this is his consent call. **Unblocked by asking him.** Limits:
  Flash-Lite 15 RPM / 1,000 RPD, Flash 10 RPM / 250 RPD, 250k TPM shared — ~20 decks generated once,
  so volume is not the constraint. Google cut free quotas 50–80% in Dec 2025 without notice; architect
  for paid Tier 1 regardless.
- **`GEMINI_MODEL` is empty.** The AI Studio playground demanded a paid key, but `GEMINI_API_KEY`
  already exists in `.env.local` — that was a playground gate, not an account one. The API is not
  blocked. Confirm the exact vision-capable model id before setting it.
- **`db/002_add_question_format.sql` is unapplied.** Paste into the **Neon web SQL editor** (`psql`
  not installed). Safe to re-run.
- **The answer key ships to the browser.** `/api/questions` returns `answer` for every row because
  scoring is client-side (`app/quiz/page.tsx` compares `i === q.answer`). A student with devtools can
  score perfectly and the dataset cannot distinguish that from learning. Needs a deliberate decision.
- **Signup collects `phone`, `gender`, `education`, `learningGoals` that nothing reads.** Either
  research covariates worth keeping, or dead weight an ethics reviewer will query. Sumeet's call.
- **`clsx` and `tailwind-merge` are now unused** in `package.json` (`cn()` was deleted). Left in place
  deliberately rather than removed unilaterally.
- **Abandoned rounds reuse a round number.** Quitting mid-quiz never increments `session.roundsPlayed`,
  so two real attempts can share a `round` in the event log. Pre-existing, not fixed.
- **`db/001_add_students.sql` (~line 60)** has an unscoped `pg_constraint` guard. Deliberately not
  fixed — already applied to the live DB.
- **`.ppt` / `.doc` (pre-2007) unsupported** — `.pdf`, `.docx`, `.pptx` only.
- Carried over: adaptive difficulty saturates (`START_DIFFICULTY = 2`, caps at 5, resets each round);
  quiz badge reads "Level 5" at `app/quiz/page.tsx` and should read `Difficulty 5/5`; a cosmetic ToS
  checkbox sits beside the real research-consent checkbox; no shared-device protocol.

## Next 3 actions

1. **Wire generation end to end.** Extend `scripts/generate-questions.mjs`: render the deck with the
   command above, upload the PDF to Gemini with the §3a prompt, pipe output through
   `node scripts/validate-questions.mjs <file> --out clean.json`, then upsert. Include the two guards
   in "In progress". Set `GEMINI_MODEL` in `.env.local` first — do not edit the script fallback.
2. **Apply `db/002_add_question_format.sql`** in the Neon web SQL editor.
3. **Ask Prof. Singh:** (a) free-tier training-data clause on his material, or approve paid Tier 1;
   (b) two or three sample decks — everything so far was tested against Sumeet's personal files.

## Do not redo

- **Do not install Poppler / ImageMagick / any PDF→image tool.** Gemini reads PDFs natively.
- **Do not expect LibreOffice to export slide images.** `--convert-to png` on a 26-slide deck yields
  **1 PNG**. `--convert-to pdf` is correct and 1:1.
- **Do not enable `Export notes pages`** — doubles page count, breaks slide-to-page alignment.
- **Do not reinstate OCR "tell" regexes.** Tested: `IndianOil` and `D2C` in a real clean business PDF
  trip 2 of 4, which met the threshold and misrouted it. They also never changed an outcome.
- **Do not run `soffice --version` and wait** — hangs on this Windows install. Test with `--convert-to`.
- **Do not fix answer-position bias by prompting.** Tried; not complied with. Fixed in code.
- **Do not pass a steering prompt to codex on codex-cli 0.145.0.** `--uncommitted`, `--base` and
  `--commit` all reject `[PROMPT]`. Reviews are **always unsteered**; `--title` is the only context
  that gets through. Treat unmentioned topics as unreviewed, not cleared.
- **Do not add an npm ZIP/OOXML library.** The `node:zlib` reader was reviewed and is correct.
- **Do not recreate `lib/utils.ts`, `components.json`, `GIT_SETUP.sh`, `scripts/inspect-pdf.mjs`, or
  `supabase/migrations/0001_events.sql`** — all deleted this session as dead. The Supabase one defined
  a *conflicting* `events` table from the pivoted-away design.
- **Do not delete `db/001`/`db/002` migrations** because `schema.sql` restates them — applied
  migrations are history.
- **Do not remove `--ignore-slides` / `checkProvenance`** from `validate-questions.mjs` because nothing
  emits `slide` yet. The new generator will, and it is the fabrication check.
- **Do not point any generator at the 140 MB maths book** — watermarked commercial guide, wrong for a
  published DSR paper. NCERT publishes Class 11 Mathematics free at ncert.nic.in.
- **Do not re-verify the auth code or `data-layer.md`** — two Opus passes plus a Codex pass.
- **Do not use `psql`** — not installed. Neon web SQL editor only.
- **Do not add bcrypt/argon2/an auth library** — `node:crypto` approach is built and reviewed.
- If `git add` fails with `short read while indexing nul`, `rm -f ./nul`.

## Session notes worth keeping

- **The overengineering was real and had one shape:** building for an assumed problem, then not
  deleting the machinery once the real problem was measured. The OCR heuristics were preserved
  byte-identically across two files, defended as a regression guard, reviewed by two model families —
  and misclassified the pilot's own material while never changing an outcome. When a decision changes
  (here: "picture-reading is mandatory"), go back and delete what it obsoleted.
- **The one-deck test paid for itself.** Visual reading works — good questions came from slides 5, 9
  and 11, which contain zero text. But the model also **fabricated**: three questions cited slide 1,
  which holds only the deck title, and one asked about Amazon, absent from the deck.
- **Two model families caught disjoint defects.** Opus found 7 (including a false USABLE from
  slide-number placeholders counted as notes). Codex, unsteered, found 3 Opus missed — including a
  false FAIL rejecting thin slides with thorough notes, the best-case source shape.
- **Verify inherited doc claims before repeating them.** The "LibreOffice produces slide images" claim
  was read out of this file and repeated unchecked; Sumeet caught the contradiction and one test
  refuted it. It would have caused an unnecessary install.
- **A subagent stalled having written a complete file but run none of its verification.** Two real bugs
  were sitting in it. Check what an agent actually verified before trusting "done".
- **Personal files were used as test data** (a resume, several unrelated decks) because no course
  material exists. Switch to a dedicated folder once real decks arrive.
