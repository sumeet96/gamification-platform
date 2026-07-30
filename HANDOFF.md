# HANDOFF: Gamified Adaptive Learning Platform (FBT Research Project)

**Prepared:** 22 Jul 2026. **Updated:** 30 Jul 2026, second checkpoint (cold-start item-difficulty
research, the decision to seed difficulty by LLM student simulation on a local Ollama model rather
than Elo, the Phase 0 spike and what it did and did not validate, and the `source_excerpt` column
consequence; see §13). Previous update, same day: 30 Jul 2026 (transcript re-read surfacing five corrections to `CLAUDE.md`, the new `docs/PROJECT_MAP.md` project spine, per-game lever semantics and the `resolveLever` design, the platform's live-ingestion/subject-agnostic/PDF-input direction, the project's first automated tests, and a `sol-consult` GPT-5.6 Sol consultation reversing three design decisions; see §12). Previous update: 29 Jul 2026 (question-generation pipeline design decisions, 28-29 Jul, plus the source-diagnostic build, a LibreOffice rationale correction, a codex-steering correction, a `/simplify` pass removing 673 dead/misfiring lines, and a `round_stop` event-shape fix, all recorded same day; see §3a). Previous update: 28 Jul 2026 (post-pivot rebuild; authentication wired same day, commit b569cc5; app gated end to end and lifetime stats added same day, commit 408bd54). Original text consolidates 3 Claude.ai conversations (19-22 Jul 2026), the transcribed 21-minute supervisor call of 21 Jul 2026, and 8 project reference papers. The 27 Jul supervisor call pivoted the project; the 28 Jul 2026 rebuild (commit e0b3fd9) implemented the pivot, a same-day follow-up (commit b569cc5) wired real authentication, and a further same-day commit (408bd54) closed the login gate and wired lifetime stats. All three commits are pushed to `origin/main`. This doc now records both the original vision (history) and the current state.

---

## 1. Project identity

- **Researcher:** Sumeet Mohanty, PGDM (GM) Co'26, XLRI. Prior: BYJU'S (FIFA Math Cup gamification launch); has independently shipped agent-based tools (a CX analysis app, a domain chatbot), used as a build-credibility signal with the professor.
- **Supervisor:** Prof. Harshit Kumar Singh (name per earlier conversations; verify spelling before putting it in any document). An IS/management academic who publishes in AJIS/ACIS/HICSS. His comfort zone is theory-building reviews, MCDM frameworks, and SDT-grounded engagement studies, not software builds. He is teaching a Gamification course from mid-September 2026.
- **Container:** a 6-month Field-Based Training (FBT) project. Budget is roughly 3 hrs/day, so about 400-450 productive hours total.
- **Sumeet's stated priorities:** (1) a deployed, demo-able artifact for the employment portfolio; (2) realistic scope; (3) publication is a bonus under XLRI's name, not the driver. The professor explicitly de-prioritized the paper on the 21 Jul call ("project first, paper if possible, not a pressure point").

## 2. How the idea evolved (important for continuity)

1. **19 Jul (brainstorm + email):** Started as workplace agentic gamification. A literature scan (web plus project PDFs) found that adaptive/personalized gamification is saturated in education and health, that workplace is the under-studied domain, and that existing LLM work uses models as content generators rather than orchestrators. Three problem statements were emailed to the prof: (PS1) an agentic orchestrator for hyper-personalized workplace gamification grounded in his 2023 AJIS relatedness paper, as a Slack/Teams bot plus a DSR pilot; (PS2) a workplace-learning/L&D variant; (PS3) an MCDM framework for evaluating agentic gamification platforms (no build).
2. **21 Jul (meeting prep):** Deep-read of 4 papers. Key correctness notes: the AJIS paper's moderated mediation was non-significant (the earlier email slightly overstated the moderation finding, and a correction was planned for the call); the intellectual-engagement path was null; surveillance/voluntariness was flagged as an ethics topic.
3. **21 Jul call (initial pivot):** The prof proposed combining PS1 and PS2 and shifting the context to education, specifically his own classroom (lower access risk, and he can pilot it himself). The workplace framing is effectively parked. The "agentic orchestration, not content generation" novelty claim carries over intact; it is now expressed as AI designing the game mechanics per student.

## 3. The 27 Jul pivot (supervisor decision on 27 Jul 2026)

**Who:** Prof. Harshit Kumar Singh.

**What changed:** On 27 Jul at 3:39 PM, after reviewing the architecture doc and model comparison (the §7 deliverable), the supervisor pivoted the project from the AI-designed-quests model to a **gamified adaptive-learning dashboard**. 

**Old design (21 Jul call, §3 below):** AI layer designs quests, badges, and point values per student. Anti-comfort-zone economy (points diminish in strong areas, higher rewards for weak areas). Phase 1 baseline, Phase 2+ AI-personalized. Teacher approval per quest (HITL). Teacher dashboard showing inferred strengths/weaknesses and pending AI proposals.

**New design (27 Jul call, 28 Jul rebuild):** Fixed-point scoring (+20 correct, −10 negative marking). Students see net score against potential. Each student picks ONE adaptivity lever: either **adaptive difficulty** (ramps up/down per performance) or **time pressure** (clock tightens). Rapid/normal velocity modes. "Keep going → next round" persistence loop. All mechanics are pre-coded; no AI-designed quests. Framed as a Design Science Research artifact. Per-question event logging (session, round, interactions, score, adaptivity feedback) is the research dataset. MCQ generation from course PDFs remains, but it is pre-generated, not real-time.

**Rationale (prof's reasoning, from call audio):** The AI-quest design added complexity (prompt engineering, HITL workflow, approval latency) that would consume most of the 6-month budget without guaranteeing research insights. The adaptive-learning dashboard is a cleaner DSR artifact: a tight mechanic with a clear experimental treatment (the adaptivity lever), immediate feedback loops, and rich event logging. It is deployable faster and more defensible as research.

**Parked, not dead:** Personality/player-type profiling, age × variable-reward thesis, and teacher-approval HITL quest design are deferred to future work. The repo history preserves the earlier code and thinking.

**Implementation:** 28 Jul 2026 00:45 UTC, commit e0b3fd9 ("Rebuild as adaptive learning game"). The rebuild:
- Moved off Next 14 / src structure to Next 16 / app structure.
- Adopted v0 scaffolding for the front-end (React 19, Tailwind v4).
- Moved from Supabase to Neon serverless Postgres for the DB.
- Replaced the reward-engine and student-profiler code with a clean game engine (lib/game/engine.ts, lib/game/game-context.tsx) tracking session/round/score/adaptivity.
- Wired dashboard, game-setup, quiz, results screens to the engine.
- Generated MCQ pipeline (scripts/generate-questions.mjs) using Gemini from course PDFs.
- Event logging API (app/api/events) to store per-question interactions.
- Login and signup UI scaffolded for future wiring (not yet functional).

**Follow-up (28 Jul 2026, commit b569cc5): authentication wired.** Under the scaffolded UI, `events.student_id` was always null, which ruled out per-student analysis (learning curves, cross-session comparison, any link to roster or demographic data) and was the top-ranked gap in the data-layer review. Real email+password authentication now closes it: every event carries the student's id.

Built with no new dependencies: `node:crypto` scrypt for password hashing (per-password salt, stored as `salt:hash` in hex, verified with `timingSafeEqual`), and a stateless HMAC-SHA256 signed session cookie (httpOnly, sameSite lax, secure in production, 30 days; `SESSION_SECRET` is required server-side with no fallback). `package.json` is unchanged. A root-level `proxy.ts` (Next 16's successor to `middleware.ts`) gates `/quiz`, `/game-setup`, and `/results`.

New table `students`, keyed by an opaque id rather than the email, so no direct identifier reaches the event log. `events.student_id` is now a nullable foreign key to it, indexed alongside `(session_id, round)`. Migration `db/001_add_students.sql`, establishing the convention `NNN_short_name.sql`, re-runnable.

Two decisions matter more for the research design than the implementation: `student_id` is read from the session cookie inside `/api/events`, never from the request body, because a client-supplied id would be forgeable and would corrupt the dataset undetectably; and signup persists `dob` (age as a future covariate) and records research consent as `consented_at`, enforced server-side rather than trusted from the client.

Six defects were found by review and fixed before commit. The one worth keeping on record: `resetSession()` had no call sites, so on a shared classroom laptop one `session_id` could span two students, with round numbers and the persistence counter bleeding across them. It now runs on login, signup, and logout.

**Follow-up (28 Jul 2026, commit 408bd54): whole app gated, lifetime stats from the database.** `proxy.ts` changed from allow-by-default to deny-by-default. Previously only `/quiz`, `/game-setup`, and `/results` were protected, so `localhost:3000` dropped an unauthenticated visitor straight into the dashboard and the game. Now only `/login`, `/signup`, and the login/signup/logout API routes are public; everything else requires a valid session. Pages redirect to `/login`; API routes return 401. Logout stays public on purpose: gating it means the 401 would fire before the handler runs, so the `Set-Cookie` that clears a stale cookie would never send.

Nothing in the codebase had ever read the `events` table back. The dashboard's lifetime numbers came from `sessionStorage`, which is cleared on logout, so a student who logged out and back in saw zero while their history sat untouched in Neon. A new `GET /api/stats` aggregates lifetime totals for the cookie-identified student, and the dashboard now reads that, including a "sessions played" figure it could not show before. Per-tab session state still drives gameplay, round numbering, and event logging exactly as before, so the research semantics were not disturbed.

A decision worth recording: anonymous pre-login play is deliberately not merged into an account. Those events carry a null `student_id`, and attributing them retroactively would invent data — on a shared device it would credit one student's answers to whoever logged in next.

A data-model correction came out of this work: `events.round` is 1-based as written and restarts at 1 in every session, so any lifetime round count must aggregate on `(session_id, round)`, not on row count. An earlier note describing it as 0-based was wrong. This was checked against live rows, not assumed.

Eight defects were found and fixed across two review rounds before commit.

**Status, stated plainly:** the application has now run end to end against a live Neon database for the first time — schema applied (3 tables, foreign key in place), real accounts created, real gameplay recorded. All three of 28 Jul's commits (e0b3fd9, b569cc5, 408bd54) are pushed to `origin/main`. There is still no automated test of any kind; correctness so far rests on manual review and this one live run.

## 3a. Question-generation pipeline: design decisions (28-29 Jul 2026, not yet built)

The pipeline itself does not exist yet. `scripts/inspect-source.mjs` (committed in `fa38a2a`/`a75a79c`; superseded `scripts/inspect-pdf.mjs`, which was deleted as dead on 29 Jul, commit `08df8b1`) is the first piece of it. Everything below is a design decision taken during the 28-29 Jul 2026 planning work, recorded before any of the rest is built.

**The direction decision.** Sumeet proposed building the pipeline first against a Grade 11 mathematics textbook, on the reasoning that maths is the hardest case and everything else becomes easy by comparison. On examination this holds for *infrastructure* only: notation-capable storage, a renderer, and multimodal ingestion are strict supersets of what plain prose needs. It does not hold for the AI layer: maths questions test procedure, management questions test understanding, so the generation prompt, the difficulty rubric, and the validation approach do not transfer from one domain to the other. Maths-first risked roughly 60-100 hours on a capability the pilot may never need, against a total budget of ~400-450 hours and a mid-September pilot. **Decision: build against clean text documents first; treat mathematics as a later generalisation proof**, run once the pilot path already works. That ordering is also the stronger research claim — demonstrated generalisation across subject domains, rather than an untested design goal carried into the pilot.

**The constraint behind the decision.** Prof. Singh writes his lecture material only days before term begins, and has told Sumeet to use any document to build the pipeline against. The real requirement this creates is not "handle mathematics" but "ingest an unfamiliar document within days, unattended." Automation, idempotency, and robustness to malformed input matter more than notation support.

**Architecture decisions:**

- **LibreOffice is the single rendering backend** for PDF, DOCX, and PPTX (`soffice --headless --convert-to pdf`), chosen over an npm ZIP/OOXML library. It is a system dependency, installed on the machine rather than a package; `package.json` is unaffected.
  - _Rationale corrected 29 Jul 2026:_ the original reasoning (LibreOffice "also produces the page/slide images needed for the multimodal read") was tested and is wrong. `soffice --headless --convert-to png` on a 26-slide PPTX produced exactly 1 PNG, the first slide only — it does not do per-slide image export. The actual reason one tool suffices: `--convert-to pdf` does work correctly (26 slides → 26 PDF pages, confirmed by page count), and the Gemini API reads PDFs with native vision — it extracts embedded text and processes rendered images of each page for documents up to ~1000 pages, and does not charge for tokens from natively embedded text (https://ai.google.dev/gemini-api/docs/document-processing). So the PDF LibreOffice already produces is the finished input to the model; no separate PNG extraction step or second tool (e.g. Poppler) is needed.
  - _Refined 29 Jul 2026, verified by running it:_ the PPTX → PDF export must pass explicit FilterData JSON options on the command line, since LibreOffice's GUI export dialog never appears in an automated run and defaults apply silently. Confirmed on `Pitch_Session 12.pptx`: exit 0, 26 slides → 26 pages, 2.76 MB. Non-obvious values: `ExportNotesPages` false (true appends a notes page per slide, 26→52, breaking the slide N = page N mapping question attribution depends on — notes are already read natively via `resolveNotesEntry()` in `scripts/inspect-source.mjs`); `UseLosslessCompression` true (decks carry wording baked into images and JPEG artefacts land on the letters; Gemini bills per page not per byte and rasterises each page regardless, so the only cost is file size — 1.17 MB default vs 2.76 MB lossless, same token cost); `UseTaggedPDF` true (preserves structure for the text half of Gemini's dual read); `EncryptFile` false (an encrypted PDF reports UNUSABLE in `inspect-source.mjs`).
    - **Hazard for the pipeline build:** "Export hidden pages" is off by default, correctly — hidden slides were hidden deliberately — but that means a deck with hidden slides renders fewer PDF pages than it has slides, shifting every subsequent slide's page number and silently misattributing questions. The pipeline must assert PDF page count equals PPTX slide count before generating anything; both counts already come from `scripts/inspect-source.mjs`.
    - `soffice --version` hangs / returns no output on this Windows install; test LibreOffice availability with an actual `--convert-to` run, not `--version`.
- **Two ingestion channels per document.** Structure and text come from the native format (Word heading levels, PowerPoint speaker notes); the visual read comes from the rendered version. Converting everything to PDF first was rejected because it would destroy the heading hierarchy that makes DOCX the easiest format to ingest.
- **A normalized `ContentUnit`** is the interface between format adapters and the rest of the pipeline: `{source_doc, unit_kind: slide|section|page, unit_ref, title, text, notes, image_path?}`. Everything downstream of this is format-agnostic, so adding a new source type later is one adapter, not a pipeline change.
- **Chunking is format-dependent.** A slide is already a chunk, so PPTX needs no chunking strategy. DOCX chunks on headings. Only PDF needs an inferred chunk boundary, because PDF carries no reliable structure of its own.
- **PDF is treated as a container, not a format** — it can be a clean export, a scan, or a scan with broken OCR underneath. `scripts/inspect-source.mjs` is a **permanent mandatory gate** in the pipeline for this reason, not a one-off troubleshooting script. Built 29 Jul 2026, commit `a75a79c`: it routes rather than rejects, returning one of three verdicts — TEXT PATH, IMAGE PATH, UNUSABLE — with exit codes 0 (routable, either path), 2 (unusable), 1 (operational failure, e.g. bad args or unreadable file). A PDF with a garbled OCR text layer routes to IMAGE PATH because the page images underneath are intact, so it is still usable, just via the other route.
- **Generate only self-contained questions.** The model reads charts and diagrams in the source material to write questions, but a question must not require the student to see the image to answer it. This captures the pedagogical value of B-school visuals while keeping every question plain text — no asset storage, no image rendering in the quiz UI. Chart-reading questions that do require the image remain a later, additive feature via an `asset_path` column.
- **Add a `format` column to `questions`** (`plain` | `latex` | `markdown`, default `plain`) now, before it is needed, so that mathematics support later is an additive change rather than a migration plus a render-path rewrite.

**Source-material findings.** A 728-page mathematics textbook (140 MB) was tested against this design and found unusable: it is a scan with a poor OCR layer, dense enough (~2,500 characters per page) that a naive pipeline would report success while producing garbage. The mathematics is destroyed rather than degraded — superscripts lost, set braces randomised, set-membership symbols collapsed to plain letters. It is also a watermarked commercial practice guide rather than the NCERT textbook, which would be a problem for a published paper's methods section. NCERT publishes Class 11 Mathematics free and official at ncert.nic.in, digitally typeset and split per chapter — the correct source if the mathematics generalisation proof is attempted later.

Expected pilot document formats are PPTX mostly, plus DOCX and PDF.

**The image path is mandatory, not a fallback (confirmed 29 Jul 2026).** Sumeet confirmed that `Pitch_Session 12.pptx` — a real MBA lecture deck, 26 slides, ~62 characters of text per slide, 1 genuine speaker note — is representative of how the course material will arrive. Separately, a design-tool-exported deck was found to contain 2 text runs across 16 slides, with all wording baked into images. Text extraction alone cannot carry this pipeline; the image route via LibreOffice-rendered PDF (see the LibreOffice rationale above) is load-bearing for most of the expected material, not a rare-case fallback.

**Gemini free-tier limits, checked live 29 Jul 2026:** Flash-Lite 15 RPM / 1,000 RPD; Flash 10 RPM / 250 RPD; 250k TPM shared across a project. Question generation is a one-off offline batch of roughly 20 decks, so volume is not the binding constraint. Google cut free-tier quotas 50-80% in December 2025 without notice and does not guarantee them, so the existing "develop on free tier, architect for paid Tier 1" rule (§5a) stands. Open question for Prof. Singh: the free tier's training-data clause would apply to his unpublished course material during the offline generation batch, even though no student data ever reaches the LLM (questions are pre-generated before the pilot runs).

**Validation stage added 29 Jul 2026: `scripts/validate-questions.mjs` (commit `10fd55b`).** Generated questions must pass it before any database write. It exists because the first real generation run — one lecture deck through Gemini — produced output that looked good and was not usable as-is: three of fifteen questions cited slide 1, which contains only the deck title, and one asked about Amazon's mission statement, which does not appear in the deck at all — the model supplied its own knowledge and attributed it to the source. Separately, 8 of 15 correct answers sat at index 1 and none at index 3: a student always guessing B scores 53%, which is profitable under +20/−10 scoring while learning nothing, contaminating the measure the study depends on. The correct option was also frequently the longest and most detailed. And several questions referred to "the competitive landscape slide", "the team slide", "the examples provided" — unanswerable for a student who never sees the source.

The script rejects on self-containment, shape (mirroring the `questions` table), duplicate options, option-length imbalance, and slide provenance. It then shuffles the options and recomputes `answer`, seeded from a hash of the question prompt so the same input always yields the same output and a research run stays reproducible. Exit 0 all passed, 2 some rejected, 1 operational failure.

Two things learned by testing, not assumed: answer-position bias is fixed in code, not by prompting — instructing the model to vary the correct position was tried and not complied with reliably. And self-containment matching must be word-boundary, not substring — a `"the slide"` substring check misses `"the competitive landscape slide"`, which was the actual failing sentence, and words with innocent business meanings (`figure` as a number, `image` as in brand image) need qualifying, since bare matching rejected a valid question.

The `slide` field on each generated question is permanent, not a test artefact — it is how fabrication is detected, and it caught three cases on the first run.

**Pipeline shape as it stands:** source document → `inspect-source.mjs` routes it → LibreOffice renders to PDF if it is on the image path → Gemini generates questions → `validate-questions.mjs` rejects and repairs → database.

One aside from this session: the AI Studio playground demanded a paid API key, but a `GEMINI_API_KEY` already exists in `.env.local`. That was a playground gate, not an account restriction — the API path is not blocked.

**`/simplify` pass, 29 Jul 2026 (commits `08df8b1`, `7895e69`, `404f2cb`).** A whole-codebase quality pass removed 673 lines and added 102, roughly 16% of the codebase, with no capability lost.

The OCR heuristics in `scripts/inspect-source.mjs` were deleted, not tuned (`7895e69`). Four regexes had detected "OCR tells" to distinguish a clean text layer from a garbled scan. Two problems, both verified by running them: they misfire on the pilot's own subject matter — a real, clean, digitally-typeset business PDF tripped 2 of 4 tells, enough to meet the threshold, on the strings `IndianOil` (reads as run-together words) and `D2C` (reads as a digit fused into a word); `PowerPoint` and `B2B` do the same. A clean Digital Transformation PDF was being classified as a broken scan. And they never changed a routing outcome: low-quality text and sparse text both route to the image path, so the discrimination between them decided nothing. `spaceRatio < 0.12` and the caret/superscript check survive — both are honest signals, and the scanned maths book still routes to the image path through the caret check. `scripts/inspect-source.mjs` went from 750 to 560 lines. The maths-notation panel (printed, never read, a deferred feature) and the DOCX heading-walk and section table (fed a report that drove no decision) were also removed.

Five files were deleted as dead (`08df8b1`): `scripts/inspect-pdf.mjs` (superseded by its own behaviour-preserving superset, `scripts/inspect-source.mjs`), `GIT_SETUP.sh` (one-time bootstrap, already ran), `components.json` and `lib/utils.ts` (shadcn scaffolding — no `components/` directory, no caller of `cn()`), and `supabase/migrations/0001_events.sql`, which matters most: it defined a second, conflicting `events` table from the design the project pivoted away from on 27 Jul, with `not null` columns that would collide with the real one. Nothing in the repo referenced Supabase.

Consequence left in place rather than fixed unilaterally: `clsx` and `tailwind-merge` are now unused in `package.json`.

**Generation-path gap this exposed:** `scripts/generate-questions.mjs:79-81` has its own weaker inline validity check that clamps rather than rejects — `Number(q.answer) || 0` turns a null or NaN answer into index 0 and upserts it. When the generator is wired end to end, its output must pass through `scripts/validate-questions.mjs` instead.

**Same pass, research-dataset fix (`404f2cb`).** `round_stop` was emitted with two different shapes: `app/results/page.tsx` omitted `game_type` and re-derived the round number from session state, while `app/quiz/page.tsx` used its own. Each was correct at its own call site, and they agreed numerically only because of commit timing between the two screens — undocumented and fragile. Analysing the event required knowing which screen the student quit from, which was never recorded. The round number is now stamped onto `RoundSummary` when the round is committed, and both screens read it.

Remaining known issue, not fixed: an abandoned round reuses a round number. Quitting mid-quiz never increments `session.roundsPlayed`, so two distinct real attempts can share a `round` value in the event log.

## 4. The agreed product (from the 21 Jul call) — SUPERSEDED

⚠️ **SUPERSEDED by §3 (27 Jul pivot).** The design below is the original vision from the 21 Jul call. It is now parked. Refer to §3 for the current product definition.

**One-liner:** A gamified learning platform where an AI layer designs the gamification itself (quests, badges, point values) individually per student from their performance history, with a human-in-the-loop teacher approval layer.

Core mechanics agreed:

- **Anti-comfort-zone point economy:** points diminish for practicing areas the student is already strong in, and weak areas get more quests and higher rewards. This is the central design thesis, as opposed to traditional fixed, equal-weight gamification.
- **Two phases per student:** Phase 1 is an identical baseline for everyone (for example, the first N tasks). From Phase 2 onward, tasks and quests are AI-designed per individual.
- **Human-in-the-loop (HITL):** the AI proposes each quest with its reasoning, and the teacher approves, edits, or rejects it before delivery. The prof was most energized by this layer.
- **Teacher/admin dashboard:** a 360-degree view of each student (history, achievements, the AI's inferred strengths and weaknesses, and pending AI proposals), where the teacher can chat with the AI to redesign a quest.
- **Pilot use case:** his Digital Transformation course (about 20 sessions). The AI generates MCQs per session. Phase 1 is the same for all; later phases adapt. The system also doubles as a dynamic survey and data-collection instrument (satisfaction plus engagement), and that dataset is the raw material for the optional case-study paper.
- **Knowledge layer:** the book *Gamification for Dummies* (the prof will forward the PDF if it isn't findable online) plus his course content. This grounds what the AI knows about gamification design.

## 5. Tech stack (prof's suggestions 21 Jul plus decisions ratified 22 Jul; updated 28 Jul post-rebuild)

**What the prof suggested on the call:** a Firebase backend, Vercel hosting ⚠️ *(garbled in transcript, best-guess reconstruction, confirm)*, Google AI Studio (Gemini) free tier, and "free tier only until something works." Model choice was delegated to Sumeet with a mandatory "why this and not that" justification. ⚠️ Sumeet mentioned a Chinese model good for development, but the name didn't transcribe (likely DeepSeek or Qwen).

**Decisions after 22 Jul analysis (the deviations are deliberate and must be pitched to the prof as reliability plus student-data privacy, not as overruling him):**

### 5a. Runtime stack (what the deployed app uses)

- **LLM: Gemini paid Tier 1, NOT free tier.** As of mid-2026, the free tier is Flash/Flash-Lite only, roughly 5 to 15 RPM and about 1,000 to 1,500 RPD, and free-tier prompts may be used for Google training, which is unacceptable for classroom student data and guaranteed to collapse under simultaneous classroom load. Tier 1 is pay-per-use only (no upfront), about 150 to 300 RPM, with no training-data clause. Estimated pilot cost is $2 to 10/month (unverified, check live pricing). Pitch to the prof: "About ₹500-800 total buys production rate limits and keeps student data out of training pipelines."
- **Architecture rule, design out the rate limits:** MCQs are pre-generated from session PDFs and served from the database; no live LLM calls on the critical path. Every LLM call gets a queue, exponential backoff, and a response cache.
- **Provider abstraction:** all LLM calls go through a thin adapter (Vercel AI SDK style) so switching provider is a config change. The fallback chain is Gemini paid, then a retry, then an alternate provider. Data-governance rule: student-derived data must never fail over to Chinese-hosted endpoints (an IRB/consent risk). Open-model fallback only via US/EU-hosted providers (for example, OpenRouter pinned) or restricted to non-student-data calls (MCQ drafting from course material is fine; profiling a named student is not).
- **Database: Neon serverless Postgres (as of 28 Jul rebuild).** Event logs (session, round, per-question interactions, score, adaptivity feedback) are queryable in SQL and directly serve the DSR dataset. Schema in `db/schema.sql`. Previously planned Supabase; switched to Neon for simpler provisioning. Either would serve the deployment.
- **Front-end: Next.js 16 / React 19 / Tailwind v4** (v0 scaffolding, rebuilt 28 Jul). Router-based screens (dashboard, game-setup, quiz, results) use React Context (sessionStorage-backed) for game state persistence across nav.
- **Auth (added 28 Jul 2026, commit b569cc5; gate widened and lifetime stats added same day, commit 408bd54):** email+password login/signup, no new dependencies — `node:crypto` scrypt for password hashing and a stateless HMAC-SHA256 signed session cookie. New `students` table (opaque primary key, not the email) so `events.student_id` is populated from the session instead of always null. `proxy.ts` now denies by default: only `/login`, `/signup`, and the login/signup/logout API routes are public, everything else requires a valid session, pages redirect and API routes return 401. `GET /api/stats` aggregates lifetime totals (score, accuracy, sessions played) from `events` for the dashboard, counting rounds on distinct `(session_id, round)` pairs since round numbering restarts at 1 every session. Exercised end to end against a live Neon database.
- **Hosting: Vercel Hobby tier.** Fine for an academic pilot; no change.

### 5b. Dev tooling (what Sumeet codes with), decided via structured comparison 22 Jul

| Role | Tool | Notes |
|---|---|---|
| Primary builder (backend, AI layer, glue) | **Claude Code** (existing Claude Pro sub) | $0 marginal; this repo's CLAUDE.md targets it |
| Frontend scaffolding | **v0 free tier** | React/Tailwind UI generation, native Vercel deploy; generate dashboard/leaderboard/approval screens, then hand to Claude Code to wire up |
| Overflow agent + Gemini prompt debugging | **Antigravity** (free, Google) | Backup when Claude Code quota exhausts; same model family as runtime |
| Code review, 2nd opinion | **DeepSeek V4 (Flash routine / Pro hard bugs) via OpenRouter**; Qwen 3.6 free preview as $0 fallback | One OpenRouter key means model-switching freedom; ~$2-5/mo estimated |
| Code review, 3rd opinion (sparingly) | **Codex via existing API credits**, a mini-tier model, diffs only (`git diff \| codex exec "review"`), hard budget cap $10/mo | API-key auth bills every token with no subscription buffer; never use as builder, only as a bounded reviewer |
| **Cut** | Cursor (redundant $20/mo vs Claude Code), Emergent (demo-grade free tier, fights the fixed stack) | |

Weekly ritual: before each prof meeting, run the week's diff through DeepSeek (occasionally Codex-mini) for adversarial review; Claude Code triages the comments. This doubles as firsthand evidence for the "why this model and not that" justification doc.

⚠️ The model-landscape facts above (rankings, prices, quotas) date from web sources of Apr to Jul 2026 and change weekly, so re-verify against live pricing pages before writing them into any deliverable. The prof himself said whatever is current will be weeks old soon.

## 6. Working relationship and cadence

- **Next meeting: Monday 3 Aug 2026, afternoon.** ⚠️ **Corrected 30 Jul 2026 — see §12.** A re-read of
  the transcript found he is travelling Monday and proposed Tuesday same time instead: likely
  **Tue 4 Aug 2026**, treat as needing confirmation. Recurring weekly Mon/Tue slots.
- The prof is reachable by phone up to about 8 pm and on WhatsApp anytime for small things; he also said planning independently is "even better."
- **27 Jul meeting (completed):** Delivered architecture doc + model comparison. The prof pivoted the project (see §3).
- **Expectation for 3 Aug:** Implementation progress on the rebuild (§3), any blockers, next sprint plan.

## 7. Roadmap (proposed in-chat on 22 Jul; SUPERSEDED by 27 Jul pivot)

⚠️ **The roadmap below predates the 27 Jul pivot and is now moot.** It planned an AI-quest design architecture with HITL approval. The rebuild (28 Jul) implements the new adaptive-learning dashboard (§3) with a tighter, pre-coded mechanic. The new roadmap is TBD at the 3 Aug meeting.

| Weeks | Focus |
|---|---|
| **1** | Architecture doc + model comparison (the 27 Jul deliverable; see §7) |
| 2-3 | Knowledge layer (ingest *Gamification for Dummies* into a RAG/KB) + Phase-1 static skeleton: auth, one module, fixed quiz, hardcoded points/badges/leaderboard. No AI yet; prove the game loop |
| 4-5 | AI personalization layer: student-profile schema, a prompt pipeline emitting structured quest designs (JSON: quest, difficulty, point value, reasoning), and diminishing-returns point logic |
| 6-7 | HITL admin dashboard: student list, profile, AI proposals with reasoning, approve/reject/edit, chat-to-redesign |
| 8 | Content pipeline: MCQ generation per Digital Transformation session plus an instructor review queue |
| 9-10 | Pilot prep: seed data, dry run with classmates, and engagement/satisfaction logging built in now (the paper dataset) |
| Sept+ | Classroom pilot aligned with his gamification course; iterate; optional case-study write-up |

## 8. Week-1 deliverable (completed Mon 27 Jul; now superseded)

A 3-to-5 page/slide document containing:

1. A **layered architecture diagram** with labeled data flows: Frontend (Vercel), Firebase, the AI layer (quest designer, MCQ generator, student profiler), the knowledge layer, and the Admin/HITL layer.
2. A **model comparison table plus pick plus rationale:** 3 to 4 candidates (Gemini via AI Studio free tier; DeepSeek/Qwen; Claude/GPT) scored on free-tier limits, structured-output reliability, reasoning quality for quest design, latency, and cost at pilot scale. Verify current free-tier quotas; they change frequently.
3. A **data model draft:** student profile, skill/topic taxonomy, quest object, point-transaction log, and approval-workflow states.
4. A **Phase-1 vs Phase-2 definition** plus the switching trigger.
5. **2 to 3 open questions for the prof** (for example, skill-taxonomy granularity for his course, and whether approval blocks delivery or runs async).

Also this week: obtain *Gamification for Dummies* (nudge the prof by **Wed 23 Jul** if not found); skim the project PDFs for the standard gamification element taxonomy.

## 9. Theory and literature context (for the eventual paper)

- **Novelty claim (verified by live search, ~5 searches, not a systematic review):** LLM-as-orchestrator/designer of gamification mechanics per user, with HITL, is an open corner. LLM-as-content-generator and static-typology tailoring (Hexad, etc.) are crowded. A proper Scopus/WoS pass is still owed before claiming the gap in writing.
- **Prof's papers on hand (project PDFs):** Singh & Dev 2023 AJIS (ICT interventions, relatedness, engagement; moderated mediation non-significant; intellectual engagement null); Singh & Verma 2020 ACIS (gamification taxonomy/theory); Singh & Singh 2021 ACIS (gamification in hybrid teacher PD, SDT plus goal theories); the MCDM chatbot-ranking paper (Delphi + CRITIC + WASPAS/EDAS); the mandatory-telework paper; Klock et al. 2020 IJHCS (tailored gamification); Alioto & Persico (corporate training gamification). Note: several PDFs are scanned/image-based, so text was extracted via OCR; verify any quoted passage against the source.
- **Likely paper framing:** a Design Science Research case study (artifact plus classroom deployment plus engagement/satisfaction data). Ethics topics to raise before the pilot: consent/voluntariness for interaction telemetry, the IRB/institutional review timeline, and scale reuse from the AJIS paper.

## 10. Open items and risks (updated 29 Jul)

- [ ] **Next build: the question-generation pipeline** (design decisions recorded 28-29 Jul 2026 in §3a, source diagnostic built in `fa38a2a`/`a75a79c`, format adapters not yet built). LibreOffice is a prerequisite for the ingestion design and was installed and verified on the dev machine on 29 Jul 2026 (`--convert-to pdf` confirmed working on a real deck); any other build machine still needs it.
- [ ] `db/002_add_question_format.sql` is written but **not applied** to Neon — `psql` is not installed on this machine, so it must be pasted into the Neon web SQL editor by hand.
- [ ] `db/001_add_students.sql` (~line 60) has an unscoped `pg_constraint` existence guard: it matches by `conname` alone, which Postgres only guarantees unique per table, not database-wide. Deliberately left as is since it is already applied to the live database; would only bite in a fresh environment.
- [x] **Resolved 28 Jul 2026 (commit b569cc5):** anonymous event log. `events.student_id` was always null under the mockup login/signup UI, which made per-student analysis impossible. Real authentication now populates it from the session cookie.
- [x] **Resolved 28 Jul 2026 (commit 408bd54):** the dashboard itself was unauthenticated. `proxy.ts` only gated `/quiz`, `/game-setup`, and `/results`, so an unauthenticated visitor landed on the dashboard and could reach the game. Now deny-by-default, and both fixes have been exercised end to end against a live Neon database: schema applied, real accounts created, real gameplay recorded.
- [ ] New residual risk: shared devices. A student who does not log out on a shared classroom laptop leaves the session live for whoever uses it next; nothing currently forces logout.
- [ ] New residual risk: the signup form has a cosmetic terms-of-service checkbox sitting next to the real, server-enforced research-consent checkbox. The two could be confused; needs a UI fix before the pilot.
- [ ] Model-assigned difficulty is uncalibrated, and the adaptive-difficulty lever depends on it entirely. If an item labelled difficulty 4 is not actually harder than one labelled 2, the study's primary independent variable is noise. Needs each item's empirical p-value from `events` compared against its assigned label, ideally via a small pilot-of-the-pilot before the real cohort, since recalibrating mid-pilot would change what the difficulty scale means partway through the dataset.
- [ ] Adaptive difficulty saturates at the ceiling by roughly question four (starts at 2, caps at 5, resets every round), so a strong student stops being differentiated by the lever for most of a round. Needs a decision: raise the starting difficulty, widen the scale, or carry difficulty across rounds within a session.
- [ ] Confirm hosting is Vercel and identify the "Chinese model" (the transcript garbled both).
- [ ] Get the *Gamification for Dummies* PDF.
- [ ] Pitch Gemini paid Tier 1 to the prof (privacy plus reliability framing, about ₹500-800/pilot); verify live Tier 1 pricing and rate limits first.
- [ ] Decide Supabase vs Firebase within week 1 (before the data model is coded); default lean is Supabase.
- [ ] Set the Codex hard budget cap ($10/mo) in the OpenAI dashboard and create the OpenRouter key.
- [ ] Skill-taxonomy granularity for the Digital Transformation course; ask the prof.
- [ ] Ethics/IRB requirement and timeline for classroom data collection; ask the prof before the pilot, not after.
- [ ] Scope-creep risk: build one artifact (platform plus AI designer plus HITL) and resist adding orchestration extras. The hour budget is ~400-450 total.
- [ ] The Scopus/WoS systematic search is still pending if the paper goes ahead.

## 11. File inventory (as of 29 Jul 2026; `git ls-files` reconciled)

**Orchestration (tracked as of df8fe57):**
- `.claude/agents/` — scout, builder, reviewer, codex-review, gemini-bulk, db-engineer, scribe, researcher.
- `.claude/commands/checkpoint.md`, `.claude/commands/resume.md` — session lifecycle commands. Other `.claude/` contents (personal settings, third-party skills) stay untracked.

**Architecture and docs:**
- `CLAUDE.md` — working brief (updated 28 Jul).
- `HANDOFF.md` — this file.
- `docs/architecture/2026-07-27_architecture-and-model-comparison.md` — pre-pivot deliverable (27 Jul); superseded by the post-pivot notes below.
- `docs/architecture/2026-07-28_architecture-as-built.md` — post-pivot architecture, written after the rebuild.
- `docs/architecture/data-layer.md` — event-log and schema design notes (data-layer review that flagged the null `student_id` gap, since resolved by b569cc5; corrected 408bd54 to state `events.round` is 1-based, not 0-based).
- `docs/architecture/roadmap-and-flow.md` — pre-pivot; superseded.
- `docs/architecture/agent-orchestration.md` — orchestration rules (28 Jul).
- `docs/design/v0-dashboard-brief.md` — v0 scaffolding brief.
- `docs/design/user-journey.md` — user-journey notes.
- `docs/meeting/Jul 27 at 3-39 PM.m4a` — supervisor call audio (27 Jul pivot).
- `docs/meeting/Jul 27 at 3-39 PM.txt` — call transcript.
- `docs/meeting/2026-07-27_supervisor-briefing.md` — pre-pivot briefing.
- `docs/CURRENT_STATE.md` — written by `/checkpoint`; hand-maintained, not edited by scribe passes.
- `docs/PROJECT_MAP.md` — new 30 Jul 2026, the project spine (decomposition, work packages, decided vs
  assumed); replaces the since-deleted `docs/PROJECT_BACKLOG.md`.
- `docs/architecture/generator-spec.md` — new 30 Jul 2026, per-window generator spec; also carries the
  LibreOffice-removal rationale.
- `docs/consult-brief.md` — new 30 Jul 2026, standing context handed to `sol-consult`; contains no
  solutions by design.
- `docs/consults/2026-07-30-content-layer-and-difficulty.md` — new 30 Jul 2026, full `sol-consult`
  transcript (see §12).
- `.claude/agents/sol-consult.md` — new 30 Jul 2026, the two-pass GPT-5.6 Sol consultation agent.
- `tests/lever.test.ts` — new 30 Jul 2026, the project's first automated tests (§12).

**Application code (Next 16 / React 19 / Tailwind v4):**
- `app/page.tsx` — dashboard (entry point).
- `app/game-setup/page.tsx` — quest selection and adaptivity-lever picker.
- `app/quiz/page.tsx` — main game loop (questions, scoring, adaptivity feedback).
- `app/results/page.tsx` — round results and persistence prompt.
- `app/login/page.tsx`, `app/signup/page.tsx` — auth UI, wired to real endpoints as of b569cc5 (previously scaffolded only).
- `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts` — auth endpoints (added 28 Jul, commit b569cc5).
- `app/api/events/route.ts` — event logging API; `student_id` now read from the session cookie, not the request body.
- `app/api/questions/route.ts` — MCQ serving API (DB pool + seed-bank fallback).
- `app/api/stats/route.ts` — new (commit 408bd54); aggregates lifetime totals (score, accuracy, sessions played) from `events` for the cookie-identified student.
- `app/layout.tsx`, `app/globals.css` — layout and base styles.
- `proxy.ts` — Next 16's successor to `middleware.ts`; deny-by-default as of commit 408bd54 — only `/login`, `/signup`, and the login/signup/logout API routes are public, everything else requires a valid session. Previously only gated `/quiz`, `/game-setup`, `/results` (added b569cc5).

**Game engine, state, and auth:**
- `lib/game/engine.ts` — core game logic (scoring, adaptivity ramp/clock, round progression). Gained
  `LeverState`, `initialLeverState`, `resolveLever`, `advanceLeverState` 30 Jul 2026 (package K-4,
  additive, ~36 lines; see §12) — the structural fix so games never branch on `config.lever`.
- `lib/game/game-context.tsx` — React Context for game state (survives route nav via sessionStorage).
- `lib/game/questions.ts` — question data fetch and normalization.
- `lib/log/logEvent.ts` — event logging to `/api/events` (or console if DB unavailable).
- `lib/db/client.ts` — Neon Postgres client.
- `lib/auth/password.ts` — scrypt hashing and `timingSafeEqual` verification (added b569cc5).
- `lib/auth/session.ts` — HMAC-SHA256 signed session cookie, `resetSession()` (added b569cc5).
- `lib/auth/current-student.ts` — reads the authenticated student id from the session cookie server-side (added b569cc5).
- `lib/utils.ts` — utility functions.

**Database and config:**
- `db/schema.sql` — Neon Postgres schema (questions, events tables).
- `db/001_add_students.sql` — adds the `students` table and the `events.student_id` FK; establishes the `NNN_short_name.sql` migration convention (added b569cc5). Applied to the live Neon database as of the 408bd54 end-to-end run — 3 tables, foreign key `events_student_id_fkey` present.
- `.env.local.example` — environment variable template (Neon credentials, Gemini key, `SESSION_SECRET`); restored in b569cc5 after being lost in a move rather than a copy.
- `.gitignore` — new (commit 408bd54); tracked so a stray Windows reserved-device-name file (`nul`/`NUL`, produced by a `> nul` redirect in Git Bash) stays out of the index.
- `skills-lock.json` — new (commit 408bd54); lockfile pinning the `neon` and `neon-postgres` agent skills (source `neondatabase/agent-skills`) used during the Neon setup and end-to-end run.
- `package.json`, `package-lock.json` — Next 16 / React 19 / Tailwind v4 dependencies; unchanged by the auth or gating work (no new dependencies). `clsx` and `tailwind-merge` are unused as of the 29 Jul `/simplify` pass, left in place rather than removed unilaterally. Gained a `"test": "node --test tests/*.test.ts"` script 30 Jul 2026 — no new dependency, Node's native test runner.
- `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs` — build config. `tsconfig.json` gained `allowImportingTsExtensions: true` 30 Jul 2026 so `next build` does not fail on `tests/` (its glob includes `**/*.ts`).
- `README.md` — project readme.

**Content generation:**
- `scripts/generate-questions.mjs` — Gemini-powered MCQ generator from course PDFs (reads `COURSE_PDFS` env, outputs to `db/schema.sql` seed or API). Its inline validity check (lines 79-81) clamps rather than rejects a bad answer index; see §3a, generation-path gap.
- `scripts/inspect-source.mjs` — the permanent mandatory routing gate for the pipeline (commit `a75a79c`; OCR heuristics removed 29 Jul, commit `7895e69`, see §3a). Design decisions for the rest of the pipeline are in §3a; not yet built beyond this script.
- `scripts/validate-questions.mjs` — rejects generated questions that break pipeline rules (commit `10fd55b`); see §3a.

**Literature (refs for the paper):**
- `docs/literature/` — 16 research PDFs and a README index (Gamification for Dummies-adjacent, SDT, HEXAD, MDA framework, aging/gamification, MBTI/personality, McKinsey job satisfaction, pymetrics, etc.). See `docs/literature/README.md` for full list.

**Call transcripts:**
- `transcript_2026-07-21_prof_call.txt` — 21 Jul supervisor call (problem statement + initial vision).

**Historical (pre-pivot, retained for reference):**
- `docs/venture-analysis/` — Sumeet's earlier venture-analysis scaffolding exercise on the project (7 prompts, pitch deck, 19-22 Jul). Archived for reference; not the current direction.
- Git history up to commit e0b3fd9 preserves the old reward-engine, student-profiler, and Supabase-based code.

## 12. Transcript re-read, project map, first tests, sol-consult (30 Jul 2026)

**Nature of this session: planning and decision-making, not feature building.** The 27 Jul meeting
transcript (`docs/meeting/Jul 27 at 3-39 PM.txt`) was re-read as a primary source, against the standing
rule that summaries are lossy. Five places were found where `CLAUDE.md` had drifted from what the
professor actually said. Three change the build; full detail, quotes, and rationale live in the new
`docs/PROJECT_MAP.md` §0, which is now the project spine for decomposition and work packages. This
section records the outcome, not the derivation — read `docs/PROJECT_MAP.md` for that.

**The five corrections** (all applied to `CLAUDE.md` this session):
1. Points are fixed *within* a game, not flat +20/−10 everywhere. They vary *across* games and
   difficulty — that spread is the "high and low" feeling the professor described, and the old flat
   reading deleted the mechanic he actually asked for.
2. The dashboard is the spine and the quiz is one tile in it. This was his first instruction on the
   27 Jul call and remains the least-built part of the app — there is still no `app/dashboard/`.
3. Course material is not a build prerequisite. He said to use any PDF on any topic; his own content
   blocks the *pilot*, not the *build*.
4. Next meeting is likely **Tue 4 Aug 2026**, not Monday — he said he is travelling Monday. Needs
   confirmation, not yet locked.
5. LibreOffice is out of the ingestion pipeline (see below) — its only job was PPTX→PDF, and
   professors export their own PDFs from PowerPoint.

**Multi-game architecture.** The professor named eight games on the call: crossword, word search,
match-the-following, fill-in-the-blanks, choose-the-right-word, quiz (rapid/normal), and
watch-video/read-article-then-answer. Building seven generation pipelines is not tractable in the
remaining budget; the design instead reduces them to renderers over a small set of content
primitives (`term_definition`, `mcq`, `passage`) so one ingestion pass serves several games. **Pilot
roster, decided 30 Jul: quiz, match-the-following, fill-in-the-blanks, choose-the-right-word,
Wordle.** Crossword and word search are deferred past the pilot — grid layout is the most expensive
remaining work in the project, not a rejection of those games. Full primitive table and generation
notes in `docs/PROJECT_MAP.md` §1.

**Per-game lever semantics and `resolveLever`.** Decided **per-game granularity (option b)**: each
game declares one difficulty knob and one time knob and whether adaptation can fire per-item or only
between boards (e.g. match-the-following adapts per board, quiz per item). The chosen call is to
maximise measurable engagement surface over defending one tidy construct for the paper. The
mutual-exclusion rule ("never both levers") now has a structural fix rather than a convention: package
K-4 added `resolveLever(config, streak) → { difficulty, timeLimit }` to `lib/game/engine.ts`
(`LeverState`, `initialLeverState`, `resolveLever`, `advanceLeverState`, additive, ~36 lines). Games
consume the two resolved values and never branch on `config.lever` themselves, so a both-levers
student collapses from ~25 scattered branches into one tested function — not literally
unrepresentable, since the return type does not forbid both varying, but centralised and covered by
tests (overstatement conceded to `sol-consult`, 30 Jul). Verified the existing quiz already
respected the rule in four places before this landed (`engine.ts:10`; `app/quiz/page.tsx:100,133,112`).
Also decided: **rapid means fewer questions (10 vs 20), not a faster clock** — a tighter clock under
rapid would collide with the difficulty lever for a difficulty-lever student. `roundLength()` already
implements this; confirm the word "rapid" with the professor regardless, since he used it and the
transcript is ambiguous.

**Platform direction: live ingestion, subject-agnostic, PDF input.** The target is not a
Digital-Transformation-only tool — any professor uploads material and gets every game type generated
from it, matching what he described on the call. Ingestion stays live (background job on upload);
generation never runs on the student's critical path, unchanged from the existing rule. **Input is
PDF; LibreOffice is removed from the pipeline** — professors export their own PDFs from PowerPoint, and
its only prior job (PPTX→PDF) is now redundant. Full rationale in `docs/architecture/generator-spec.md`.
This also deletes the page-count-vs-slide-count guard the old pipeline needed. **Multi-tenant schema
now, single-tenant operator surface after the pilot:** a `sources` table and a subject/course id on
`content_items` are built from day one because reversing that later is expensive, but upload UI, job
queue, and faculty login are deliberately deferred — the professor himself deferred courses and
faculty login ("we are not building a portal, it's just for experimentation").

**First automated tests.** `tests/lever.test.ts` is the first automated test this project has had.
`npm test` (added to `package.json`: `node --test tests/*.test.ts`) passes 4/4, covering the two
lever-resolution invariants (20 answers under `adaptive` never move `timeLimit`; 20 answers under
`time` never move `difficulty`). `tsconfig.json` gained `allowImportingTsExtensions: true` so
`next build` does not choke on `tests/`. Deliberately no vitest or jest — Node's native `--test` runner
with TypeScript stripping is enough for a 400ms suite. `node --test tests/` (no glob) fails on this
Node version (24.11.1 resolves `tests/` as a module name); the working form is
`node --test tests/*.test.ts`, already in `package.json`.

**`sol-consult` (new agent) and its three reversals.** A two-pass GPT-5.6 Sol consultation
(blank-slate pass, then critique-our-plan pass, each a fresh `codex exec` session; full text at
`docs/consults/2026-07-30-content-layer-and-difficulty.md`) reversed three design decisions taken
earlier in the same session:
1. **Cognitive level is a generation control, not a difficulty scale.** The plan had proposed a
   five-level taxonomy (recall/apply/discriminate/deduce/transfer) as a difficulty replacement. Sol's
   objection holds: a recall question about an obscure fact can be harder than an "apply" question
   with an obvious answer, so numbering the levels 1–5 and calling that difficulty just renames the
   problem. The surviving half: asking a generator for a named cognitive level is a structural
   instruction it can actually follow, which fixes the real defect (every generated question on 29 Jul
   was recall, so there was no variance to discriminate). Cognitive level and empirical difficulty are
   now two separate columns; difficulty comes from observed facility only.
2. **Calibrate generation recipes, not individual items.** A recipe (knowledge unit × task type × cue
   strength) pools responses across every item sharing it, so an estimate is usable far sooner than
   waiting for per-item data, and a new item inherits its family's prior.
3. **Wordle is an intervention, not a neutral retention instrument.** Daily gating, streak loss, and no
   catch-up are designed to drive return behaviour, so using Wordle's return data as evidence of the
   artifact's persistence claim would measure the mechanic acting on the student rather than the
   student's own behaviour. Wordle stays in scope — it is a genuine daily-engagement signal over four
   weeks that nothing else in the design captures — but its data is now analysed as a **separate
   treatment**, never folded into the primary voluntary-persistence claim (which rests on the
   within-session round loop).

A fourth Sol finding was reviewed and **rejected**: his proposed three-layer knowledge-unit
architecture, in favour of enriching the existing `term_definition` primitive with the missing fields
(blank position and answer variants for fill-in-the-blanks; distractors for choose-the-right-word;
normalised form and length bounds for word search) and dropping `passage`, which no pilot game
consumes. Rejected because it repeats this project's documented failure mode of over-building past
the point of a routing/behaviour change — the same story as the OCR-heuristics removal on 29 Jul. This
decision was interrupted, not completed: the enriched column list still needs to be written into
`docs/PROJECT_MAP.md` §3 under K-1 before `db-engineer` and `builder` can be dispatched.

**Not committed.** Everything in this section exists on disk (`lib/game/engine.ts`, `tests/`,
`package.json`, `tsconfig.json`, `docs/PROJECT_MAP.md`, `docs/consult-brief.md`,
`docs/consults/2026-07-30-content-layer-and-difficulty.md`, `.claude/agents/sol-consult.md`) but is
uncommitted as of this session. Last commit remains `bd123b3`. `docs/PROJECT_BACKLOG.md` was created
and then deleted this session; `docs/PROJECT_MAP.md` replaces it — do not recreate it.

Full open-questions list, the package table for parallel sessions, and the points-table placeholder
values all live in `docs/PROJECT_MAP.md` — not duplicated here to avoid a second copy drifting out of
sync.

## 13. Cold-start item-difficulty calibration (30 Jul 2026, second checkpoint)

**The problem.** §10 already flagged that the model-asserted 1–5 difficulty labels do not discriminate
and the adaptive-difficulty lever depends entirely on them. Classical pre-calibration (test the item on
a cohort first, fit an IRT model) needs a cohort. **There is none** — no pilot-of-the-pilot, no prior
class to draw on. This is a named, active research problem, cold-start item calibration, researched and
written up with citations in `docs/literature/item-difficulty-without-students.md`; full detail there,
not repeated here.

**Two solution families, and why only one is in scope now.**
1. **LLM student simulation (in scope, seeding).** Do not ask a model how hard an item is — prompt it
   to role-play a student at a stated ability tier, have it *attempt* the item, and take the failure
   rate across a spread of ability tiers as the difficulty estimate. Published results correlate
   r = 0.75–0.82 against real IRT difficulty on maths MCQs (631-item NAEP set); our domain is management
   prose, untested, so treat that as an optimistic ceiling. The counterintuitive finding that decided our
   model choice: **weaker models simulate better** — Gemma 9B–27B beat Llama-3.3-70B, which answered 92%
   of items correctly but could not convincingly fail.
2. **Elo rating (deferred, online refinement).** Treat each answer as a student-vs-item match; ratings
   update after every response, so a new item needs no prior difficulty. **Deferred because it needs
   real responses and a server-authoritative answer path, neither of which exists yet** (`/api/questions`
   still ships `answer` for all rows; `/api/events` trusts the client). It is also deferred at the
   *item* level specifically: our expected volume is ~20 responses per item, far short of the 200–500
   Elo needs to converge, so **when Elo lands it will rate recipes (knowledge-unit × task-type ×
   cue-strength), not individual items** — 10–20 recipes each pooling 400–800 responses, inside the
   convergence range. Naive Elo combined with adaptive item selection also has a known failure mode
   (Bolsinova et al. 2026): selection and rating error reinforce each other and variance diverges rather
   than converges. The documented fix, Parallel Elo (two independent rating chains, alternating which
   one updates vs which one is used to select), is noted for when this is built, not built now.

**Decisions made this session:**
- Difficulty is seeded by LLM student simulation, not asserted by a model.
- Simulation runs on a **small local model via Ollama**, not a hosted one — reproducibility (a hosted
  model can change mid-pilot and silently shift calibration), course material never leaves the machine,
  and weaker models simulate better, so small-and-local is methodologically correct, not a cost
  compromise. `gemma4:31b-cloud` in `ollama list` is a cloud model despite its name and must not be used.
- The continuous simulated score is **binned into the existing 1–5 integer column**, by quintiles over
  the run's observed distribution (not fixed thresholds, which would collapse into one or two bands on
  uniformly easy or hard material). This was chosen over rewriting difficulty as a continuous field
  because ~11 sites already assume difficulty is a small int (`pickQuestion`'s radius algorithm, the
  lever constants, the badge, the tests), and the student-facing display only ever needed five bands.
- The raw score is stored in a new `content_items.simulated_p`, kept strictly separate from
  `empirical_p` (reserved for observed human facility) — simulated must never masquerade as observed.

**Phase 0 spike — read this precisely, the headline is narrower than the pass/fail suggests.**
`scripts/spike-simulate-difficulty.mjs` ran 15 real generated questions through `llama3.2` (~3B, 2 GB)
at n=4 per question, concurrency 4, options shuffled per call so the generator's known index-0 bias
could not inflate the result.

- **It passed its stated kill criterion.** Success rates spread the full range, min 0.00, mean 0.47,
  max 1.00, no clustering — the feared failure mode (every item scoring near-identically) did not
  happen. Zero unparseable replies. 2.1 s per response.
- **It did not validate that the method measures difficulty.** The simulated students never saw the
  source deck, so what actually got measured is *how much a question depends on the source material*.
  Four of fifteen items scored 100%, and all four are answerable from general knowledge with zero deck
  content (pitch deck purpose, Amazon's purpose, price matters to travellers, search→review→book). A
  real student attended the session and has seen the material; the spike's simulated student has not.
- **n=4 allows only five possible per-question values.** Directional only, no claim about magnitude.
- **The grounded method — simulating with the source excerpt supplied, the actual proposal — has not
  been run.** That comparison, grounded vs ungrounded on the same 15 items, is the next step and the
  real validation.
- **Free bonus finding:** the ungrounded run is a good question-quality detector on its own. An item
  answerable at ~100% without the source teaches nothing and rewards general knowledge, the same defect
  class as answer-position bias. It flagged the same 4 of 15 items. Worth adding to
  `scripts/validate-questions.mjs` as a gate, independent of whether the grounded difficulty method pans
  out.

**Consequence: `content_items` needs a new `source_excerpt` column.** Two independent needs converged
on it in the same session: grounded difficulty simulation needs to hand the simulated student the actual
material (with ability tier controlling how well they use it, otherwise the spike's source-dependence
problem repeats); and separately, `sol-consult` (§12) had already flagged that the generator's page-loop
proves which window was *prompted*, not that the answer is *supported* by it, and wanted an evidence
span checked against extracted text. `db/005_add_simulated_difficulty.sql` (not yet written) should
carry `simulated_p`, `simulated_n`, `simulator_model`, and `source_excerpt` together, and the generator
(package G1) must start storing the text it actually used.

**Not committed.** `docs/literature/item-difficulty-without-students.md` and
`scripts/spike-simulate-difficulty.mjs` (throwaway, produced the spike numbers above) are both
uncommitted as of this session; `docs/CURRENT_STATE.md` has the working-tree detail. Last commit
remains `559dd40`.
