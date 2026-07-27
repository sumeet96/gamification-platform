# HANDOFF: AI-Personalized Gamification Platform (FBT Research Project)

**Prepared:** 22 Jul 2026. Consolidates 3 Claude.ai conversations (19-22 Jul 2026), the transcribed 21-minute supervisor call of 21 Jul 2026, and 8 project reference papers. Intended as the seed context for continuing this project in Claude Code.

---

## 1. Project identity

- **Researcher:** Sumeet Mohanty, PGDM (GM) Co'26, XLRI. Prior: BYJU'S (FIFA Math Cup gamification launch); has independently shipped agent-based tools (a CX analysis app, a domain chatbot), used as a build-credibility signal with the professor.
- **Supervisor:** Prof. Harshit Kumar Singh (name per earlier conversations; verify spelling before putting it in any document). An IS/management academic who publishes in AJIS/ACIS/HICSS. His comfort zone is theory-building reviews, MCDM frameworks, and SDT-grounded engagement studies, not software builds. He is teaching a Gamification course from mid-September 2026.
- **Container:** a 6-month Field-Based Training (FBT) project. Budget is roughly 3 hrs/day, so about 400-450 productive hours total.
- **Sumeet's stated priorities:** (1) a deployed, demo-able artifact for the employment portfolio; (2) realistic scope; (3) publication is a bonus under XLRI's name, not the driver. The professor explicitly de-prioritized the paper on the 21 Jul call ("project first, paper if possible, not a pressure point").

## 2. How the idea evolved (important for continuity)

1. **19 Jul (brainstorm + email):** Started as workplace agentic gamification. A literature scan (web plus project PDFs) found that adaptive/personalized gamification is saturated in education and health, that workplace is the under-studied domain, and that existing LLM work uses models as content generators rather than orchestrators. Three problem statements were emailed to the prof: (PS1) an agentic orchestrator for hyper-personalized workplace gamification grounded in his 2023 AJIS relatedness paper, as a Slack/Teams bot plus a DSR pilot; (PS2) a workplace-learning/L&D variant; (PS3) an MCDM framework for evaluating agentic gamification platforms (no build).
2. **21 Jul (meeting prep):** Deep-read of 4 papers. Key correctness notes: the AJIS paper's moderated mediation was non-significant (the earlier email slightly overstated the moderation finding, and a correction was planned for the call); the intellectual-engagement path was null; surveillance/voluntariness was flagged as an ethics topic.
3. **21 Jul call (the pivot, which now defines the project):** The prof proposed combining PS1 and PS2 and shifting the context to education, specifically his own classroom (lower access risk, and he can pilot it himself). The workplace framing is effectively parked. The "agentic orchestration, not content generation" novelty claim carries over intact; it is now expressed as AI designing the game mechanics per student.

## 3. The agreed product (from the 21 Jul call)

**One-liner:** A gamified learning platform where an AI layer designs the gamification itself (quests, badges, point values) individually per student from their performance history, with a human-in-the-loop teacher approval layer.

Core mechanics agreed:

- **Anti-comfort-zone point economy:** points diminish for practicing areas the student is already strong in, and weak areas get more quests and higher rewards. This is the central design thesis, as opposed to traditional fixed, equal-weight gamification.
- **Two phases per student:** Phase 1 is an identical baseline for everyone (for example, the first N tasks). From Phase 2 onward, tasks and quests are AI-designed per individual.
- **Human-in-the-loop (HITL):** the AI proposes each quest with its reasoning, and the teacher approves, edits, or rejects it before delivery. The prof was most energized by this layer.
- **Teacher/admin dashboard:** a 360-degree view of each student (history, achievements, the AI's inferred strengths and weaknesses, and pending AI proposals), where the teacher can chat with the AI to redesign a quest.
- **Pilot use case:** his Digital Transformation course (about 20 sessions). The AI generates MCQs per session. Phase 1 is the same for all; later phases adapt. The system also doubles as a dynamic survey and data-collection instrument (satisfaction plus engagement), and that dataset is the raw material for the optional case-study paper.
- **Knowledge layer:** the book *Gamification for Dummies* (the prof will forward the PDF if it isn't findable online) plus his course content. This grounds what the AI knows about gamification design.

## 4. Tech stack (prof's suggestions 21 Jul plus decisions ratified 22 Jul)

**What the prof suggested on the call:** a Firebase backend, Vercel hosting ⚠️ *(garbled in transcript, best-guess reconstruction, confirm)*, Google AI Studio (Gemini) free tier, and "free tier only until something works." Model choice was delegated to Sumeet with a mandatory "why this and not that" justification. ⚠️ Sumeet mentioned a Chinese model good for development, but the name didn't transcribe (likely DeepSeek or Qwen).

**Decisions after 22 Jul analysis (the deviations are deliberate and must be pitched to the prof as reliability plus student-data privacy, not as overruling him):**

### 4a. Runtime stack (what the deployed app uses)

- **LLM: Gemini paid Tier 1, NOT free tier.** As of mid-2026, the free tier is Flash/Flash-Lite only, roughly 5 to 15 RPM and about 1,000 to 1,500 RPD, and free-tier prompts may be used for Google training, which is unacceptable for classroom student data and guaranteed to collapse under simultaneous classroom load. Tier 1 is pay-per-use only (no upfront), about 150 to 300 RPM, with no training-data clause. Estimated pilot cost is $2 to 10/month (unverified, check live pricing). Pitch to the prof: "About ₹500-800 total buys production rate limits and keeps student data out of training pipelines."
- **Architecture rule, design out the rate limits:** quest design runs as async background jobs (HITL approval already makes it non-live); MCQs are pre-generated per session and served from the database (a classroom burst hits the DB, not the LLM); the only live LLM path is the teacher's chat-to-redesign. Every LLM call gets a queue, exponential backoff, and a response cache.
- **Provider abstraction:** all LLM calls go through a thin adapter (Vercel AI SDK style) so switching provider is a config change. The fallback chain is Gemini paid, then a retry, then an alternate provider. Data-governance rule: student-derived data must never fail over to Chinese-hosted endpoints (an IRB/consent risk). Open-model fallback only via US/EU-hosted providers (for example, OpenRouter pinned) or restricted to non-student-data calls (MCQ drafting from course material is fine; profiling a named student is not).
- **Database: Supabase (Postgres) preferred over Firebase Firestore.** SQL-queryable engagement and point-transaction logs directly serve the paper's data analysis. Caveats: free-tier projects pause after about a week of inactivity (a non-issue during active dev), and fall back to Firebase if Postgres adds too much learning load. Either choice keeps Firebase Auth acceptable.
- **Hosting: Vercel Hobby tier.** Fine for an academic pilot; no change.

### 4b. Dev tooling (what Sumeet codes with), decided via structured comparison 22 Jul

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

## 5. Working relationship and cadence

- **Next meeting: Monday 27 Jul 2026, afternoon** (Tuesday 28 Jul as backup; the prof is blocking both). Recurring weekly Mon/Tue slots for now.
- The prof is reachable by phone up to about 8 pm and on WhatsApp anytime for small things; he also said planning independently is "even better."
- **Expectation for the 27 Jul meeting (his words, paraphrased):** a plan, meaning the layered architecture of the whole system and the model selections with justification. This call was "problem statement"; the next call is "design."

## 6. Roadmap (proposed in-chat on 22 Jul; not yet ratified by prof)

| Weeks | Focus |
|---|---|
| **1** | Architecture doc + model comparison (the 27 Jul deliverable; see §7) |
| 2-3 | Knowledge layer (ingest *Gamification for Dummies* into a RAG/KB) + Phase-1 static skeleton: auth, one module, fixed quiz, hardcoded points/badges/leaderboard. No AI yet; prove the game loop |
| 4-5 | AI personalization layer: student-profile schema, a prompt pipeline emitting structured quest designs (JSON: quest, difficulty, point value, reasoning), and diminishing-returns point logic |
| 6-7 | HITL admin dashboard: student list, profile, AI proposals with reasoning, approve/reject/edit, chat-to-redesign |
| 8 | Content pipeline: MCQ generation per Digital Transformation session plus an instructor review queue |
| 9-10 | Pilot prep: seed data, dry run with classmates, and engagement/satisfaction logging built in now (the paper dataset) |
| Sept+ | Classroom pilot aligned with his gamification course; iterate; optional case-study write-up |

## 7. Week-1 deliverable (due Mon 27 Jul)

A 3-to-5 page/slide document containing:

1. A **layered architecture diagram** with labeled data flows: Frontend (Vercel), Firebase, the AI layer (quest designer, MCQ generator, student profiler), the knowledge layer, and the Admin/HITL layer.
2. A **model comparison table plus pick plus rationale:** 3 to 4 candidates (Gemini via AI Studio free tier; DeepSeek/Qwen; Claude/GPT) scored on free-tier limits, structured-output reliability, reasoning quality for quest design, latency, and cost at pilot scale. Verify current free-tier quotas; they change frequently.
3. A **data model draft:** student profile, skill/topic taxonomy, quest object, point-transaction log, and approval-workflow states.
4. A **Phase-1 vs Phase-2 definition** plus the switching trigger.
5. **2 to 3 open questions for the prof** (for example, skill-taxonomy granularity for his course, and whether approval blocks delivery or runs async).

Also this week: obtain *Gamification for Dummies* (nudge the prof by **Wed 23 Jul** if not found); skim the project PDFs for the standard gamification element taxonomy.

## 8. Theory and literature context (for the eventual paper)

- **Novelty claim (verified by live search, ~5 searches, not a systematic review):** LLM-as-orchestrator/designer of gamification mechanics per user, with HITL, is an open corner. LLM-as-content-generator and static-typology tailoring (Hexad, etc.) are crowded. A proper Scopus/WoS pass is still owed before claiming the gap in writing.
- **Prof's papers on hand (project PDFs):** Singh & Dev 2023 AJIS (ICT interventions, relatedness, engagement; moderated mediation non-significant; intellectual engagement null); Singh & Verma 2020 ACIS (gamification taxonomy/theory); Singh & Singh 2021 ACIS (gamification in hybrid teacher PD, SDT plus goal theories); the MCDM chatbot-ranking paper (Delphi + CRITIC + WASPAS/EDAS); the mandatory-telework paper; Klock et al. 2020 IJHCS (tailored gamification); Alioto & Persico (corporate training gamification). Note: several PDFs are scanned/image-based, so text was extracted via OCR; verify any quoted passage against the source.
- **Likely paper framing:** a Design Science Research case study (artifact plus classroom deployment plus engagement/satisfaction data). Ethics topics to raise before the pilot: consent/voluntariness for interaction telemetry, the IRB/institutional review timeline, and scale reuse from the AJIS paper.

## 9. Open items and risks

- [ ] Confirm hosting is Vercel and identify the "Chinese model" (the transcript garbled both).
- [ ] Get the *Gamification for Dummies* PDF.
- [ ] Pitch Gemini paid Tier 1 to the prof (privacy plus reliability framing, about ₹500-800/pilot); verify live Tier 1 pricing and rate limits first.
- [ ] Decide Supabase vs Firebase within week 1 (before the data model is coded); default lean is Supabase.
- [ ] Set the Codex hard budget cap ($10/mo) in the OpenAI dashboard and create the OpenRouter key.
- [ ] Skill-taxonomy granularity for the Digital Transformation course; ask the prof.
- [ ] Ethics/IRB requirement and timeline for classroom data collection; ask the prof before the pilot, not after.
- [ ] Scope-creep risk: build one artifact (platform plus AI designer plus HITL) and resist adding orchestration extras. The hour budget is ~400-450 total.
- [ ] The Scopus/WoS systematic search is still pending if the paper goes ahead.

## 10. File inventory

- **Call transcript:** `transcript_2026-07-21_prof_call.txt` (auto-transcribed, faster-whisper base model; expect word-level errors; substance verified in §3 to §5).
- **Project PDFs (in the Claude.ai project; copy into repo `/docs/literature/` when migrating):** ICT_driven publication, Gamification_and_workers_training, Gamification_in_Hybrid_Teacher_Professional_Development, Gamification_at_Workplace (theories/constructs), 0566.pdf, the MCDM chatbot comparative study, ICT-Driven Work Engagement (WFH/relatedness), and 1s2.0-S1071581920300975 (Klock et al. 2020).
