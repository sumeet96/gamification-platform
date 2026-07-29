# Current state — 29 Jul 2026

## Where we are

The source-document quality gate is **built, reviewed by two model families, and committed**.
`scripts/inspect-source.mjs` reads PDF, DOCX and PPTX and returns a **routing decision** — TEXT PATH,
IMAGE PATH, or UNUSABLE — with meaningful exit codes. LibreOffice is installed and verified, so
PPTX/DOCX → PDF rendering works. The `format` column migration for `questions` is written but **not
yet applied** to Neon.

The big directional change this session: **the image path is mandatory, not a fallback.** Sumeet
confirmed real MBA lecture decks are almost entirely pictures, so text extraction alone cannot carry
this pipeline.

What does **not** exist: any ingestion or question-generation for DOCX/PPTX.
`scripts/generate-questions.mjs` still handles PDF only and is a first-draft stub. Nothing yet sends
a document to a model. Still no automated tests of any kind, anywhere in the project.

## Working tree

Branch **`feat/source-diagnostic`**, **clean — nothing uncommitted, nothing stashed.**

```
154ee76  Correct two false claims in the project record
a75a79c  Route source documents to a text or image path before ingestion
a6cd8cd  Add a format column to questions ahead of the renderer
2d75381  Record the question-pipeline design decisions in the project record   <- previous HEAD
```

**Not merged to `main` and not pushed.** The project's history is otherwise main-only. To merge:

```
git checkout main && git merge --ff-only feat/source-diagnostic
```

`.env.local` (gitignored) still holds `DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY`, and an
intentionally **empty** `GEMINI_MODEL` awaiting a verified model id.

## In progress right now

**Nothing is mid-edit.** All three planned actions finished and committed.

The agreed next task, deliberately not started so it begins with a clean context window:
**run one real deck end to end** — `Pitch_Session 12.pptx` → LibreOffice PDF → Gemini → questions —
and judge whether visual reading produces questions worth giving students. This is a
quality-of-output question that no amount of further design work can answer.

The rendered PDF already exists from this session at the scratchpad path below (regenerate if gone):

```
"C:/Program Files/LibreOffice/program/soffice.exe" --headless --norestore \
  --convert-to pdf --outdir <outdir> "C:/Users/96sum/Downloads/Pitch_Session 12.pptx"
```

## Decisions made this session

- **The image path is mandatory, not a fallback** — Sumeet confirmed `Pitch_Session 12.pptx` (26
  slides, ~62 chars/slide, 1 real speaker note) represents how course material will actually arrive.
  A separate design-tool deck had **2 text runs across 16 slides**, all wording baked into images.
- **`inspect-source.mjs` routes rather than rejects** — visual-heavy decks are the normal case, so
  calling them WARN/FAIL flagged normal material as broken. TEXT PATH / IMAGE PATH / UNUSABLE, exit
  0 routable / 2 unusable / 1 operational failure.
- **A garbled OCR text layer routes to IMAGE PATH, not a dead end** — the page images underneath are
  intact; only the extracted text is ruined.
- **No PDF→image tool is needed** — Gemini reads PDFs with native vision (text + rendered page
  images, ~1000 pages, no charge for natively embedded text). Poppler was proposed and **withdrawn**.
- **Zero npm dependencies for OOXML** — DOCX/PPTX are read by walking the zip with `node:zlib`.
  `package.json` is unchanged and must stay that way.
- **PPTX speaker notes resolve through `ppt/slides/_rels/slideN.xml.rels`**, never by filename —
  `notesSlideN` is *not* slide N (verified: slide2→notesSlide1, slide4→notesSlide2).
- **Free tier is sufficient on volume** — ~20 decks generated once, offline. The blocker is the
  training-data clause, not rate limits.
- **Committed on a branch rather than `main`**, contrary to project habit, so the merge stays Sumeet's call.

## Open questions / blocked on

- **Does visual reading produce good questions?** Unknown and unanswerable by analysis. Unblocked by
  running one deck end to end. **This is the single most important open item.**
- **Free tier's training-data clause applied to Prof. Singh's unpublished material.** No student data
  ever reaches the LLM (questions are pre-generated offline), so this is his consent call, not a
  privacy issue. **Unblocked by asking him.** Google also cut free quotas 50–80% in Dec 2025 without
  notice, so architect for paid Tier 1 regardless.
- **`GEMINI_MODEL` is still empty.** The Flash-Lite default in CLAUDE.md was chosen for *text* work;
  reading a 2×2 framework off a slide image is harder. Verify current vision pricing/capability in AI
  Studio before setting it. Do not trust remembered model facts.
- **`db/002_add_question_format.sql` is unapplied.** Paste into the **Neon web SQL editor** (`psql`
  is not installed). Safe to re-run.
- **`db/001_add_students.sql` (~line 60)** has an unscoped `pg_constraint` guard (matches `conname`
  alone, unique only per table). Deliberately **not** fixed — already applied to the live DB. Only
  bites in a fresh environment.
- **`.ppt` and `.doc` (pre-2007) are unsupported** by `inspect-source.mjs` — extensions are `.pdf`,
  `.docx`, `.pptx` only. LibreOffice could convert them if Prof. Singh sends legacy files.
- Carried over, unchanged: **difficulty is model-assigned and uncalibrated** (still the biggest threat
  to the paper); **adaptive difficulty saturates** (`START_DIFFICULTY = 2`, caps at 5, resets each
  round); the quiz badge reads "Level 5" at `app/quiz/page.tsx:189` and should read `Difficulty 5/5`;
  a cosmetic ToS checkbox sits beside the real research-consent checkbox on signup; no shared-device
  protocol for the pilot; `potential` in `/api/stats` assumes one flat scoring rule.

## Next 3 actions

1. **Run one real deck end to end and judge the output.** Render
   `C:/Users/96sum/Downloads/Pitch_Session 12.pptx` to PDF with the command above, send that PDF to
   Gemini, and generate questions from it. Confirm the exact model id in AI Studio first and set
   `GEMINI_MODEL` in `.env.local` — do not edit the script fallback. Judge the questions on whether
   they are worth giving a student; everything downstream depends on that answer.
2. **Apply `db/002_add_question_format.sql`** by pasting it into the Neon web SQL editor.
3. **Ask Prof. Singh two things:** (a) is he comfortable with the Gemini free tier's training-data
   clause applying to his unpublished course material, or should the small paid Tier 1 spend be
   approved; (b) can he share two or three sample decks now, since everything so far has been tested
   against Sumeet's personal files.

## Do not redo

- **Do not install Poppler / ImageMagick / any PDF→image tool.** Gemini reads PDFs natively. This was
  proposed, challenged by Sumeet, tested, and withdrawn.
- **Do not expect LibreOffice to export slide images.** `--convert-to png` on a 26-slide deck yields
  **1 PNG** (first slide only). `--convert-to pdf` is correct: 26 slides → 26 pages, 1:1, so slide N
  is page N. The old claim that LibreOffice produces the images has been corrected in HANDOFF.md.
- **Do not pass a steering prompt to codex on codex-cli 0.145.0.** `--uncommitted`, `--base` and
  `--commit` all reject `[PROMPT]` at argument parsing. Reviews are **always unsteered**; `--title`
  is the only context that gets through. Treat unmentioned topics as unreviewed, not cleared.
- **Do not add an npm ZIP/OOXML library** (jszip/mammoth/officeparser). The `node:zlib` reader was
  reviewed and is correct — EOCD scanned backwards with comment tolerance, local header `nameLen`/
  `extraLen` read from the local header rather than the central directory.
- **Do not touch the PDF verdict thresholds** in `inspect-source.mjs` — byte-identical to
  `inspect-pdf.mjs` (`ocrTells >= 2 || spaceRatio < 0.12 || caretNoSupers`, `perPage >= 200`) and
  that equivalence is the regression guard for the maths-book case.
- **Do not point any generator at the 140 MB maths book** — it is a watermarked commercial practice
  guide, wrong for a published DSR paper. It now routes to IMAGE PATH (technically correct, since the
  page images are fine), but the licensing problem is unchanged. NCERT publishes Class 11 Mathematics
  free and official at ncert.nic.in if a maths source is ever needed.
- **Do not re-verify the auth code or `data-layer.md`** — two Opus passes plus a Codex pass, eight
  defects found and fixed.
- **Do not use `psql`** — not installed. Neon web SQL editor only.
- **Do not add bcrypt/argon2/an auth library** — the zero-dependency `node:crypto` approach is built
  and reviewed.
- If `git add` fails with `short read while indexing nul`, a Windows reserved device name was captured
  by a `> nul` redirect in Git Bash. `rm -f ./nul`; both are gitignored now.

## Session notes worth keeping

- **Two model families caught different defects.** Opus found 7 (including a **false USABLE** on a
  real deck — phantom speaker notes from slide-number placeholders inflating coverage to 46% when the
  mean note length was 7 characters). Codex, running unsteered, found 3 Opus missed — including a
  **false FAIL** where the character floor counted only slide text, so a deck of thin slides with
  thorough speaker notes was rejected. That is the best-case source shape, and the floor was
  discarding exactly what the notes-resolution work had just been built to find.
- **Verify inherited doc claims before repeating them.** The LibreOffice-produces-images claim was
  read out of `CURRENT_STATE.md` and repeated unchecked; Sumeet caught the contradiction, and one
  test refuted it. It would have caused an unnecessary install.
- **Personal files were used as test data** (including a resume and several unrelated decks) because
  no course material exists yet. Worth switching to a dedicated folder once real decks arrive.
