# HANDOFF: Gamified Adaptive Learning Platform (FBT Research Project)

**Prepared:** 22 Jul 2026. **Updated:** 29 Jul 2026 (question-generation pipeline design decisions, 28-29 Jul, plus the source-diagnostic build, a LibreOffice rationale correction, and a codex-steering correction, all recorded same day; see §3a). Previous update: 28 Jul 2026 (post-pivot rebuild; authentication wired same day, commit b569cc5; app gated end to end and lifetime stats added same day, commit 408bd54). Original text consolidates 3 Claude.ai conversations (19-22 Jul 2026), the transcribed 21-minute supervisor call of 21 Jul 2026, and 8 project reference papers. The 27 Jul supervisor call pivoted the project; the 28 Jul 2026 rebuild (commit e0b3fd9) implemented the pivot, a same-day follow-up (commit b569cc5) wired real authentication, and a further same-day commit (408bd54) closed the login gate and wired lifetime stats. All three commits are pushed to `origin/main`. This doc now records both the original vision (history) and the current state.

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

The pipeline itself does not exist yet. `scripts/inspect-pdf.mjs` (committed in `fa38a2a`) is the first piece of it. Everything below is a design decision taken during the 28-29 Jul 2026 planning work, recorded before any of the rest is built.

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

- **Next meeting: Monday 3 Aug 2026, afternoon.** Recurring weekly Mon/Tue slots.
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
- `lib/game/engine.ts` — core game logic (scoring, adaptivity ramp/clock, round progression).
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
- `package.json`, `package-lock.json` — Next 16 / React 19 / Tailwind v4 dependencies; unchanged by the auth or gating work (no new dependencies).
- `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs` — build config.
- `components.json` — shadcn/ui config (for future component scaffolds).
- `GIT_SETUP.sh` — repo setup script.
- `README.md` — project readme.

**Content generation:**
- `scripts/generate-questions.mjs` — Gemini-powered MCQ generator from course PDFs (reads `COURSE_PDFS` env, outputs to `db/schema.sql` seed or API).
- `scripts/inspect-pdf.mjs` — first piece of the question-generation pipeline (commit `fa38a2a`); checks a source PDF for OCR quality/text density before it enters the pipeline. Design decisions for the rest of the pipeline are in §3a; not yet built beyond this script.

**Callouts:**
- `supabase/migrations/0001_events.sql` — legacy Supabase migration (pre-pivot; Neon schema is in `db/schema.sql`).

**Literature (refs for the paper):**
- `docs/literature/` — 16 research PDFs and a README index (Gamification for Dummies-adjacent, SDT, HEXAD, MDA framework, aging/gamification, MBTI/personality, McKinsey job satisfaction, pymetrics, etc.). See `docs/literature/README.md` for full list.

**Call transcripts:**
- `transcript_2026-07-21_prof_call.txt` — 21 Jul supervisor call (problem statement + initial vision).

**Historical (pre-pivot, retained for reference):**
- `docs/venture-analysis/` — Sumeet's earlier venture-analysis scaffolding exercise on the project (7 prompts, pitch deck, 19-22 Jul). Archived for reference; not the current direction.
- Git history up to commit e0b3fd9 preserves the old reward-engine, student-profiler, and Supabase-based code.
