# Prompt 0: Alignment (AI-Personalized Gamification Platform)

> **Role:** Venture Analyst Copilot. **Method:** the staged venture-analysis spine, adapted from a profit-venture to a research artifact plus classroom pilot. **Anti-fabrication rule applied:** nothing invented; missing facts are marked `UNKNOWN`. **Sources:** `CLAUDE.md`, `HANDOFF.md`, and the 25 Jul 2026 deep-research run. **Date:** 25 Jul 2026.
>
> *Framing note:* this is not a commercial venture, so "buyer / money model" is reframed. The decision-maker and gatekeeper is Prof. Singh, and the payoff is a deployed portfolio artifact plus optional publication, not revenue.

---

## 0.1 One-sentence venture hypothesis

> For students in Prof. Singh's Digital Transformation course (aged 22 and up) who struggle with generic, one-size-fits-all gamified learning that rewards comfort-zone practice and loses potency over time, we provide a platform where an AI layer designs each student's gamification (quests, difficulty, variable point rewards) from their performance history, under teacher approval, that delivers higher and more durable engagement, especially by rewarding weak areas with larger, more uncertain payoffs, via their course MCQ workflow. The payoff is captured as a deployable portfolio artifact plus an engagement/satisfaction dataset for an optional DSR case-study paper, not revenue.

---

## 0.2 Idea restatement (5-8 bullets)

- **What it is:** a gamified learning platform whose AI layer designs the gamification itself (quests, badges, point values) per student from performance history, with a human-in-the-loop teacher approval gate on every AI proposal.
- **Primary user:** students in the pilot course (aged 22 and up); the plan is to also recruit 30-plus participants to test the age dimension.
- **Decision-maker / gatekeeper (the "buyer" analog):** Prof. Singh, who approves, edits, or rejects AI-proposed quests, greenlights the pilot, and runs it in his own classroom.
- **Where:** XLRI; Prof. Singh's Digital Transformation course (about 20 sessions), pilot from around mid-September 2026. The boundary is a single-course, single-instructor pilot.
- **Success (outcome metric):** primarily a deployed, demo-able artifact (Sumeet's stated #1 priority); secondarily an engagement/satisfaction dataset supporting an optional publication. The exact quantitative success threshold is `UNKNOWN` (see Q).
- **Central design thesis:** an anti-comfort-zone economy where rewards diminish in strong areas and weak areas get more quests and higher, more variable rewards (a variable-reward mechanic grounded in dopamine-codes-uncertainty research).
- **Research extension (not yet ratified by prof):** infer player-type (HEXAD) from actual gameplay rather than self-report, and test the age-by-reward-schedule hypothesis.
- **Explicitly out of scope (for now):** real-money stakes; multi-course or multi-institution rollout; auth-heavy production hardening; full HEXAD behavioral inference in the Monday demo; and anything requiring more than 400-450 hours or meaningful cash.

---

## 0.3 Constraints and non-negotiables

| Category | Constraint | Source | Notes |
|---|---|---|---|
| Effort budget | ~400-450 productive hours over 6 months (~3h/day) | CLAUDE.md / HANDOFF §1 | Hard ceiling; scope-creep is the top risk |
| Cash budget | Near-zero: ~$0-15/mo dev, <$10/mo runtime | CLAUDE.md | Ask before any paid dependency |
| Scope | One artifact; resist orchestration extras | CLAUDE.md | "One artifact" is explicit |
| Runtime LLM | Gemini paid Tier 1 (Flash-class), architected-for but pending prof spend sign-off | CLAUDE.md / HANDOFF §4a | Dev on free tier until signed off |
| Data governance | Student-derived data never to Chinese-hosted endpoints; all LLM calls via one provider-agnostic adapter | CLAUDE.md | IRB/consent risk |
| Rate limits | Quest gen is async jobs; MCQs pre-generated and DB-served; only teacher chat is live | CLAUDE.md | Design out the rate limits |
| DB / hosting | Supabase (Postgres) preferred; Vercel Hobby | HANDOFF §4a | Firebase is the fallback |
| HITL | No AI proposal reaches a student without teacher approval | CLAUDE.md | The layer the prof was most energized by |
| Evidence discipline | Every paper claim cites `/docs/literature/` or is flagged `[unverified]` | CLAUDE.md | Same anti-fabrication rule as this doc |
| Cadence | Weekly Mon/Tue supervisor meetings | CLAUDE.md | Next: Mon 27 Jul 2026 |
| Ethics/IRB | Consent/voluntariness for telemetry; IRB timeline | HANDOFF §9 | "Ask before the pilot, not after," still open |

---

## 0.4 Assumptions already present in the idea

| Assumption | Where stated | Risk if wrong | Notes |
|---|---|---|---|
| Anti-comfort-zone rewards raise engagement/learning vs. equal-weight gamification | CLAUDE.md core thesis | **High** | The central bet; not yet empirically tested here |
| A teacher will reliably review and approve AI quest proposals at classroom scale | HANDOFF §3 | **High** | ~20 students by 20 sessions is a heavy review load; may not scale to one prof |
| Students will engage enough to generate signal for personalization | HANDOFF §3/§6 | **High** | Engagement is both the mechanism and the outcome |
| Gemini Tier 1 cost is trivial (~₹500-800/pilot) | HANDOFF §4a | Med | Pricing flagged stale; re-verify |
| Supabase/Postgres won't add prohibitive learning load | HANDOFF §4a | Med | Firebase fallback exists |
| The "AI-as-designer/orchestrator" novelty gap is real | HANDOFF §8 | Med | Only ~5 searches, not a systematic review |
| Course MCQs are a sufficient behavioral surface to personalize on | HANDOFF §3 | Med-High | MCQs reveal knowledge; personality and player-type need the choices around them |
| Prof will accept the age-by-variable-reward extension | Session 25 Jul | Med | Not in ratified HANDOFF; prof can veto |

---

## 0.5 Clarifying questions (grouped)

**Customer / ICP**
1. Is the primary subject the students, or is the student pilot a proof-of-concept for a later corporate L&D / 30-plus target?
2. How will 30-plus participants be recruited, consented, and kept comparable to the student cohort? (`UNKNOWN`)
3. What's the realistic *n*, meaning how many students are actually enrolled in the DT course? (`UNKNOWN`; HANDOFF says "~20")

**Problem / urgency**
4. What concrete failure of current (non-personalized) gamification are we improving on for this prof's classroom: disengagement, poor weak-area practice, or drop-off? Which is the priority?
5. Is there a baseline (a prior non-gamified or fixed-gamified run of the course) to compare against? (`UNKNOWN`)

**Solution / scope**
6. Does the Monday demo need the AI layer live, or is the seeded variable-reward demo plus architecture doc sufficient? *(Working answer: doc primary plus thin demo, confirm.)*
7. What is the skill/topic taxonomy granularity for the DT course? (HANDOFF open item; ask prof)
8. Phase-1 to Phase-2 switching trigger: is `N = 3 sessions with ≥1 item per top-level topic` acceptable, or does the prof want a different rule?

**Distribution / deployment**
9. How do students access it: a link, an LMS embed, class time vs. homework? (`UNKNOWN`)
10. Does teacher approval block delivery, or run async (approve-after)? (HANDOFF open item)

**"Business model" / payoff**
11. What is the explicit success bar for the artifact (demo-able to whom, doing what) vs. the paper?
12. Is the paper in-scope this cycle, or explicitly deferred? (HANDOFF says the prof de-prioritized it; confirm still true.)

**Operations / regulatory**
13. What is the IRB/ethics requirement and timeline for classroom telemetry, and who owns it? (HANDOFF §9, before pilot)
14. Confirm the Gemini Tier 1 spend sign-off (~₹500-800) and who pays it.
15. Confirm hosting is Vercel, and identify the "Chinese model" mentioned on the 21 Jul call (both garbled in transcript).

**Competition / substitutes**
16. What does the student currently do instead (existing course quizzes, no gamification, Kahoot-style tools)? What's the "do-nothing" baseline?
17. Has a Scopus/WoS pass confirmed the "AI-as-orchestrator" gap, or is that still ~5 searches? (HANDOFF §8)

**Evidence so far**
18. Beyond the 8 project PDFs plus the 25 Jul research run, is there any pilot/pre-test data or prior classroom evidence? (`UNKNOWN`)

---

## 0.6 Working assumptions (to proceed if questions are unanswered)

1. The primary deliverable for Mon 27 Jul is the architecture doc plus model comparison; the local variable-reward demo is supporting.
2. Pilot subjects are about 20 DT-course students aged 22 and up; a 30-plus cohort is a stretch, recruited separately for the age dimension.
3. Success this cycle is a deployed, demo-able artifact; the paper is a bonus, not a gate.
4. Teacher approval runs async (approve-after) in the pilot to avoid blocking delivery, flagged for prof confirmation.
5. Topic taxonomy is about 4 top-level DT topics until the prof refines it.
6. Phase-2 switch trigger is `N = 3 sessions, ≥1 item per top-level topic` (proposed, prof can adjust).
7. Runtime is Gemini Tier 1, developed on the free tier until spend is signed off; student data stays off Chinese-hosted endpoints.
8. The age-by-variable-reward extension is presented Monday as a hypothesis the prof can veto, not a committed scope change.

---

### Riskiest assumptions to carry into Prompt 1 (Opportunity)

The three highest-impact, highest-uncertainty bets (from 0.4): (a) anti-comfort-zone plus variable rewards actually beat equal-weight gamification on engagement/learning; (b) one teacher can sustain HITL approval at classroom scale; and (c) MCQ behavior is a rich enough surface to personalize (and to infer player-type) on. These are what Prompt 1's assumption stack and evidence plan should attack first.
