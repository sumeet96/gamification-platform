# Pre-meeting brief — Tue 4 Aug 2026, Prof. Singh

> **This is a brief written BEFORE the meeting. It is not a transcript and records no decisions.**
> Nothing in this file may be cited as a professor decision. Record the meeting; the outcome goes in
> a separate transcript file in this folder.

**Time to pilot: ~6 weeks** (pilot starts ~mid-Sept 2026).

---

## 1. The one question (get this decided — 20 min)

**Now that the adaptive-difficulty lever is dropped, what varies between students?**

The difficulty-vs-time split *was* the independent variable. If every student gets time pressure,
there is no between-arm contrast — an instrumented app, not an experiment. This is upstream of every
other build decision.

Don't ask it open-ended. Ask him to pick:

| | Contrast | Cost / catch |
|---|---|---|
| **A** | Time pressure **on vs off** | Cleanest between-subjects. Half the cohort gets the duller build. |
| **B** | **Rapid vs normal** mode | Everyone gets pressure, intensity varies. Weaker contrast; needs the seconds pinned. |
| **C** | **Within-subject** alternation (both arms per student) | More power at n=60–120. Carryover / order effects. |
| **D** | **Bring difficulty back** as the lever | Restores the original design. Tagging is no longer the blocker it was — see box below. |

**Put D on the table.** He dropped difficulty because tagging was hard. Since then the calibration
pipeline works: items are calibrated by making a small local model *attempt* them at four ability
levels and taking the failure rate. That may be new information to him.

**Whatever he picks:** any motivational overlay (XP bar, leaderboard) must be **identical across all
arms**, or it becomes a confound instead of a constant.

### Also: record the decision

The lever-drop has **no transcript**. Project rule is that professor decisions cite a transcript in
`docs/meeting/`. Ask to record, or write it up and send it back for confirmation.

---

## 2. Decisions only he can make (20 min)

1. **Points table sign-off** — current values are placeholders. Points are fixed within a game,
   varying across games and difficulty, as he asked. He just needs to approve the numbers.
2. **Rapid = 10s, normal = 15s?** — assumed, unconfirmed. It also **collides with the time lever**:
   if rapid mode pins the timer for everyone, a time-lever student in rapid mode has an inert lever.
3. **His actual Digital Transformation decks.** Live bank is 34 term items + 17 MCQs. Students
   already see repeats — that is arithmetic at this bank size, not a bug. More decks is the fix, and
   only he can hand them over. **Most concrete, most actionable ask of the meeting.**
4. **Leaderboard + XP bar** — planned, never discussed with him. Flag the identical-across-arms
   constraint when raising it.
5. **Recall vs application for term games.** For public professional vocabulary (`Agile Manifesto`,
   `User Story`, `Standup Meeting`) no recall item can require the deck — a competent model answers
   them cold. That is a property of the subject matter, not a generation defect. Argues term games
   should test *application*, the way the quiz's reasoning MCQs already do.
6. **Expectation-setting: r ≈ 0.5, not 0.75–0.82.** The high figure in the literature is
   NAEP-mathematics-MCQ only. Reading-comprehension-style domains land near 0.5–0.7. Better said
   before the pilot than after.

---

## 3. Demo script (8 min, no more)

> "Dashboard first, because that was your first instruction — the quiz is one tile in it, not the
> product. Three games are playable: quiz, match-the-following, choose-the-right-word. Scoring is
> server-side, and every question, round, and continue-or-stop decision is logged as the research
> dataset."

Then: dashboard → quiz round → match board. Stop.

**Do NOT demo or narrate:** the generator, the two-stage glossary rewrite, difficulty calibration,
the item-gap screen, the band-count analysis. It is the best work of the last week and it will eat
the entire meeting. One sentence if asked: *"the item pipeline is built and screened; happy to go
deep on it next week."*

---

## 4. If he asks "why doesn't it look better / where are the charts?"

Honest answer, and it is a real one:

> "Stats visuals are next, but they're blocked on the same question the whole design is. Anything a
> student sees about their own performance can differ by arm — so building the charts before the
> contrast is decided risks building a confound I'd then have to tear out."

Against what was actually asked — *"a dashboard kind of a thing where quiz is one part of it"* — the
structure is delivered. The gap is depth, not direction.

---

## 5. Leave the meeting with

- [ ] The contrast decided (A / B / C / D)
- [ ] The lever-drop on record
- [ ] Points table approved
- [ ] Rapid/normal seconds confirmed
- [ ] His course decks, or a date for them
- [ ] Leaderboard + XP: yes/no
