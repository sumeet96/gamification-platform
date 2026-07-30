# Consultation brief

Standing context handed to an outside advisor (see `.claude/agents/sol-consult.md`).

**This file deliberately contains no solutions of ours.** It states what is being built, what is
fixed, what constrains us, and what is unresolved. It does not describe our chosen architecture,
schema, or design decisions — a first-pass consultation has to be unanchored to be worth anything.

Keep it current. Keep it short. If a fact here goes stale, the advice built on it is wrong.

---

## What is being built

A gamified adaptive-learning web application for university students. It is the artifact of a Design
Science Research paper, and the claim it exists to support is that generative AI can be used for
adaptive learning.

## Who

- **Builder:** one MBA student, part-time, alone. No team.
- **Supervisor:** a management professor who will pilot it in his own Digital Transformation course.
- **Students:** roughly 20–100 MBA students across ~20 teaching sessions, from mid-September 2026.
- **Today is 30 July 2026.** The pilot is about seven weeks out.

## Fixed requirements — set by the supervisor, not open for redesign

- **Dashboard-first.** Games are tiles inside a dashboard that expands over iterations. The quiz is
  one part of it, not the product.
- **Points are fixed within a game, and differ across games and difficulty.** The spread between a
  cheap game and an expensive one is the intended source of a "high and low" feeling.
- **Negative marking** on wrong answers, so there is stake.
- **Each student picks exactly one adaptivity lever** and keeps it: adaptive difficulty (ramps up
  when they do well, down when they don't) *or* time pressure (the clock tightens). Never both. The
  supervisor's reason is coding complexity; the stronger reason is that with both live there is no
  way to attribute a behaviour change to either.
- **Multiple game types**, named by the supervisor: quiz with several modes, crossword, word search,
  match-the-following, fill-in-the-blanks, choose-the-right-word, watch-a-video-then-answer,
  read-an-article-then-answer.
- **All content is AI-generated from uploaded source material.** Any PDF, any subject — the system
  should not be specific to one course. No hand-written questions.
- **Comprehensibility is a hard constraint.** The supervisor's words: if it becomes too complicated
  for a participant to understand what is happening, motivation drops. Any scheme a student cannot
  predict is a failure by this standard.
- **Primary dependent variable: voluntary persistence.** Does the student choose to keep going to
  further rounds?
- **Evaluation is separate from design.** Pre/post tests and satisfaction surveys happen, but they
  must not drive design decisions.
- **Explicitly deferred by the supervisor:** teacher sign-off on generated questions, faculty vs
  student logins, and course/curriculum structure. He considers these management concerns, not the
  core artifact.

## Hard constraints

- **Time:** ~7 weeks to pilot. Total budget ~400–450 hours over six months, most of it already spent.
- **Money:** near zero. About $0–15/month for development, under $10/month at runtime.
- **Stack:** Next.js 16, React 19, Tailwind 4, Neon serverless Postgres, Vercel Hobby hosting.
- **No LLM call on the student's critical path.** Rate limits and latency would fail a live
  classroom, and one bad night from the provider takes the class down. Content is pre-generated and
  served from the database.
- **No student-derived data may be sent to any LLM.**
- **The per-question event log is the research dataset.** It must stay analysable in SQL.
- There is **one pilot**. There is no second cohort if it goes wrong.

## What exists today

- Email/password auth; the whole app is gated.
- **One game:** a quiz. Fixed points, negative marking, both levers implemented and mutually
  exclusive, two modes, and a keep-going loop between rounds.
- Per-question event logging to Postgres, with round and session markers.
- Two ingestion tools: a document router and a generated-question validator.
- Question generation from PDFs via Gemini, proven by hand on one real lecture deck.
- **No dashboard. No games other than the quiz. No automated tests of any kind.**

## Known unresolved problems

- **Model-asserted difficulty labels do not discriminate.** Confirmed on three independent samples: a
  question labelled 4 was answerable cold, and 1s and 2s were indistinguishable. The
  adaptive-difficulty lever — half the experimental design — rests on this scale.
- **Generated questions are almost entirely recall.** The model's own stated rationales read "recall
  a stated purpose," "recall a specific definition."
- **The answer key is currently sent to the browser** and scoring happens client-side.
- **The supervisor has not decided what the research variable is** once multiple games exist. He
  raised it himself and said he would plan it.
- **Nobody has established what actually stops students revising.** The design assumes the obstacle
  is motivational and that points plus variety address it. That assumption has never been tested.
