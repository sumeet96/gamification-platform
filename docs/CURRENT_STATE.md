# Current state — 29 Jul 2026

## Where we are

The game runs end to end against live Neon, behind real email+password auth, with every event
attributed to a student and the dashboard reading lifetime totals from the database. Three commits
are pushed to `origin/main`. That work is **done and not the current focus.**

The current focus is the **question-generation pipeline**, which does not exist yet in any usable
form. `scripts/generate-questions.mjs` is a first-draft stub: it reads only the first 12,000
characters (~4 pages) of a PDF and defaults to a two-generations-stale Gemini model. The design for
the real pipeline was worked out in conversation on 28–29 Jul and is captured below — **it exists
nowhere else, so treat this section as the spec.**

The immediate next task is agreed and scoped: extend the PDF diagnostic into a multi-format
`scripts/inspect-source.mjs`, to be dispatched to `builder` from a fresh session.

## Working tree

Branch `main`, **clean and fully pushed**. Nothing uncommitted, nothing stashed.

```
fa38a2a  Add source-document diagnostic; record the question-pipeline design
408bd54  Gate the whole app behind login; show lifetime stats from the database
b569cc5  Wire email+password auth so events carry a real student_id
```

`fa38a2a` carries `scripts/inspect-pdf.mjs`, the design captured in this file, and the Gemini model
guidance in `.env.local.example`. A follow-up commit records the same decisions permanently in
`HANDOFF.md` §3a and `CLAUDE.md`. **No application code has changed since `408bd54`** — the recent
commits are auth, gating/stats, and docs+tooling only.

`.env.local` (gitignored) holds `DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY`, and an
intentionally **empty** `GEMINI_MODEL` awaiting the verified Flash-Lite model id.

## In progress right now

**Nothing is mid-edit.** The next action is a `builder` dispatch, deliberately deferred to a fresh
session so the build starts with a clean context window.

### The task: `scripts/inspect-source.mjs`

Extend `scripts/inspect-pdf.mjs` into a diagnostic covering **PDF, DOCX and PPTX**. Point it at a
file or a folder of course material; get a readiness report before any ingestion is built.

`inspect-pdf.mjs` already works and its logic must be preserved:
- Directory argument lists PDFs largest-first instead of crashing (an `existsSync` check passes for
  directories — that bug is fixed, don't reintroduce it).
- Per-page character counts, near-empty page count, bytes/page.
- **Three-way verdict**, including `TEXT LAYER PRESENT BUT UNRELIABLE` for OCR-of-a-scan — detected
  via OCR tells (`zv` for `w`, run-together words, digits fused into words), space ratio < 0.12, and
  `^` present while true superscripts are absent.
- Math-notation signals, and a mid-document sample page printed for human reading.

New requirements:
- DOCX: report heading hierarchy depth and section count (Word stores heading levels — this is the
  free `topic` source).
- PPTX: report slide count, how many slides carry **speaker notes**, and text-per-slide.
- Folder mode: walk a directory of mixed course material and print a per-file readiness table.
- Keep the "verdict + why + sample" shape. The point of this tool is to stop a bad source entering
  the pipeline silently.

## Decisions made (28–29 Jul 2026)

- **LibreOffice is the rendering backend** — `soffice --headless --convert-to pdf` handles PDF, DOCX
  and PPTX, so one free system tool covers every format. Chosen over a ZIP/OOXML npm library because
  it also produces the page/slide **images** needed for the multimodal read, which would otherwise
  need a second tool. It is a system dependency, not an npm one; `package.json` stays unchanged.
- **Two channels per document.** Structure and text come from the **native** format (Word heading
  levels, PowerPoint speaker notes); the visual comes from the **rendered** version. Converting
  everything to PDF first would destroy the heading hierarchy that makes DOCX easy.
- **Normalized `ContentUnit`** is the interface between adapters and pipeline:
  `{source_doc, unit_kind: slide|section|page, unit_ref, title, text, notes, image_path?}`.
  Everything downstream is format-agnostic; a new source type is one adapter, not a pipeline change.
- **A slide is already a chunk.** PPTX needs no chunking strategy — the professor authored each slide
  as one idea. DOCX chunks on headings. Only PDF needs inferred boundaries.
- **PDF is a container, not a format.** It can be a clean export, a scan, or a scan with broken OCR.
  So `inspect-source` is a **permanent mandatory gate** in the pipeline, not a one-off troubleshooting
  script. A PDF failing the quality check routes to the multimodal path instead of silently
  producing garbage.
- **Generate only self-contained questions (type "a").** The model *reads* charts and diagrams to
  write questions, but questions must not *require* the student to see the image. This gets the full
  pedagogical value of B-school visuals while keeping every question plain text — no asset storage,
  no image rendering in the quiz UI. Type "b" (chart-reading questions) stays additive for later via
  an `asset_path` column.
- **Add a `format` column to `questions`** (`plain` | `latex` | `markdown`, default `plain`) *before*
  it is needed. The quiz renderer switches on it; today every row is `plain` and no renderer ships.
  ~10 lines now, avoids a migration plus a render-path rewrite when maths arrives.
- **Clean text documents first; mathematics as a later generalisation proof.** Sumeet's argument for
  maths-first (hardest case → everything else is easy) holds for *infrastructure* (notation storage,
  renderer, multimodal ingestion) but **not for the AI layer** — maths questions test procedure,
  management questions test understanding, so prompts, difficulty rubrics and validation don't
  transfer. Maths-first risks 60–100 hours on capability the pilot may never need. Running the same
  pipeline over a maths textbook *after* the pilot path works is a stronger DSR claim anyway
  (demonstrated generalisation, not an untested design goal).
- **Gemini model is two generations stale.** As of 21 Jul 2026: **Gemini 3.6 Flash** ($1.50/$7.50 per
  1M) and **Gemini 3.5 Flash-Lite** ($0.30/$2.50). **Flash-Lite is the right default for bulk MCQ
  generation** — schema-constrained work, 5x cheaper. Confirm the exact API model string in AI Studio
  (product names ≠ API ids) and set `GEMINI_MODEL` in `.env.local` rather than editing the script
  fallback. Google no longer publishes universal RPM limits; they are project-specific in the console.
- **GPT-5.6 is the adversary, not the author** (already in CLAUDE.md): Gemini Flash generates question
  drafts cheaply; GPT-5.6 attacks and validates them, and provides schema-guaranteed JSON via
  Structured Outputs (`response_format: json_schema`, `strict: true`) — which removes the regex
  JSON-parsing fallback currently in the generator.

## Source material — findings

- **Course content does not exist yet.** Prof. Singh writes lecture material days before term begins
  (pilot from ~mid-Sept 2026). He has said to use *any* document to build the pipeline. The real
  requirement this creates is not "handle maths" but **"ingest an unfamiliar document in a few days,
  unattended"** — i.e. automation, idempotency and robustness matter more than notation support.
- Expected formats when it arrives: **PPTX mostly, plus DOCX and PDF**. B-school decks are
  visual-heavy (frameworks, 2×2s, charts) — the pedagogical content is often *in* the visual, and
  speaker notes often hold the actual explanation.
- **The 140 MB maths book is unusable and should not be the starting document.** 728 pages, ~207 KB
  per page. `inspect-pdf.mjs` initially reported TEXT-BASED (2,524 chars/page) — that verdict was
  **wrong**, and the script has since been fixed. It is a **scan with a poor OCR layer**: `answer` →
  `anszver`, `MATHEMATICS` → `MATHEM/ :ICS`, `[NCERT]` → `INCERi]`. The mathematics is destroyed, not
  degraded — superscripts gone (`x²` → `x'^`), set braces randomised to `[ ) | \`, `∈` collapsed to
  `e`/`s`, variables substituted (`x` → `j`, `a:`). No model can recover the intended equations.
- That file is also a **watermarked commercial practice guide** ("Read Your Flow Find Your for Free
  eBooks" header; `Type II ON EQUAL SETS` / `EXAMPLE` / `SOLUTION` structure), not the NCERT
  textbook. A methods section reading "generated from a watermarked copy of a commercial textbook"
  is a problem for a published DSR paper. **NCERT publishes Class 11 Mathematics free and official at
  ncert.nic.in** (16 chapters, per-chapter PDFs, digitally typeset) — cleaner, legal, and the
  per-chapter split provides topic structure for free.

## Open questions / blocked on

- **Difficulty is model-assigned and uncalibrated, and the adaptive lever depends entirely on it.**
  Still the biggest threat to the paper. Fix: compute each item's empirical p-value from `events` and
  compare against the assigned label. Run a pilot-of-the-pilot (5–6 people, one session) to calibrate
  *before* the real cohort — recalibrating mid-pilot changes what the difficulty scale means partway
  through the dataset.
- **Adaptive difficulty saturates.** `START_DIFFICULTY = 2`, caps at 5, resets each round, so a strong
  student is at the ceiling from question 4 and the lever stops differentiating. Options: start at 3,
  widen the scale, or carry difficulty across rounds within a session.
- **The quiz badge reads "Level 5"** (`app/quiz/page.tsx:189`) which looks like a persistent player
  level; it is the current question's difficulty. Suggested relabel: `Difficulty 5/5`. Not yet done.
- **A cosmetic terms-of-service checkbox sits beside the real research-consent checkbox** on signup and
  nothing server-side reads it. An ethics reviewer would notice.
- **Shared-device protocol for the pilot** — code resets the session on login/signup/logout, but a
  student who walks away without logging out leaves the next person's events attributed to them.
- **`potential` in `/api/stats`** is `answered × POINTS_CORRECT` — correct only under one flat scoring
  rule. Phase 2 variable rewards will need the `scoring_version` column already flagged in
  `data-layer.md`.

## Next 3 actions

1. **Check LibreOffice is installed** before anything else — `soffice --version` (on Windows it may
   need the full path, e.g. `"C:/Program Files/LibreOffice/program/soffice.exe" --version`). It is
   the single prerequisite for the whole ingestion design. If it is missing, install it first; the
   builder brief changes if it is unavailable.
2. **Dispatch `builder`** to write `scripts/inspect-source.mjs` per the spec in "In progress" above —
   PDF + DOCX + PPTX, preserving the existing three-way verdict and OCR-detection logic. No npm
   dependencies; `package.json` must not change.
3. **Add the `format` column** to `questions` via `db-engineer` (additive migration,
   `NNN_short_name.sql` convention, reflected in `db/schema.sql`) — cheap now, awkward later.

## Do not redo

- **Do not re-verify the auth code or `data-layer.md`.** Two full Opus review passes plus a Codex
  pass; eight defects found and fixed; every doc claim checked line by line against source.
- **Do not point any generator at the 140 MB maths book.** Its text layer is dense enough (2,524
  chars/page) to look healthy while being unusable. That is the trap, and it has already been walked
  into once.
- **Do not try to repair a broken OCR text layer.** The information is gone, not obscured. Use a
  multimodal read of the page images, or find a cleaner source.
- **Do not add an npm ZIP/OOXML library for PPTX/DOCX.** LibreOffice was chosen deliberately over
  that route; `package.json` stays unchanged.
- **Do not build asset storage or image rendering for questions yet.** The type-(a) decision exists
  specifically to avoid that subsystem.
- **Do not try `gpt-5.1-codex-mini` / `-codex` / `-codex-max`** — retired, API 404. Only `gpt-5.6-*`.
- **Do not pass a steering prompt with `--uncommitted` to codex** — rejected at argument parsing on
  codex-cli 0.145.0. Use `--base` or `--commit <sha>`. Both argument orderings fail.
- **Do not use `psql`** — not installed. Use the Neon web SQL editor.
- **Do not add bcrypt, argon2, or an auth library.** The zero-dependency `node:crypto` approach is
  built and reviewed.
- If `git add` fails with `short read while indexing nul`, a Windows reserved device name was captured
  as a real file by a `> nul` redirect in Git Bash. `rm -f ./nul`; both are gitignored now.

## Session-hygiene note

The 28 Jul session reached 270k tokens (27% of 1M) across roughly 20 subagent dispatches; **over 1.1M
tokens ran inside agent windows and never entered the main conversation** — the orchestration setup is
measurably working, roughly 5x. Two things learned worth keeping:

- **Batch config edits.** `CLAUDE.md`, memory files and agent definitions sit early in the context, so
  editing them mid-session invalidates the cached prefix and makes that turn ~20x more expensive than
  a cache hit. That session edited them ~15 times, scattered. Batch them instead.
- **Checkpoint at task boundaries, not token thresholds.** Start a fresh session when the *subject*
  changes. The 28 Jul session had at least four clean boundaries and used two.
