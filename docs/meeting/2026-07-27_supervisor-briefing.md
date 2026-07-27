# Supervisor Briefing: Week 1

**Meeting:** Mon 27 Jul 2026 · **Researcher:** Sumeet Mohanty (PGDM GM Co'26, XLRI) · **Supervisor:** Prof. Harshit Kumar Singh *(confirm spelling before circulation)*

**Purpose of this document:** a narrated walk-through of what I did this week, where each decision came from, and why. The idea is for the meeting to be a conversation about direction rather than a status readout. The formal deliverable (layered architecture plus model comparison) is the companion doc; this is the story around it.

> **On sourcing:** every empirical claim below either cites a source or carries a `[unverified]` tag (the source is identified but its PDF isn't logged in `docs/literature/` yet). That is the same discipline I used throughout the project. I would rather flag a gap than assert something I can't defend to you.

---

## 1. The 60-second story (how to open)

On the 21 Jul call we agreed to build a learning platform where an AI layer designs the gamification itself (quests, difficulty, point values) per student, with you approving every AI proposal before it reaches a student. This week I turned that into two things:

1. A design document: the layered architecture, the model pick with justification, the data model, the Phase-1/Phase-2 definition, and the research framing. That is exactly the deliverable you asked for.
2. A working prototype: a runnable app that already implements the hardest idea in the project (the anti-comfort-zone, variable-reward economy) end to end, so the mechanic is tangible rather than described.

Everything else hangs on one design commitment: an anti-comfort-zone economy, where weak topics pay more and rewards are uncertain precisely where the student is weakest. That single idea is what separates this from ordinary points-and-badges gamification, and it's the idea I most want your read on.

---

## 2. How we got here (the journey, and why it turned)

This matters because the pivot is yours, and I want to show I built on it faithfully.

- **Started (19 Jul):** workplace agentic gamification, grounded in your 2023 AJIS relatedness paper. A literature scan found education and health gamification is saturated, but one specific corner is genuinely open: an LLM acting as the orchestrator and designer of the mechanics, not just a content generator, with a human in the loop. `[unverified: needs a Scopus/WoS pass before it goes in writing]`
- **The pivot (21 Jul call, yours):** move the context into your own classroom (the Digital Transformation course). Access risk drops and you can pilot it yourself. The "AI designs the game, not just the content" novelty carries over intact.
- **The design analysis (22-25 Jul):** I stress-tested the concept with a structured devil's-advocate pass (the venture-analysis docs in the repo). It surfaced two real problems and reshaped the build around them:
  - **Confounding.** If reward size, reward variance, personalization, and age all vary at once with roughly 20 students, no result is attributable to anything. So we isolate one variable (fixed vs. variable reward, matched on expected value) as the primary test.
  - **Human-in-the-loop won't scale by hand.** Roughly 20 students times 20 sessions is hundreds of approvals. So production shifts to pre-generated quest banks plus set-rules-once approval, which keeps the human gate without the bottleneck.
- **This week's build (25-26 Jul):** the prototype and the doc, described below.

The through-line: every choice traces back to your pivot and to keeping the design defensible at pilot scale. The confounding fix and the scale fix both narrow the build rather than adding to it.

---

## 3. What exists right now (concrete)

| Artifact | State | Where |
|---|---|---|
| Architecture and model-comparison doc | Complete, renders on GitHub | `docs/architecture/2026-07-27_architecture-and-model-comparison.md` |
| Roadmap and app-flow diagrams | Complete (phase/week Gantt plus end-to-end flow with edge cases) | `docs/architecture/roadmap-and-flow.md` |
| Working prototype | Runnable (`npm install && npm run dev`) | this repo, `src/` |
| Reward engine (the thesis in code) | Built and property-tested | `src/lib/rewardEngine.ts`, `tests/` |
| Venture-analysis / stress-test pack | Complete (alignment, TAM/SAM/SOM reframe, devil's-advocate, pivots) | `docs/venture-analysis/` |
| Event-logging schema | Written, dormant until DB exists | `supabase/migrations/0001_events.sql` |

What the prototype actually does (this is the part worth demoing live):

1. **Diagnostic (Phase 1):** identical for everyone. It measures per-topic strength from answers rather than asking the student.
2. **Measured profile:** strength per topic, updated live on every answer, shrunk toward 0.5 when there's little evidence so a lucky guess doesn't spike the estimate.
3. **Personalized practice (Phase 2):** weakest topic first, rewards following the anti-comfort-zone economy. The fixed-vs-variable condition is hidden from the student and lives only in the logs.
4. **Capstone measurement:** a final strong/weak readout with the change since the diagnostic.

A "Researcher view" toggle reveals the hidden conditions and the strength math. That's the switch to flip when explaining it to you.

---

## 4. The design decisions, and where each one came from

This is the heart of the "where did you take it from, and why" question. Each row is a choice I made, its source, and the reason, so any of them can be challenged on its merits.

| Design decision | Where it comes from | Why this, and not the obvious alternative |
|---|---|---|
| Anti-comfort-zone: weak topics pay more (`base = 10 + 40·(1−strength)`) | Flow theory (Csikszentmihalyi) and the Zone of Proximal Development (Vygotsky): engagement lives just past current ability `[unverified]`. Directly operationalizes your stated core mechanic. | Ordinary gamification rewards activity uniformly, which lets students farm points in their comfort zone. Weighting toward weakness is the pedagogical point. |
| Variable (uncertain) reward, not just bigger reward | Operant conditioning: variable-ratio schedules produce the most persistent behavior (Skinner) `[unverified]`. And dopamine encodes reward uncertainty, maximal at P≈0.5 (Fiorillo, Tobler & Schultz, *Science* 2003) `[unverified: Science, citation-only]`. | A bigger fixed reward is just more points. Uncertainty is the motivational lever: it's what makes a mystery box compelling and a fixed payout forgettable. Duolingo's chests are the billion-user existence proof `[unverified]`. |
| Fixed and variable matched on expected value (E[multiplier]=1, unit-tested) | An experimental-design necessity, from the devil's-advocate review. | If variable also paid more on average, we couldn't tell whether behavior changed because of uncertainty or because of money. Matching EV isolates uncertainty as the only difference. |
| Conditions hidden from the student | Priming and demand-effects literature `[unverified]`. | Telling a student "this one is the random-reward condition" primes them and kills the effect. The label lives only in the logs. |
| Engagement (voluntary persistence) is the outcome, not points or test scores | Honest-measurement discipline: gamification reliably moves engagement, and moves learning far less reliably `[unverified]`. | Points are EV-matched, so by design they can't differentiate students. Whether the student chooses to keep going is the behavior we can actually attribute. |
| Within-subject design (each student is their own control) | Statistical power. A small age effect (gamification benefit for older adults around SMD 0.34, JMIR-Aging meta-analysis `[unverified]`) needs roughly 136 per group; we have about 20. | Between-subjects at n≈20 is underpowered and would produce a null we couldn't interpret. Within-subject rescues signal from a small pilot, and the age arm stays exploratory. |
| Strength measured, not self-reported; HEXAD (not Bartle) if we add player types; Big Five as the anchor | MBTI's weak reliability (about 50% reclassify on retest; the Barnum effect) `[unverified]`. The gamification literature explicitly recommends against Bartle and toward HEXAD (Tondello et al., 2016) `[unverified]`. | Revealed behavior beats self-report, and that is the intellectual spine. We watch how they play rather than asking them a questionnaire. |
| Age × reward-schedule hypothesis (your original contribution) | Age-related striatal D2/D3 decline and novelty-seeking decline `[unverified]`; the literature shows gamification works for people over 30, just weakly. | The claim is "wrong reward schedule for older users," not "gamification fails with age." Age is a measured covariate held out of the mechanic; baking it in would make the hypothesis circular. |
| AI designs quests, teacher approves (human-in-the-loop) | Your pivot; the layer you were most energized by (HANDOFF §3). `quest.reasoning` is a first-class DB column. | The reasoning is the artifact worth reviewing. The approval gate ∈ {proposed, approved, edited, rejected, delivered} is the workflow, not a log line. |
| Gemini Flash Tier 1 (paid) runtime; one provider-agnostic adapter; student data never routed to Chinese-hosted endpoints | Live pricing and limits verified 25 Jul; data-governance rule from HANDOFF §4a. | Free tier's roughly 5 to 15 RPM collapses under a live classroom and may train on student prompts. Tier 1 is pay-per-use, about 150 to 300 RPM, with no training clause. This needs your sign-off (about ₹500-800). |
| Supabase/Postgres over your Firebase suggestion | SQL analytics for the eventual paper dataset. | Pitched as serving the data analysis, not overruling you. Firebase stays the fallback. |

---

## 5. On the theoretical base: the honest answer to your worry

**Your concern:** you haven't read all of *Gamification for Dummies*, and it feels like the foundation is missing.

**The reframe:** the book is not the foundation. Here is the actual dependency structure:

```
Experimental design + reward economy   ← primary academic sources (below). The rigor lives here.
        │
        ▼
Gamification vocabulary (points, badges, quests, levels, leaderboards, program design)
        │  ← this is what "Gamification for Dummies" covers
        ▼
Knowledge layer: reference material the AI reads when drafting a quest   ← the book plugs in HERE, and only here
```

The book is a practitioner primer. It teaches the language and program-design steps of gamification, which is genuinely useful for the AI's knowledge layer so the AI proposes a well-formed "quest" or "badge" using conventional structure. But it is not where the anti-comfort-zone economy, the variable-reward mechanic, the hidden-condition design, or the age hypothesis come from. Those come from the primary literature. So not having finished the book does not undermine anything you've built, and the book isn't even in hand yet (it was due 23 Jul; still worth nudging for).

The gamification canon you can speak to fluently is stable and well established. Use this as the cheat-sheet:

- **PBL, meaning Points, Badges, Leaderboards** (Werbach & Hunter, *For the Win*): the baseline vocabulary. Critiquing it is the whole point, because flat PBL is exactly the comfort-zone gamification we're moving past.
- **The MDA framework** (Mechanics, Dynamics, Aesthetics): separates what you build from how it feels. Our reward engine is the mechanic; the anticipation of the mystery box is the aesthetic.
- **Self-Determination Theory** (Deci & Ryan): competence, autonomy, relatedness. This is your supervisor's own turf. The anti-comfort-zone economy is a competence play, and the future competition/leaderboard arm is a relatedness play. Framing our work in SDT terms speaks his language directly.
- **Player types:** Bartle's old scheme (killers, achievers, socializers, explorers) has been largely superseded by HEXAD (Marczewski, with Tondello's validated scale), which the literature prefers. We infer type from behavior, not a quiz.
- **Octalysis** (Yu-kai Chou): eight core drives, one of which is Unpredictability and Curiosity. That is the drive our variable-reward mechanic targets, and it maps cleanly onto the Fiorillo dopamine finding.
- **Operant conditioning** (Skinner): fixed vs. variable reinforcement schedules, where variable-ratio produces the most persistent behavior. This is the 90-year-old backbone under the shiny mystery box.

If the prof pushes on theory, start from SDT (his ground), name the specific mechanic (anti-comfort-zone as competence support), then cite the reward-schedule evidence (Skinner, then Fiorillo). That is a stronger answer than anything the Dummies book would give you.

> **One caveat to state plainly if it comes up:** whether personalized gamification actually beats generic is genuinely unsettled. Some studies find a benefit, and at least one well-run study finds no significant difference `[unverified]`. That is why this is a real test and not a foregone conclusion. We lead with the variable-reward pillar (the strongest evidence) and treat personalization as the hypothesis under test.

---

## 6. What I need from you on Monday (decisions, not updates)

These are the forks where your input actually changes the build. (The full list is in the architecture doc §7.)

1. **The Phase-1 to Phase-2 trigger:** I propose Phase 2 starts after N = 3 sessions, with at least one answered item per top-level topic. Is 3 right for your course?
2. **Skill taxonomy for Digital Transformation:** how many topics, and at what depth? I've seeded four placeholders (Digital Strategy, Data & Analytics, Change Management, Emerging Tech). I need your real taxonomy and, ideally, source material to generate MCQs from, since I currently have neither.
3. **Approval, blocking or async?** Does teacher approval gate delivery, or run approve-after-the-fact?
4. **Gemini Tier 1 spend (about ₹500-800):** approve the small runtime cost so I can architect against the real tier?
5. **A 30-plus voluntary, non-graded cohort** for the age arm: acceptable to recruit? It also removes the grade-coercion confound.
6. **Ethics/IRB timeline** for classroom telemetry: who owns it, and does it fit before mid-September? Worth raising now rather than after.
7. Confirm **hosting is Vercel** and identify the "Chinese model" from the 21 Jul call (both were garbled in the transcript).

---

## 7. What's next (so you can see the path, not just the week)

- **Weeks 2-3:** the knowledge layer (ingest *Gamification for Dummies* plus your course content into a retrieval base) and the Phase-1 backend skeleton (auth, DB, served MCQs).
- **Weeks 4-5:** the AI profiler and quest designer emitting structured JSON with reasoning, plus the server-side reward economy.
- **Weeks 6-7:** the teacher dashboard (proposals, approve/edit/reject, chat-to-redesign).
- **Week 8:** MCQ generation per session plus a review queue.
- **Weeks 9-10:** engagement/satisfaction logging hardened, plus a classmate dry run.
- **September onward:** the classroom pilot.

The prototype already collapses several of these into a client-side proof. Weeks 2 to 8 are about making it real (backend, AI, human-in-the-loop) rather than inventing anything new.

---

### Appendix: one-line answers to likely challenges

- *"Isn't this just points and badges?"* No. The economy inverts the usual incentive (weak areas pay more) and makes the reward uncertain, which flat PBL never does.
- *"n≈20 is too small."* Agreed, which is why it's a within-subject feasibility study, engagement rather than learning is the outcome, and the age arm is exploratory until cohorts pool.
- *"Can one teacher approve hundreds of quests?"* No. Production moves to pre-generated banks plus set-rules-once approval. The pilot tests whether hand-approval is even needed at pilot volume.
- *"Why not Firebase like I said?"* Postgres gives SQL analytics for the dataset, and Firebase stays the fallback. This isn't a rejection of your suggestion.
- *"Where's the gamification theory?"* SDT (competence, autonomy, relatedness) is the frame; anti-comfort-zone supports competence; the reward-schedule evidence runs from Skinner to Fiorillo. The Dummies book feeds the AI's vocabulary, not the experimental design.
