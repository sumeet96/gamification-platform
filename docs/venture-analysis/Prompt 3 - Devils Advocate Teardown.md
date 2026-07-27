# Prompt 3: Devil's Advocate Teardown + Risk Register + Pre-Mortem

> **Role:** Devil's Advocate Venture Reviewer, attacking hard rather than being polite. **Inputs:** `Prompt 1 - Opportunity Report.md`, `Prompt 2 - Pitch and Lean Canvas.md`. **Rules:** no fabricated facts; every critique maps to a testable assumption or decision; ranked objectively. **Date:** 25 Jul 2026.
>
> *Group headings reframed for a research artifact:* "willingness to pay" becomes willingness to engage; "distribution & sales cycle" becomes gatekeeper buy-in and deployment; "economics & scalability" becomes effort budget and HITL scale.

---

## 1) Twelve kill-shot questions

**Market truth**
1. Where is the evidence that this classroom actually has an engagement problem? There is no baseline (Step 1 §1, Q5), so you may be solving a problem the prof and students don't feel. If the current quizzes are "fine," the whole premise is decoration.
2. The 3-way whitespace (Step 1 §3) might be empty because nobody wants it, not because it's an opportunity. Classcraft, the closest teacher-facing gamification, was shut down in 2024. What makes you think the intersection has demand rather than being a graveyard?

**Willingness to engage**
3. Students in a graded course will click through anything, so any "engagement" you measure is contaminated by coercion. How will you distinguish genuine motivational pull from "it's on the syllabus"?
4. Your own critique of incumbents is that fixed rewards' novelty decays. Variable-reward novelty decays too. After 2 or 3 sessions, what stops your mystery box from becoming the same wallpaper you're criticizing?
5. The 30-plus arm means professionals with jobs, recruited into a student's course tool for no reward. What is the realistic chance they engage at all, or is the age arm dead on arrival (Step 1 §7, where "recruitable + comparable" is Low confidence)?

**Gatekeeper buy-in and deployment**
6. The entire venture runs through one person (Prof. Singh). If he gets busy, loses interest, or the review becomes a chore, it's over. Where is the redundancy for a single point of failure?
7. IRB/consent for classroom telemetry (Step 1 §5) has an unknown timeline, and the pilot is about 7 weeks out. What happens to the "dataset for the paper" if clearance doesn't land in time?

**Ops / regulatory**
8. HITL at scale: about 20 students times about 20 sessions is roughly 400 proposals to review. If the prof won't sustain that, your only options are auto-approval (which deletes your core differentiator) or a dead queue. Which is it?
9. A slot-machine reward mechanic inside a graded academic course is ethically loaded. Is it manipulative? Will IRB or the prof object to deliberately engineering uncertainty-driven dopamine in students?

**Moat and defensibility**
10. Your "unfair advantage" is literally "Not yet" (Step 2 canvas). This is a prompt plus a formula plus a dashboard. Duolingo or Century could bolt on anti-comfort-zone weighting in a sprint. What stops them?

**Effort budget and scalability**
11. One solo builder, roughly 400-450 hours, must ship a platform, an AI profiler, an AI quest designer, a HITL dashboard, an MCQ pipeline, logging, and a run pilot. That is over-scoped for the hours. What gets cut, and does the cut version still test anything?
12. The design is confounded. You are changing reward magnitude (anti-comfort-zone) and reward variance and personalization, and studying age, all at once, at n≈20. Even if engagement moves, you cannot attribute it to any single mechanism. How is this not an inconclusive pilot by construction?

---

## 2) Risk register (top 10)

*Severity × Likelihood on 1 to 5 (5 = worst). Sorted by Severity × Likelihood.*

| # | Risk | Why it matters | Sev | Lik | Early warning signal | Test to validate | Mitigation |
|---|---|---|---|---|---|---|---|
| 1 | Confounded design, can't attribute any effect | Kills the paper's contribution and the portfolio claim | 5 | 4 | You can't name the single variable a result is due to | Pre-register a within-subject single-variable isolation (reward schedule only) | Isolate one mechanism first (variable vs fixed), add others later |
| 2 | HITL doesn't scale to ~400 approvals | Forces auto-approval, which deletes the differentiator | 5 | 4 | Prof takes >45s/proposal in a mock | Timed 20-proposal review (Step 1 §8) | Batch approval; guardrailed auto-approve within teacher-set bounds |
| 3 | IRB not cleared in the pilot window | No data means an artifact with no evidence | 5 | 3 | No confirmed IRB timeline by early Aug | Ask institution week 1 | Design a no-PII, consented-telemetry-minimal fallback; start paperwork now |
| 4 | Gatekeeper single point of failure | Prof disengages and the project dies | 5 | 3 | Slow replies; missed weekly meetings | Track review latency plus meeting cadence | Auto-approve fallback; a second sympathetic instructor as backup |
| 5 | Underpowered (n≈20 vs ~136/group) | Inconclusive age result | 4 | 5 | Wide CIs in any pilot analysis | Power calc (done, Step 1 §7C) | Reframe as feasibility/discovery; within-subject; pool future cohorts |
| 6 | Engagement is coerced, not genuine | The primary KPI is contaminated | 4 | 4 | ~100% completion regardless of condition | Compare within-subject across conditions; add a genuine-choice signal | Measure relative behavior across topics, not absolute completion |
| 7 | Scope overruns 400-450h | Half-built by Sept means no pilot | 4 | 4 | Week-4 slice not demoable | Build a thin vertical slice first; timebox | Cut MCQ pipeline / dashboard polish; protect the reward-loop slice |
| 8 | Variable-reward novelty decays | The same failure you critique in others | 3 | 4 | Engagement drops after session 2 or 3 | Measure engagement over 3+ sessions in the dry run | Vary reward structure over time; tie to intrinsic progress |
| 9 | No moat | Incumbents copy trivially | 3 | 4 | (structural) | (structural) | Lean on the dataset plus HITL-reasoning pattern; accept it's a research artifact, not a defensible business |
| 10 | Reward perceived as unfair or gamed | Trust drops; behavior distorts | 4 | 2 | Complaints; students farming easy weak-topic points | Fairness survey plus watching for gaming in the dry run | Cap the gradient (an attainable band); make the reasoning visible to students |

**Top-3 by score:** #1 confounded design (20), #2 HITL scale (20), #5 underpowered (20). These three define whether the pilot produces anything attributable.

---

## 3) Pre-mortem: it's 12 months on and this failed. Why?

| # | Failure story (specific) | Earliest test that would have caught it | Success criteria for that test |
|---|---|---|---|
| 1 | The pilot ran, but with reward-magnitude, variance, and personalization all changing at once, no result could be attributed to any mechanism, and reviewers called it uninterpretable. | Pre-register a single-variable within-subject isolation before building the full economy | A design where exactly one factor varies per comparison |
| 2 | Approvals piled up; the prof stopped reviewing by week 3; quests went stale; students quit. | Timed 20-proposal mock review in the first 2 weeks | 45s/proposal or less, and the prof says "I'd sustain this weekly" |
| 3 | IRB clearance never arrived; telemetry couldn't be collected; the "paper dataset" was empty. | Confirm the IRB requirement and timeline in week 1 | A written timeline that fits before mid-Sept |
| 4 | Scope ballooned; by September only half the system existed; there was nothing real to pilot. | Ship a thin end-to-end slice (entry, quiz, reward, log) by week 4 | The slice is demoable and instruments one real event stream |
| 5 | The mystery box was novel for two sessions, then boring; engagement flat-lined, the exact critique leveled at incumbents. | Measure engagement across 3+ sessions in the dry run (not 1) | Engagement holds, or the decay curve is understood |
| 6 | Students felt the variable reward was manipulative or unfair, or they farmed weak-topic points, and trust and data quality dropped. | Fairness survey plus a gaming-watch in the dry run | No fairness red flags; no trivial exploit |
| 7 | Results were underpowered and confounded; the paper was weak and the portfolio artifact read as "a quiz app with a random-number generator." | Honest power and design review now (Step 1 §7C), then reframe | Positioned as feasibility/discovery with a credible within-subject evidence path |

---

## 4) Go / No-Go criteria (decide within 4 to 6 weeks)

If any of these is not met, pause or pivot rather than pushing to a September pilot:

1. **Prof commits.** He signs off on scope, the Gemini spend, and the age extension, and verbally commits to sustaining HITL review time. *(No means the gatekeeper isn't bought in; pause.)*
2. **IRB path is real.** A written clearance timeline that fits before mid-Sept. *(No means data collection is off the table; reframe the deliverable to artifact-only.)*
3. **Reward thesis shows a signal.** A within-subject single-variable dry run (8 to 15 people) shows the variable schedule moves weak-topic behavior vs. fixed, sustained over 3+ sessions. *(No means the core mechanic is unproven; rethink before building the economy.)*
4. **HITL is sustainable.** Timed review at 45s/proposal or less, and a genuine "I'd keep doing this." *(No means redesign approval as guardrailed auto-approve; the pure-HITL pitch is dead.)*
5. **A thin slice exists.** Entry, quiz, reward reveal, and logged event, actually built and demoable inside the effort budget. *(No means scope is unrealistic for 400-450h; cut hard.)*

---

### Hand-off to Prompt 4 (Pivot options)

The most likely walls to feed into pivots: (W1) HITL won't scale, so an auto-approval pivot vs. a narrower review scope; (W2) confounded/underpowered, so a productization pivot (ship the isolated variable-reward mechanic as the whole artifact); (W3) IRB/gatekeeper risk, so an ICP/channel pivot (self-recruited consenting adults, or a non-graded context that removes coercion and eases ethics). Carry the top-3 risks (confounded design, HITL scale, underpowered) as the walls each pivot must climb.
