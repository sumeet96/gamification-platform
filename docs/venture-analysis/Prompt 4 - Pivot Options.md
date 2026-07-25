# Prompt 4 — Pivot Options + Pivot Experiments

> **Role:** Pivot Strategist. **Inputs:** `Prompt 1–3` (Opportunity Report, Pitch/Canvas, Devil's Advocate teardown). **Rules:** no fabricated facts; every pivot is driven by a specific wall; each recommended pivot carries a 2-week experiment + success criteria. **Date:** 25 Jul 2026.
>
> **Structural constraint (important, not in the generic template):** this is a Field-Based Training project — **Prof. Singh is the supervisor, not just a channel/gatekeeper.** Pivots that abandon him (pure channel/ICP escapes) are *not fully available*; they're logged as options but flagged **⚠ breaks the FBT relationship**. The useful pivots reshape *what* is built and tested, not *who* it reports to.

---

## 1) Most likely walls (from Step 3)

Two walls dominate the top-3 risk scores and are the most probable execution failures:

- **Wall A — Delivery too manual to scale (HITL).** ~20 students × ~20 sessions ≈ **~400 approvals.** Step 3 risk #2 (Sev 5 × Lik 4). If the prof can't sustain review, the fallback (auto-approval) deletes the differentiator. This is a *delivery* wall.
- **Wall B — Weak/uninterpretable outcomes (confounded + underpowered).** Step 3 risks #1 and #5. Changing magnitude + variance + personalization + age at n≈20 yields results that **can't be attributed and can't be confirmed.** This is an *evidence* wall — and it's the one most likely to make the artifact read as "a quiz app with a random-number generator."

Everything below is aimed primarily at climbing these two.

---

## 2) Pivot options (6, diverse)

| # | Pivot (type) | Driven by wall | What STAYS (assets kept) | What CHANGES (assumptions reset) | Expected upside | New key risk |
|---|---|---|---|---|---|---|
| **P1** | **Wedge pivot** — ship the *isolated variable-reward mechanic* first, not the full loop | B | Reward engine, event logging, MCQ surface, demo | Drop profiler + per-student design from v1; test *one* variable (variable vs fixed) | Clean, attributable result; cheapest build; best Monday demo | Looks "too simple" to the prof; must sell rigor as the point |
| **P2** | **Productization pivot** — pre-generated quest **bank** with variable-reward rules baked in, minimal live AI, **guardrailed auto-approve** | A | Anti-comfort-zone logic, reward engine, HITL *concept* | HITL shifts from per-proposal to *set-the-rules-once + spot-check*; AI runs offline/batch | Removes the ~400-approval bottleneck; rate-limit-proof | Weakens the "AI designs *per student, live*" novelty claim |
| **P3** | **Problem pivot** — reframe the headline problem from "personalize the economy" to **"beat engagement/novelty decay"** | B | Variable-reward thesis, age angle, all research | Personalization-superiority demoted from claim to *secondary* question | Leads with the strongest evidence (variable reward); dodges the contested claim | Narrower story; less "AI" sizzle |
| **P4** | **ICP pivot (additive)** — recruit **self-selected consenting adults (incl. 30+)** in a **non-graded** context for the reward experiment | A/B + coercion + IRB | Reward engine, age hypothesis, instruments | Subjects aren't the graded cohort; engagement is *voluntary* (uncontaminated) | Removes coercion confound; eases IRB; directly serves the age arm | Recruitment effort; comparability to students |
| **P5** | **Channel pivot** — deploy as a **standalone self-serve web app** anyone can try, not gated by one classroom | A (SPOF) | Whole front-end + reward loop | Remove single-gatekeeper dependency | Kills the single-point-of-failure; more n | **⚠ breaks the FBT relationship** — the prof *is* the supervisor; use only as a *supplement* |
| **P6** | **"Business model" pivot** — reposition the *return* from "pilot effect-size + paper" to a **reusable open methods instrument** (a validated within-subject reward-schedule testbed) | B | Everything | Success = a *validated method/testbed*, not a significant effect at n≈20 | Underpowering stops being fatal — the contribution is the instrument | Less headline-grabbing; must be genuinely reusable |

---

## 3) Top 3 recommended pivots (deep dive)

*Chosen because they climb both walls, are buildable in the hours, and **respect the FBT relationship** (no abandoning the prof).*

### 3.1 — P1: Wedge on the isolated variable-reward mechanic
**Updated one-sentence hypothesis:** *"For learners practicing course MCQs, a variable/uncertain reward schedule — holding magnitude and content constant — produces more sustained practice than a fixed-points schedule."*
**First experiment (2 weeks):**
- *Method:* within-subject dry run; each participant sees both schedules across matched topics (order-counterbalanced); a single variable (variance) differs.
- *Min sample:* 8–15 (classmates ok for a feasibility signal).
- *Success criteria:* more attempts / longer voluntary practice under the variable schedule, **sustained across ≥3 sessions** (not just session 1).
- *Decision rule if it fails:* if no signal by session 3, the mechanic — not the app — is the problem; stop before building the economy.
**Canvas updates:** Solution → "1 capability: variable-reward quiz"; Key metrics → attempts-per-topic under each schedule; Unfair advantage → "rigor of an isolated test."

### 3.2 — P2: Productization to a pre-generated bank + guardrailed auto-approve
**Updated one-sentence hypothesis:** *"A teacher can set reward/quest rules once and spot-check a pre-generated bank — getting the personalization benefit without reviewing ~400 live proposals."*
**First experiment (2 weeks):**
- *Method:* generate a bank of AI-designed quests offline; have the prof (or proxy) set guardrails, then spot-review a sample; time it.
- *Min sample:* 1 reviewer × ~30 quests.
- *Success criteria:* ≤~10 min total to set rules + spot-check a session's worth, and reviewer says "I'd trust this weekly."
- *Decision rule if it fails:* if spot-checking still feels unsafe, HITL must stay per-proposal → then the pilot *must* shrink to fit review capacity.
**Canvas updates:** Channels → "batch generation + rule-setting"; Cost structure → LLM moves to offline batch (cheaper, rate-limit-proof); Solution → "rules + bank," not "live per-student design."

### 3.3 — P4: Additive ICP — self-recruited consenting adults for the reward + age arm
**Updated one-sentence hypothesis:** *"Voluntary adult learners (spanning <30 and 30+) show the same variable-reward engagement lift as students — and the lift is measurable without grade-driven coercion."*
**First experiment (2 weeks):**
- *Method:* recruit 10–20 consenting adults (mix of age brackets) to the same non-graded reward dry run.
- *Min sample:* 10–20 (stretch; feasibility-level).
- *Success criteria:* recruitment is feasible (≥10 complete) **and** voluntary engagement replicates the within-subject pattern; age brackets show a directional difference (exploratory only).
- *Decision rule if it fails:* if recruitment stalls (<10) or no voluntary signal, the age arm is dropped to "future work" and the pilot stays student-only.
**Canvas updates:** Customer segments → add "voluntary adult learners (age-stratified)"; Key metrics → engagement by age bracket; Revenue/return → "cleaner, uncoerced evidence."

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
**Combine P1 + P2 + P4, and lead with P3's framing.** Concretely: build the **isolated variable-reward mechanic** (P1) on a **pre-generated bank with guardrailed approval** (P2), test it on **voluntary age-stratified adults** (P4), and tell the story as **"beating engagement decay"** (P3) rather than "personalization wins." This version is buildable in the hours, produces an *attributable* result, survives the underpowering (feasibility framing), respects the FBT relationship, and still contains the full vision as the roadmap beyond the wedge. Feed this into a Lean Canvas v2 (next natural step) before returning to the Monday architecture deliverable.
