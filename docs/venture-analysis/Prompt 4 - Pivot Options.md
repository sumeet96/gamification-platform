# Prompt 4: Pivot Options + Pivot Experiments

> **Role:** Pivot Strategist. **Inputs:** `Prompt 1-3` (Opportunity Report, Pitch/Canvas, Devil's Advocate teardown). **Rules:** no fabricated facts; every pivot is driven by a specific wall; each recommended pivot carries a 2-week experiment plus success criteria. **Date:** 25 Jul 2026.
>
> **Structural constraint (important, and not in the generic template):** this is a Field-Based Training project, so Prof. Singh is the supervisor, not just a channel or gatekeeper. Pivots that abandon him (pure channel/ICP escapes) are not fully available; they're logged as options but flagged **⚠ breaks the FBT relationship**. The useful pivots reshape what is built and tested, not who it reports to.

---

## 1) Most likely walls (from Step 3)

Two walls dominate the top-3 risk scores and are the most probable execution failures:

- **Wall A, delivery too manual to scale (HITL).** About 20 students times about 20 sessions is roughly 400 approvals. Step 3 risk #2 (Sev 5 × Lik 4). If the prof can't sustain review, the fallback (auto-approval) deletes the differentiator. This is a delivery wall.
- **Wall B, weak or uninterpretable outcomes (confounded plus underpowered).** Step 3 risks #1 and #5. Changing magnitude, variance, personalization, and age at n≈20 yields results that can't be attributed and can't be confirmed. This is an evidence wall, and it's the one most likely to make the artifact read as "a quiz app with a random-number generator."

Everything below is aimed primarily at climbing these two.

---

## 2) Pivot options (6, diverse)

| # | Pivot (type) | Driven by wall | What STAYS (assets kept) | What CHANGES (assumptions reset) | Expected upside | New key risk |
|---|---|---|---|---|---|---|
| **P1** | Wedge pivot: ship the isolated variable-reward mechanic first, not the full loop | B | Reward engine, event logging, MCQ surface, demo | Drop the profiler and per-student design from v1; test one variable (variable vs fixed) | Clean, attributable result; cheapest build; best Monday demo | Looks "too simple" to the prof; must sell rigor as the point |
| **P2** | Productization pivot: a pre-generated quest bank with variable-reward rules baked in, minimal live AI, guardrailed auto-approve | A | Anti-comfort-zone logic, reward engine, the HITL concept | HITL shifts from per-proposal to set-the-rules-once plus spot-check; the AI runs offline/batch | Removes the ~400-approval bottleneck; rate-limit-proof | Weakens the "AI designs per student, live" novelty claim |
| **P3** | Problem pivot: reframe the headline problem from "personalize the economy" to "beat engagement/novelty decay" | B | Variable-reward thesis, age angle, all research | Personalization-superiority demoted from a claim to a secondary question | Leads with the strongest evidence (variable reward); dodges the contested claim | Narrower story; less "AI" sizzle |
| **P4** | ICP pivot (additive): recruit self-selected consenting adults (including 30-plus) in a non-graded context for the reward experiment | A/B plus coercion plus IRB | Reward engine, age hypothesis, instruments | Subjects aren't the graded cohort; engagement is voluntary (uncontaminated) | Removes the coercion confound; eases IRB; directly serves the age arm | Recruitment effort; comparability to students |
| **P5** | Channel pivot: deploy as a standalone self-serve web app anyone can try, not gated by one classroom | A (SPOF) | The whole front-end plus reward loop | Remove the single-gatekeeper dependency | Kills the single-point-of-failure; more n | **⚠ breaks the FBT relationship**, since the prof is the supervisor; use only as a supplement |
| **P6** | "Business model" pivot: reposition the return from "pilot effect-size plus paper" to a reusable open methods instrument (a validated within-subject reward-schedule testbed) | B | Everything | Success becomes a validated method/testbed, not a significant effect at n≈20 | Underpowering stops being fatal, because the contribution is the instrument | Less headline-grabbing; must be genuinely reusable |

---

## 3) Top 3 recommended pivots (deep dive)

*Chosen because they climb both walls, are buildable in the hours, and respect the FBT relationship (no abandoning the prof).*

### 3.1 P1: Wedge on the isolated variable-reward mechanic
**Updated one-sentence hypothesis:** *"For learners practicing course MCQs, a variable/uncertain reward schedule, holding magnitude and content constant, produces more sustained practice than a fixed-points schedule."*
**First experiment (2 weeks):**
- *Method:* a within-subject dry run; each participant sees both schedules across matched topics (order-counterbalanced), where a single variable (variance) differs.
- *Min sample:* 8 to 15 (classmates are fine for a feasibility signal).
- *Success criteria:* more attempts or longer voluntary practice under the variable schedule, sustained across 3+ sessions (not just session 1).
- *Decision rule if it fails:* if there's no signal by session 3, the mechanic (not the app) is the problem, so stop before building the economy.
**Canvas updates:** Solution becomes "1 capability: variable-reward quiz"; Key metrics become attempts-per-topic under each schedule; Unfair advantage becomes "the rigor of an isolated test."

### 3.2 P2: Productization to a pre-generated bank plus guardrailed auto-approve
**Updated one-sentence hypothesis:** *"A teacher can set reward/quest rules once and spot-check a pre-generated bank, getting the personalization benefit without reviewing ~400 live proposals."*
**First experiment (2 weeks):**
- *Method:* generate a bank of AI-designed quests offline; have the prof (or a proxy) set guardrails, then spot-review a sample, and time it.
- *Min sample:* 1 reviewer, about 30 quests.
- *Success criteria:* about 10 minutes total to set rules plus spot-check a session's worth, and the reviewer says "I'd trust this weekly."
- *Decision rule if it fails:* if spot-checking still feels unsafe, HITL must stay per-proposal, and then the pilot must shrink to fit review capacity.
**Canvas updates:** Channels become "batch generation plus rule-setting"; Cost structure moves the LLM to offline batch (cheaper, rate-limit-proof); Solution becomes "rules plus bank," not "live per-student design."

### 3.3 P4: Additive ICP, self-recruited consenting adults for the reward and age arm
**Updated one-sentence hypothesis:** *"Voluntary adult learners (spanning under-30 and 30-plus) show the same variable-reward engagement lift as students, and the lift is measurable without grade-driven coercion."*
**First experiment (2 weeks):**
- *Method:* recruit 10 to 20 consenting adults (a mix of age brackets) to the same non-graded reward dry run.
- *Min sample:* 10 to 20 (a stretch, feasibility-level).
- *Success criteria:* recruitment is feasible (10 or more complete) and voluntary engagement replicates the within-subject pattern; age brackets show a directional difference (exploratory only).
- *Decision rule if it fails:* if recruitment stalls (under 10) or there's no voluntary signal, the age arm drops to "future work" and the pilot stays student-only.
**Canvas updates:** Customer segments add "voluntary adult learners (age-stratified)"; Key metrics add engagement by age bracket; Revenue/return becomes "cleaner, uncoerced evidence."

---

## 4) Pivot tree

```
WALL A — HITL delivery won't scale (~400 approvals)
├── Branch A1: Guardrailed auto-approve within teacher-set bounds
│     └─ exp: define bounds; measure % proposals safely auto-approved; target ≥70% auto, <30% to human
├── Branch A2: Pre-generated quest bank + spot-check   [→ P2]
│     └─ exp: time "set rules + spot-check 30 quests"; target ≤10 min/session, "I'd trust it"
└── Branch A3: Shrink the pilot to review capacity (fewer students/sessions)
      └─ exp: from the timed 20-proposal test, back-solve the max cohort one prof can sustain weekly

WALL B — Confounded + underpowered outcomes
├── Branch B1: Single-variable isolation (variable vs fixed only)   [→ P1]
│     └─ exp: within-subject dry run, one factor varies; target sustained signal across ≥3 sessions
├── Branch B2: Non-graded voluntary cohort (remove coercion)        [→ P4]
│     └─ exp: recruit 10–20 adults; target ≥10 complete + voluntary within-subject signal
└── Branch B3: Reposition contribution as a validated methods instrument   [→ P6]
      └─ exp: write the pre-registration + testbed spec; target a design a methods reviewer calls sound
```

---

### Net recommendation

**Combine P1 + P2 + P4, and lead with P3's framing.** Concretely: build the isolated variable-reward mechanic (P1) on a pre-generated bank with guardrailed approval (P2), test it on voluntary age-stratified adults (P4), and tell the story as "beating engagement decay" (P3) rather than "personalization wins." This version is buildable in the hours, produces an attributable result, survives the underpowering (feasibility framing), respects the FBT relationship, and still contains the full vision as the roadmap beyond the wedge. Feed this into a Lean Canvas v2 (the next natural step) before returning to the Monday architecture deliverable.
