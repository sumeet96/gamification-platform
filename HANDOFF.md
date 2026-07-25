# HANDOFF — AI-Personalized Gamification Platform (FBT Research Project)

**Prepared:** 22 Jul 2026. Consolidates 3 Claude.ai conversations (19–22 Jul 2026), the transcribed 21-min supervisor call of 21 Jul 2026, and 8 project reference papers. Intended as the seed context for continuing this project in Claude Code.

---

## 1. Project identity

- **Researcher:** Sumeet Mohanty, PGDM (GM) Co'26, XLRI. Prior: BYJU'S (FIFA Math Cup gamification launch); has independently shipped agent-based tools (a CX analysis app, a domain chatbot) — used as build-credibility signal with the professor.
- **Supervisor:** Prof. Harshit Kumar Singh (name per earlier conversations — verify spelling before putting it in any document). IS/management academic; publishes in AJIS/ACIS/HICSS. Comfort zone: theory-building reviews, MCDM frameworks, SDT-grounded engagement studies — *not* software builds. Teaching a **Gamification course from mid-September 2026**.
- **Container:** 6-month Field-Based Training (FBT) project. Budget ≈ 3 hrs/day → **~400–450 productive hours total**.
- **Sumeet's stated priorities:** (1) a *deployed, demo-able artifact* for employment portfolio; (2) realistic scope; (3) publication is a bonus under XLRI's name, not the driver. The professor explicitly de-prioritized the paper on the 21 Jul call ("project first, paper if possible — not a pressure point").

## 2. How the idea evolved (important for continuity)

1. **19 Jul (brainstorm + email):** Started as *workplace* agentic gamification. Literature scan (web + project PDFs) found: adaptive/personalized gamification is saturated in education & health; workplace is the under-studied domain; existing LLM work uses models as **content generators, not orchestrators**. Three problem statements emailed to prof: (PS1) agentic orchestrator for hyper-personalized workplace gamification grounded in his 2023 AJIS relatedness paper, as a Slack/Teams bot + DSR pilot; (PS2) workplace-learning/L&D variant; (PS3) MCDM framework for evaluating agentic gamification platforms (no build).
2. **21 Jul (meeting prep):** Deep-read of 4 papers; key correctness notes: the AJIS paper's **moderated mediation was non-significant** (earlier email slightly overstated the moderation finding — a correction was planned for the call); intellectual-engagement path was null; surveillance/voluntariness flagged as an ethics topic.
3. **21 Jul call (the pivot — this now defines the project):** Prof proposed **combining PS1 + PS2** and shifting the context to **education/his own classroom** (lower access risk, he can pilot it himself). The workplace framing is effectively parked. The "agentic orchestration, not content generation" novelty claim carries over intact — it is now expressed as *AI designing the game mechanics per student*.

## 3. The agreed product (from the 21 Jul call)

**One-liner:** A gamified learning platform where an AI layer *designs the gamification itself* — quests, badges, point values — individually per student from their performance history, with a human-in-the-loop teacher approval layer.

Core mechanics agreed:
- **Anti-comfort-zone point economy:** points *diminish* for practicing areas the student is already strong in; *more quests and higher rewards* for weak areas. This is the central design thesis (vs. traditional fixed, equal-weight gamification).
- **Two phases per student:** Phase 1 = identical baseline for everyone (e.g., first N tasks). From Phase 2 onward, tasks/quests are AI-designed per individual.
- **Human-in-the-loop (HITL):** AI proposes each quest *with its reasoning* → teacher approves/edits/rejects before delivery. The prof was most energized by this layer.
- **Teacher/admin dashboard:** 360° view of each student — history, achievements, the AI's inferred strengths/weaknesses ("how the AI perceives them"), pending AI proposals; teacher can **chat with the AI to redesign** a quest.
- **Pilot use case:** his **Digital Transformation course (~20 sessions)**. AI generates MCQs per session. Phase 1 same for all; later phases adaptive. The system doubles as a **dynamic survey / data-collection instrument** (satisfaction + engagement) — that dataset is the raw material for the optional case-study paper.
- **Knowledge layer:** the book ***Gamification for Dummies*** (prof will forward the PDF if not findable online) + his course content. This grounds what the AI knows about gamification design.

## 4. Tech stack (prof's suggestions 21 Jul + decisions ratified 22 Jul)

**What the prof suggested on the call:** Firebase backend, Vercel hosting ⚠️ *(garbled in transcript — best-guess reconstruction, confirm)*, Google AI Studio (Gemini) free tier, "free tier only until something works." Model choice **delegated to Sumeet** with a mandatory "**why this and not that**" justification. ⚠️ Sumeet mentioned a Chinese model good for development — name didn't transcribe (likely DeepSeek or Qwen).

**Decisions after 22 Jul analysis (deviations are deliberate and must be pitched to prof as reliability + student-data privacy, not as overruling him):**

### 4a. Runtime stack (what the deployed app uses)
- **LLM: Gemini paid Tier 1, NOT free tier.** As of mid-2026, free tier = Flash/Flash-Lite only, ~5–15 RPM / ~1,000–1,500 RPD, and free-tier prompts may be used for Google training — unacceptable for classroom student data and guaranteed to collapse under simultaneous classroom load. Tier 1 = pay-per-use only (no upfront), ~150–300 RPM, no training-data clause. Estimated pilot cost $2–10/month (unverified — check live pricing). Pitch to prof: "~₹500–800 total buys production rate limits and keeps student data out of training pipelines."
- **Architecture rule — design out the rate limits:** quest design runs as async background jobs (HITL approval already makes it non-live); MCQs pre-generated per session and served from the database (classroom burst hits DB, not LLM); the only live LLM path is the teacher's chat-to-redesign. Queue + exponential backoff + response cache on all LLM calls.
- **Provider abstraction:** all LLM calls go through a thin adapter (Vercel AI SDK style) so switching provider is a config change. Fallback chain: Gemini paid → retry → alternate provider. **Data-governance rule: student-derived data must never fail over to Chinese-hosted endpoints** (IRB/consent risk). Open-model fallback only via US/EU-hosted providers (e.g., OpenRouter pinned) or restricted to non-student-data calls (MCQ drafting from course material = fine; profiling a named student = not).
- **Database: Supabase (Postgres) preferred over Firebase Firestore** — SQL-queryable engagement/point-transaction logs directly serve the paper's data analysis. Caveats: free-tier projects pause after ~1 week inactivity (non-issue during active dev); fall back to Firebase if Postgres adds too much learning load. Either choice keeps Firebase Auth acceptable.
- **Hosting: Vercel Hobby tier** — fine for an academic pilot; no change.

### 4b. Dev tooling (what Sumeet codes with) — decided via structured comparison 22 Jul
| Role | Tool | Notes |
|---|---|---|
| Primary builder (backend, AI layer, glue) | **Claude Code** (existing Claude Pro sub) | $0 marginal; this repo's CLAUDE.md targets it |
| Frontend scaffolding | **v0 free tier** | React/Tailwind UI generation, native Vercel deploy; generate dashboard/leaderboard/approval screens, then hand to Claude Code to wire up |
| Overflow agent + Gemini prompt debugging | **Antigravity** (free, Google) | Backup when Claude Code quota exhausts; same model family as runtime |
| Code review, 2nd opinion | **DeepSeek V4 (Flash routine / Pro hard bugs) via OpenRouter**; Qwen 3.6 free preview as $0 fallback | One OpenRouter key = model-switching freedom; ~$2–5/mo estimated |
| Code review, 3rd opinion (sparingly) | **Codex via existing API credits** — mini-tier model, diffs only (`git diff \| codex exec "review"`), hard budget cap $10/mo | API-key auth bills every token with no subscription buffer — never use as builder, only bounded reviewer |
| **Cut** | Cursor (redundant $20/mo vs Claude Code), Emergent (demo-grade free tier, fights the fixed stack) | |

Weekly ritual: before each prof meeting, run the week's diff through DeepSeek (occasionally Codex-mini) for adversarial review; Claude Code triages comments. This doubles as firsthand evidence for the "why this model and not that" justification doc.

⚠️ Model-landscape facts above (rankings, prices, quotas) date from web sources of Apr–Jul 2026 and change weekly — re-verify against live pricing pages before writing them into any deliverable. The prof himself said whatever is current will be weeks old soon.

## 5. Working relationship & cadence

- **Next meeting: Monday 27 Jul 2026, afternoon** (Tuesday 28 Jul as backup; prof is blocking both). Recurring weekly Mon/Tue slots for now.
- Prof reachable by **phone up to ~8 pm** and **WhatsApp anytime** for small things; he also said planning independently is "even better."
- **Expectation for the 27 Jul meeting (his words, paraphrased):** a plan — the **layered architecture** of the whole system, and **model selections with justification**. This call was "problem statement"; next call is "design."

## 6. Roadmap (proposed in-chat on 22 Jul; not yet ratified by prof)

| Weeks | Focus |
|---|---|
| **1** | Architecture doc + model comparison (the 27 Jul deliverable — see §7) |
| 2–3 | Knowledge layer (ingest *Gamification for Dummies* → RAG/KB) + Phase-1 static skeleton: auth, one module, fixed quiz, hardcoded points/badges/leaderboard. No AI yet — prove the game loop |
| 4–5 | AI personalization layer: student-profile schema → prompt pipeline emitting structured quest designs (JSON: quest, difficulty, point value, reasoning) + diminishing-returns point logic |
| 6–7 | HITL admin dashboard: student list → profile → AI proposals w/ reasoning → approve/reject/edit → chat-to-redesign |
| 8 | Content pipeline: MCQ generation per Digital Transformation session + instructor review queue |
| 9–10 | Pilot prep: seed data, dry run with classmates, **engagement/satisfaction logging built in now** (paper dataset) |
| Sept+ | Classroom pilot aligned with his gamification course; iterate; optional case-study write-up |

## 7. Week-1 deliverable (due Mon 27 Jul)

A 3–5 page/slide document containing:
1. **Layered architecture diagram** with labeled data flows: Frontend (Vercel) → Firebase → AI layer (quest designer, MCQ generator, student profiler) → Knowledge layer → Admin/HITL layer.
2. **Model comparison table + pick + rationale:** 3–4 candidates (Gemini via AI Studio free tier; DeepSeek/Qwen; Claude/GPT) scored on free-tier limits, structured-output reliability, reasoning quality for quest design, latency, cost at pilot scale. Verify current free-tier quotas — they change frequently.
3. **Data model draft:** student profile, skill/topic taxonomy, quest object, point-transaction log, approval-workflow states.
4. **Phase-1 vs Phase-2 definition** + the switching trigger.
5. **2–3 open questions for the prof** (e.g., skill-taxonomy granularity for his course; does approval block delivery or run async?).
Also this week: obtain *Gamification for Dummies* (nudge prof by **Wed 23 Jul** if not found); skim the project PDFs for the standard gamification element taxonomy.

## 8. Theory & literature context (for the eventual paper)

- **Novelty claim (verified by live search, ~5 searches — not a systematic review):** LLM-as-*orchestrator/designer* of gamification mechanics per user, with HITL, is an open corner. LLM-as-content-generator and static-typology tailoring (Hexad etc.) are crowded. A proper Scopus/WoS pass is still owed before claiming the gap in writing.
- **Prof's papers on hand (project PDFs):** Singh & Dev 2023 AJIS (ICT interventions → relatedness → engagement; moderated mediation **non-significant**; intellectual engagement null); Singh & Verma 2020 ACIS (gamification taxonomy/theory); Singh & Singh 2021 ACIS (gamification in hybrid teacher PD, SDT + goal theories); MCDM chatbot-ranking paper (Delphi + CRITIC + WASPAS/EDAS); mandatory-telework paper; Klock et al. 2020 IJHCS (tailored gamification); Alioto & Persico (corporate training gamification). Note: several PDFs are **scanned/image-based** — text was extracted via OCR; verify any quoted passage against the source.
- **Likely paper framing:** Design Science Research case study — artifact + classroom deployment + engagement/satisfaction data. Ethics topics to raise before pilot: consent/voluntariness for interaction telemetry, IRB/institutional review timeline, scale reuse from the AJIS paper.

## 9. Open items & risks

- [ ] Confirm hosting = Vercel and identify the "Chinese model" (transcript garbled both).
- [ ] Get *Gamification for Dummies* PDF.
- [ ] Pitch Gemini paid Tier 1 to prof (privacy + reliability framing, ~₹500–800/pilot); verify live Tier 1 pricing and rate limits first.
- [ ] Decide Supabase vs Firebase within week 1 (before data model is coded); default lean = Supabase.
- [ ] Set the Codex hard budget cap ($10/mo) in the OpenAI dashboard and create the OpenRouter key.
- [ ] Skill taxonomy granularity for Digital Transformation course — ask prof.
- [ ] Ethics/IRB requirement + timeline for classroom data collection — ask prof before the pilot, not after.
- [ ] Scope-creep risk: build **one artifact** (platform + AI designer + HITL), resist adding orchestration extras. Hour budget is ~400–450 total.
- [ ] The Scopus/WoS systematic search is still pending if the paper goes ahead.

## 10. File inventory

- **Call transcript:** `transcript_2026-07-21_prof_call.txt` (auto-transcribed, faster-whisper base model — expect word-level errors; substance verified in §3–§5).
- **Project PDFs (in Claude.ai project; copy into repo `/docs/literature/` when migrating):** ICT_driven publication, Gamification_and_workers_training, Gamification_in_Hybrid_Teacher_Professional_Development, Gamification_at_Workplace (theories/constructs), 0566.pdf, MCDM chatbot comparative study, ICT-Driven Work Engagement (WFH/relatedness), 1s2.0-S1071581920300975 (Klock et al. 2020).
