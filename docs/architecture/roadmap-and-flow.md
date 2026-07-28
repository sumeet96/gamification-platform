## ⚠️ Superseded — 28 Jul 2026

This document describes the Phase 1 → Phase 2 trigger and the variable-reward experiment that were planned before 27 Jul 2026. On 27 Jul the supervisor pivoted to a simpler gamified adaptive-learning dashboard. **This document is now a historical record and does not describe the built system.**

See `docs/architecture/2026-07-28_architecture-as-built.md` for the system as actually implemented.

---

# Roadmap and App Flow: Visual Companion

Two canonical diagrams for the AI-Personalized Gamification project. Companion to `2026-07-27_architecture-and-model-comparison.md`. Renders on GitHub.

---

## 1. Build roadmap (phase / week)

Where the project is and where it goes. Week 1 is done, and the interactive prototype was built ahead of schedule: the reward economy and two-phase loop already exist client-side, and weeks 2 to 8 turn that into the real backend, AI, and human-in-the-loop system.

```mermaid
gantt
    title AI-Personalized Gamification Build Roadmap
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    todayMarker off

    section Foundation · Wk 1
    Architecture doc + model pick                         :done, f1, 2026-07-21, 6d
    Interactive prototype (2-stage loop, reward economy, logging) :done, f2, 2026-07-23, 5d

    section Data + AI · Wk 2-5
    Knowledge layer (RAG: Gamification book + course)     :b1, 2026-07-28, 14d
    Phase-1 backend skeleton (auth, DB, served MCQs)      :active, b2, 2026-07-28, 14d
    AI profiler + quest designer (JSON + reasoning)       :b3, 2026-08-11, 14d
    Anti-comfort-zone + variable-reward economy (server)  :b4, 2026-08-11, 14d

    section Human-in-the-loop · Wk 6-7
    Teacher dashboard: proposals + approve/edit/reject    :h1, 2026-08-25, 14d
    Chat-to-redesign                                      :h2, 2026-08-25, 14d

    section Content + pilot prep · Wk 8-10
    MCQ generation per session + review queue             :c1, 2026-09-08, 7d
    Engagement/satisfaction logging + classmate dry run   :c2, 2026-09-15, 14d

    section Pilot · Sept+
    Classroom pilot, Digital Transformation course        :milestone, p1, 2026-09-29, 0d
```

Two meanings of "phase," which shouldn't be conflated:
- Build phases are the roadmap sections above (Foundation, then Data+AI, then human-in-the-loop, then Pilot).
- Student phases are Phase 1 (the identical diagnostic baseline) and then Phase 2 (AI-personalized), switched per student by the trigger (in production, N=3 sessions with at least one item per top-level topic). This is shown in the flow below.

---

## 2. End-to-end app flow (with edge cases)

The full student journey plus the production human-in-the-loop path. The amber nodes are the edge cases you'd otherwise miss.

```mermaid
flowchart TD
    Start([Student starts]) --> Entry["Entry: name + age bracket"]
    Entry --> D

    subgraph P1["PHASE 1 · Diagnostic, identical for all"]
      D["Answer diagnostic MCQ"] --> Measure[/"live strength update<br/>(share correct, shrunk to 0.5)"/]
      Measure --> Dmore{"more diagnostic<br/>questions?"}
      Dmore -- yes --> D
    end
    Dmore -- no --> Profile["Profile: measured strengths"]

    Profile --> Trig{"Phase-2 trigger met?<br/>prod: N=3 sessions,<br/>1+ item per topic"}
    Trig -- "not yet" --> D
    Trig -- yes --> Build

    subgraph P2["PHASE 2 · Personalized practice, multi-round"]
      Build["Build round: weakest topic first<br/>fresh items, then missed as REVIEW"] --> Q["Show question"]
      Q --> A{"Answer?"}

      A -- "correct + FRESH" --> Cond{"condition?<br/>(hidden from student)"}
      Cond -- variable --> Roll[["mystery-box roll<br/>big + uncertain"]]
      Cond -- fixed --> Flat[["flat reward<br/>small + predictable"]]

      A -- "wrong + FRESH" --> Miss["no reward → add to MISSED"]
      A -- "REVIEW correct" --> Master["mastered → cleared from review<br/>(no points, no measurement)"]
      A -- "REVIEW wrong" --> Keep["stays in review<br/>(comes back next round)"]

      Roll --> NextQ
      Flat --> NextQ
      Miss --> NextQ
      Master --> NextQ
      Keep --> NextQ
      NextQ{"more questions<br/>this round?"} -- yes --> Q
    end

    NextQ -- no --> RoundEnd["Round end: live strengths + up/down vs diagnostic"]
    RoundEnd --> More{"items remaining?"}
    More -- "fresh remain" --> Cont["keep practicing?"]
    More -- "only missed remain" --> ContR["review weak areas?"]
    More -- "nothing left<br/>(all cleared + mastered)" --> Results

    Cont -- yes --> Build
    ContR -- yes --> Build
    Cont -- "stop (voluntary)" --> Results
    ContR -- "stop (voluntary)" --> Results

    Results([" Results: final strong/weak<br/>delta vs baseline + engagement "])

    subgraph PROD["Production only · AI + human-in-the-loop"]
      QD["AI quest designer<br/>(async background job)"] --> Reason["proposal + reasoning (JSON)"]
      Reason --> Teacher{"Teacher review"}
      Teacher -- "approve / edit" --> Deliver["deliver to student"]
      Teacher -- reject --> QD
    end
    Build -. "prod: questions come<br/>only from approved queue" .-> Deliver
    Deliver -.-> Q

    classDef edge fill:#5c3a00,color:#fff,stroke:#c77e12,stroke-width:1px;
    class Miss,Master,Keep,ContR,More,Teacher,Trig edge
    classDef done fill:#14351f,color:#eaf7ef,stroke:#2e7d62;
    class Results done
```

### Edge cases captured (checklist)
- A wrong fresh answer earns no reward, and the item enters the MISSED pool.
- A review re-attempt keeps the weak topic in rotation: correct means mastered and cleared, wrong means it stays, and neither pays points nor moves the measurement.
- Once the fresh pool is exhausted, rounds become Review-only ("Review weak areas").
- When everything is cleared and mastered, the loop stops honestly (in production it would AI-generate fresh items).
- A voluntary stop at any round end is itself the engagement dependent variable.
- If the Phase-2 trigger isn't yet met, the student stays in the baseline.
- In the production human-in-the-loop path, AI proposals are async and the teacher can reject one (which loops back to the designer), so only approved quests reach a student. MCQs are pre-generated and DB-served, which keeps it rate-limit-proof.
- The hidden condition (fixed or variable) is never shown to the student; it appears only in the researcher view and the logs.
