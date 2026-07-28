# HANDOFF: Gamified Adaptive Learning Platform (FBT Research Project)

**Prepared:** 22 Jul 2026. **Updated:** 28 Jul 2026 (post-pivot rebuild; authentication wired same day, commit b569cc5). Original text consolidates 3 Claude.ai conversations (19-22 Jul 2026), the transcribed 21-minute supervisor call of 21 Jul 2026, and 8 project reference papers. The 27 Jul supervisor call pivoted the project; the 28 Jul 2026 rebuild (commit e0b3fd9) implemented the pivot, and a same-day follow-up (commit b569cc5) wired real authentication. This doc now records both the original vision (history) and the current state.

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

**Status, stated plainly:** reviewed, type-checked, and building, but not yet exercised against a live database or a real browser session. `db/001_add_students.sql` has not been applied to Neon yet.

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
- **Auth (added 28 Jul 2026, commit b569cc5):** email+password login/signup, no new dependencies — `node:crypto` scrypt for password hashing and a stateless HMAC-SHA256 signed session cookie. New `students` table (opaque primary key, not the email) so `events.student_id` is populated from the session instead of always null. `proxy.ts` gates `/quiz`, `/game-setup`, `/results`. Reviewed and type-checked; not yet tested against a live database or a real browser session.
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

## 10. Open items and risks (updated 28 Jul, post-auth)

- [x] **Resolved 28 Jul 2026 (commit b569cc5):** anonymous event log. `events.student_id` was always null under the mockup login/signup UI, which made per-student analysis impossible. Real authentication now populates it from the session cookie. Still not verified against a live database.
- [ ] New residual risk: shared devices. A student who does not log out on a shared classroom laptop leaves the session live for whoever uses it next; nothing currently forces logout.
- [ ] New residual risk: the signup form has a cosmetic terms-of-service checkbox sitting next to the real, server-enforced research-consent checkbox. The two could be confused; needs a UI fix before the pilot.
- [ ] Confirm hosting is Vercel and identify the "Chinese model" (the transcript garbled both).
- [ ] Get the *Gamification for Dummies* PDF.
- [ ] Pitch Gemini paid Tier 1 to the prof (privacy plus reliability framing, about ₹500-800/pilot); verify live Tier 1 pricing and rate limits first.
- [ ] Decide Supabase vs Firebase within week 1 (before the data model is coded); default lean is Supabase.
- [ ] Set the Codex hard budget cap ($10/mo) in the OpenAI dashboard and create the OpenRouter key.
- [ ] Skill-taxonomy granularity for the Digital Transformation course; ask the prof.
- [ ] Ethics/IRB requirement and timeline for classroom data collection; ask the prof before the pilot, not after.
- [ ] Scope-creep risk: build one artifact (platform plus AI designer plus HITL) and resist adding orchestration extras. The hour budget is ~400-450 total.
- [ ] The Scopus/WoS systematic search is still pending if the paper goes ahead.

## 11. File inventory (as of 28 Jul 2026, commit b569cc5; `git ls-files` reconciled)

**Orchestration (tracked as of df8fe57):**
- `.claude/agents/` — scout, builder, reviewer, codex-review, gemini-bulk, db-engineer, scribe, researcher.
- `.claude/commands/checkpoint.md`, `.claude/commands/resume.md` — session lifecycle commands. Other `.claude/` contents (personal settings, third-party skills) stay untracked.

**Architecture and docs:**
- `CLAUDE.md` — working brief (updated 28 Jul).
- `HANDOFF.md` — this file.
- `docs/architecture/2026-07-27_architecture-and-model-comparison.md` — pre-pivot deliverable (27 Jul); superseded by the post-pivot notes below.
- `docs/architecture/2026-07-28_architecture-as-built.md` — post-pivot architecture, written after the rebuild.
- `docs/architecture/data-layer.md` — event-log and schema design notes (data-layer review that flagged the null `student_id` gap, since resolved by b569cc5).
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
- `app/layout.tsx`, `app/globals.css` — layout and base styles.
- `proxy.ts` — Next 16's successor to `middleware.ts`; gates `/quiz`, `/game-setup`, `/results` behind a valid session (added b569cc5).

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
- `db/001_add_students.sql` — adds the `students` table and the `events.student_id` FK; establishes the `NNN_short_name.sql` migration convention (added b569cc5, not yet applied to Neon).
- `.env.local.example` — environment variable template (Neon credentials, Gemini key, `SESSION_SECRET`); restored in b569cc5 after being lost in a move rather than a copy.
- `package.json`, `package-lock.json` — Next 16 / React 19 / Tailwind v4 dependencies; unchanged by the auth work (no new dependencies).
- `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs` — build config.
- `components.json` — shadcn/ui config (for future component scaffolds).
- `GIT_SETUP.sh` — repo setup script.
- `README.md` — project readme.

**Content generation:**
- `scripts/generate-questions.mjs` — Gemini-powered MCQ generator from course PDFs (reads `COURSE_PDFS` env, outputs to `db/schema.sql` seed or API).

**Callouts:**
- `supabase/migrations/0001_events.sql` — legacy Supabase migration (pre-pivot; Neon schema is in `db/schema.sql`).

**Literature (refs for the paper):**
- `docs/literature/` — 16 research PDFs and a README index (Gamification for Dummies-adjacent, SDT, HEXAD, MDA framework, aging/gamification, MBTI/personality, McKinsey job satisfaction, pymetrics, etc.). See `docs/literature/README.md` for full list.

**Call transcripts:**
- `transcript_2026-07-21_prof_call.txt` — 21 Jul supervisor call (problem statement + initial vision).

**Historical (pre-pivot, retained for reference):**
- `docs/venture-analysis/` — Sumeet's earlier venture-analysis scaffolding exercise on the project (7 prompts, pitch deck, 19-22 Jul). Archived for reference; not the current direction.
- Git history up to commit e0b3fd9 preserves the old reward-engine, student-profiler, and Supabase-based code.
