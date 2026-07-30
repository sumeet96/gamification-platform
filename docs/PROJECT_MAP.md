# Project map

Written 29 Jul 2026, from a re-read of the **primary source**: `docs/meeting/Jul 27 at 3-39 PM.txt`
(whisper transcript of the Prof. Singh call), not the summaries derived from it.

This file is the spine. `docs/CURRENT_STATE.md` is where a session stops; `HANDOFF.md` is history;
this is the decomposition and the work-package list. It replaces `docs/PROJECT_BACKLOG.md`.

---

## 0. Corrections to the working brief

Re-reading the transcript surfaced five places where `CLAUDE.md` and the derived memory notes drift
from what the prof actually said. These are not nitpicks — three of them change the build.

**C-1. The point economy is not flat.** `CLAUDE.md` says "Fixed point economy: +20 correct, −10
negative marking" as a global rule. The transcript says both of these things:

> "points will get fixed. For example, every question, there is 20 points."

> "all of them will have different states. Some will be easier, will give them less points, some
> will be harder, will give them more points and **that feeling of high and low, that variability
> will be created**."

They resolve cleanly once you see the scope: **points are fixed *within* a game, and vary *across*
games and difficulty.** The variability the prof wants — the thing replacing the abandoned
mystery-box — comes from playing a hard crossword worth more than an easy quiz. A flat 20 everywhere
deletes the mechanic he actually asked for. This is the single most consequential miss.

**C-2. The difficulty label is shown to the student.**

> "we show them a difficulty level. We say we are giving you easy difficulty right now."

The difficulty scale is not an internal parameter — it is a visible promise. Our confirmed finding
that difficulty labels don't discriminate is therefore worse than a dataset problem: the app tells a
student "this is hard" when it isn't. Ranked #1 already; this raises the stakes.

**C-3. Course material is not a prerequisite for building.**

> "You can start with any book, right? Find any PDF on any topic doesn't matter... You can take even
> an 11th/10th standard book which you can find a PDF online maybe."

The previous backlog listed "get decks from Prof. Singh" as blocking the content pipeline. It isn't.
It blocks the *pilot*, not the *build*. That unblocks a large amount of work immediately.

**C-4. The dashboard is the spine; the quiz is a tile in it.**

> "you need to have a dashboard kind of a thing where quiz is one part of it... start with the
> dashboard, right? ...as we go on, that dashboard will keep on expanding."

There is currently **no `app/dashboard/`**. The app is `game-setup → quiz → results` with a home
page. The first thing he asked for is the thing least built.

**C-5. The next meeting is Tuesday 4 Aug, not Monday 3 Aug.**

> "next Monday I am travelling. Okay, next Monday I am not here. But Tuesday we can do, Tuesday we
> can do same time."

`CLAUDE.md` says "Next: **Mon 3 Aug 2026**." Worth confirming, but the transcript is explicit.

**Also worth carrying forward** — a design constraint the prof stated as a first principle, which
should govern every multi-game decision:

> "if it becomes too complicated to understand what is happening, the motivation goes down... they
> will be like, okay, I got 20 points now, but 35 with this question, this question I knew, why did
> I get only 15?"

Comprehensibility is a hard constraint, not a nice-to-have. Any points scheme a student cannot
predict is a design failure by his stated standard. Note the tension with C-1: points must vary
across games *and* remain predictable. The resolution is a **published, visible points table** —
varying but never surprising.

---

## 1. The multi-game architecture

### The reduction that makes seven games tractable

The prof named these games: crossword, word search, match-the-following, fill-in-the-blanks,
choose-the-right-word, quiz (3–4 modes: rapid round, normal progression), and
watch-video / read-article-then-answer.

Building seven generation pipelines in seven weeks is not possible. Building seven **renderers over
three content primitives** is.

| Primitive | Shape | Games it powers |
|---|---|---|
| `term_definition` | a term + its clue/definition | crossword, word search, match-the-following, choose-the-right-word, fill-in-the-blanks |
| `mcq` | stem + 4 options + answer index | quiz (all modes), article-then-answer, video-then-answer |
| `passage` | a chunk of source prose (+ optional media URL) | article-then-answer, video-then-answer; also the provenance anchor |

```
source doc ──generate──> content_items (typed, normalized, provenance-stamped)
                                │
        ┌───────────────┬───────┴────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
      quiz          crossword        word search      match / fill / choose
   (mcq)         (term_definition) (term_definition)  (term_definition)
```

**Five of the seven games read the same primitive.** `term_definition` is roughly as easy to generate
as MCQs and has no answer-position bias problem at all. Generating it is a variation on the generator
already specced in `docs/architecture/generator-spec.md`, not a new pipeline.

This matches the "normalized content_items layer" already sketched in earlier sessions — now grounded
in the transcript rather than assumed.

### The lever, and what it means per game

**DECIDED 30 Jul: per-game lever semantics (option b).** The goal right now is measuring engagement,
retention and learning — not defending a single tidy construct in the paper. Richer per-game
adaptivity buys more engagement surface, and that is what we are here to measure.

**What "the lever" is.** The student picks one adaptivity mechanism at setup and keeps it:

- **adaptive difficulty** — correct makes the next item harder, wrong makes it easier. Time is fixed.
- **time pressure** — the clock tightens as they do well (10 → 8 → 5s, floor 5). Difficulty is fixed
  at whatever they chose.

**Never both at once.** The prof's reason was coding complexity. The stronger reason is attribution:
with both live, a wrong answer gives no basis for deciding which knob to turn, and no way afterwards
to attribute a behaviour change to either one.

**Verified 30 Jul — the current quiz enforces this in four places:** the `Lever` union type makes
both unrepresentable (`lib/game/engine.ts:10`); difficulty only ramps under `adaptive`
(`app/quiz/page.tsx:100`); difficulty is pinned to `config.fixedDifficulty` under `time` (`:133`);
and the countdown neither runs (`:112`) nor renders (`:185`) unless the lever is `time`.

**What varies per game is not *whether* adaptation happens but *when it can*.** Some games are a
stream of items, so the lever can fire between items. Others are one board shown whole, so the
earliest it can fire is the next board.

| Game | Granularity | Difficulty knob | Time knob |
|---|---|---|---|
| Quiz — normal | item | next question ±1 difficulty | per-question clock 10→8→6→5s |
| Quiz — rapid | item | next question ±1 difficulty | same clock; rapid is *length*, see below |
| Choose-the-right-word | item | distractor distance: obvious → near-synonym | per-item clock |
| Fill-in-the-blanks | item | word bank shown → hidden; term obscurity | per-item clock |
| Match-the-following | **board** | next board: 4 pairs → 6; distractors get closer | whole-board timer 90→60→45s |
| Wordle | **board** (1/day) | `lever: 'none'` — see §1.4 | — |

Read the two knob columns as *the one that is live*. Exactly one is active, chosen by the student's
lever; the other sits at a constant. A match-the-following board timer does **not** tighten for a
difficulty-lever student, and the fill-in-the-blanks word bank does **not** get hidden for a
time-lever student.

### Rapid mode is round length, not clock speed

`roundLength()` returns 10 questions for rapid and 20 for normal (`lib/game/engine.ts:30-32`). The
transcript is ambiguous — "one could be a rapid round, one could be a normal progression" reads
naturally as *fast* — but the mutual-exclusion rule settles it. If rapid meant a tighter clock, a
difficulty-lever student playing a rapid round would have adaptive difficulty **and** time pressure,
which is exactly the collision we are ruling out. **Locking rapid = fewer questions.** Confirm with
the prof, since he used the word "rapid."

### The resolver — how mutual exclusion survives five games

Today the rule holds via four hand-written `if (config.lever === ...)` branches in one file. Across
five or six games that becomes 25-plus branches, and a single missed one silently produces a
both-levers student whose data looks perfectly normal.

The fix removes the class of bug rather than the instances. **Games never branch on the lever at
all.** The engine resolves it once and hands each game two values:

```
resolveLever(config, streak) → { difficulty, timeLimit }
```

Exactly one varies with performance; the other is a constant. A game consumes what it is given and
has no way to ask which lever is active, so it cannot honour both. Each game declares one difficulty
knob and one time knob; the engine decides which is live.

This belongs in package **K** and is the reason K must land before any game work starts.

**Two tests lock the invariant**, and they are the first tests this project will have:

1. 20 answers under `adaptive` → `timeLimit` never changed.
2. 20 answers under `time` → `difficulty` never changed.

### Negative marking

Per-item games (quiz, match, fill, choose) carry negative marking — a wrong answer is a discrete,
attributable event. Wordle does not: a miss is simply zero. Should crossword or word search arrive
later, they score on completion rather than penalty, since penalising a mistyped letter punishes
exploration, which is what those games are for.

### The points table

**DECIDED 30 Jul: build the varying-points machinery now, set the actual numbers with the prof.**

C-1 says points vary across games; the comprehensibility constraint says a student must be able to
predict them. Both are satisfied by a **static, published table** shown in the dashboard — no hidden
computation, no per-student variation.

**Every number below is a placeholder pending Prof. Singh's sign-off.** The machinery is real; the
values are not.

| Game | Correct | Wrong | Notes |
|---|---|---|---|
| Quiz — normal | +20 | −10 | the established baseline |
| Quiz — rapid | +20 | −10 | same rate; rapid is a shorter round, not a harder one |
| Match-the-following | +15/pair | −5 | |
| Fill-in-the-blanks | +15 | −5 | +25 with the word bank hidden |
| Choose-the-right-word | +15 | −5 | |
| Wordle | +40 down to +10 by guess count | 0 | solved in 2 pays most; a miss is zero |

The high/low feeling the prof described comes from the spread — a fill-in-the-blank at +15 against a
two-guess Wordle at +40 — visible, predictable, never mysterious.

**Open for the prof:** should rapid pay more than normal? Now that rapid means fewer questions
rather than less time, there is no obvious reason it should. Left at parity until he says otherwise.

### 1.4 Wordle — the retention instrument

**DECIDED 30 Jul: in scope for the pilot. Five words per deck, one puzzle per day, ~4 weeks.**

This measures something nothing else in the design can. The round loop measures persistence *within*
a session. Wordle's mechanic — one puzzle a day, no catch-up — measures return *across days*, which
is retention proper. Over a four-week pilot that is a daily engagement signal we would otherwise
have no way to capture.

- **Supply:** one deck = one lecture. A prof teaches 1–4 times a week, realistically ~6 lectures
  across a 4-week window. 5 words per deck × 6 decks = 30 words ≈ 28 days at one per day. **The bar
  is 5 usable words per deck, not 30** — a low bar almost any lecture deck clears.
- **Word length:** relax strict five-letter Wordle to **4–8 letters**. *AGILE, CLOUD, PIVOT, SCALE,
  ASSET* exist but five-letter course terms run out fast; 4–8 makes the 5-per-deck bar comfortable.
- **Words must be distinct across decks.** Core terms recur across lectures in the same course, so a
  deck should yield ~8 candidates to reliably pick 5 unused ones. Keep a used-word list.

**The real risk is supply timing, not supply volume.** The decks do not exist yet — the prof teaches
them *during* the pilot. So the 30 words cannot be generated up front. The pipeline has to run
week by week: lecture happens → deck arrives → words extracted → they feed the next few days. Three
consequences:

- Generation must run **reliably every week during the pilot**, not once beforehand. That moves the
  generator from a build-time tool to a live operational dependency.
- A cancelled lecture, a late deck, or a failed run means **a gap day** — and a gap day silently
  breaks the streak mechanic, which is the retention signal we are building this for.
- Therefore keep a **buffer of at least 7 unused words** at all times, and decide what the game
  shows on a gap day. Recommendation: fall back to an unused word from an earlier deck rather than
  showing nothing, and log that it was a fallback.
- **Same word for everyone, same day.** Matches real Wordle, and gives an identical stimulus on an
  identical day for clean between-student comparison.
- **Unlevered** (`lever: 'none'`). One board per day means the lever would fire 24 hours apart,
  which is not adaptivity in any meaningful sense. Its job is retention, not adaptivity. This is why
  the game registry needs `'none'` as a legal lever value.
- **Scoring on guess count.** No negative marking; a miss is zero.
- **No catch-up on missed days.** The scarcity is the mechanic, and a missed day is the clearest
  retention signal in the dataset. Log the miss.
- **Add a streak counter.** Nearly free to build and it is the other half of why Wordle retains.

**Scheduling consequence:** a four-week daily mechanic means the dashboard must be live and stable
four weeks before the pilot ends, not two.

**WARNING added 30 Jul after `sol-consult` — the strongest finding in the report.**

**Wordle is an intervention, not a neutral measuring instrument.** Daily gating, streak loss and
no-catch-up are *designed* to drive return behaviour. Using it to measure retention therefore
contaminates the thing being measured: a rise in daily return may be the mechanic working on the
student rather than evidence about the artifact's persistence claim. Both consult passes reached
this independently.

Consequences, none of which cancel the game:
- Wordle return data is analysed as a **separate treatment**, never folded into the primary
  voluntary-persistence claim (which rests on the round loop).
- Students who play Wordle differ from those who don't in ways the design does not control.
- Worth raising with the supervisor, since it touches the research variable he still owns (§2.5).

Keep building it — it is good for students and it produces a real behavioural signal. Just do not
let it become the retention evidence.

### 1.5 The platform: live ingestion, subject-agnostic

**DECIDED 30 Jul.** The target is not a Digital-Transformation tool. Any professor — strategy,
marketing, anyone — uploads material and gets every game type generated from it. This matches what
the prof described: "based on that material should be uploaded behind, and some book or something
people upload, based on that it can be designed."

**Live ingestion, not live generation.** A professor uploads, generation runs in the background,
content lands in the DB. Students are served pre-made content. The existing rule stands: **no LLM
call on the student's critical path.** Generating during play would fail a classroom on rate limits,
latency and cost, and one bad night for Gemini takes the class down.

**Input is PDF.** Professors export from PowerPoint themselves. LibreOffice is gone from the
pipeline — full rationale in `docs/architecture/generator-spec.md`. This is what makes live upload
feasible on a serverless host at all, since the LibreOffice binary cannot run there.

**Multi-tenant data model now; single-tenant operator surface until after the pilot.** The prof
explicitly deferred faculty login, courses and course structure — "we are not building a portal,
it's just for experimentation." Multi-professor *is* that. So:

Build now, because reversing it later is expensive:
- `sources` table (document record: subject, uploader, checksum, status) and a subject/course id on
  `content_items` from day one
- the generator as a callable library, `(pdf, subject) → primitives`, never hardcoded to a course
- one ingestion pass emits **every** primitive type, so a new game needs no re-ingestion
- zero course-specific logic in any game

Defer, because it costs nothing to add later:
- upload UI, job queue, status screens, faculty login

Rationale for deferring: the pilot needs ~6 decks ingested. Running the generator by hand six times
costs about an hour. Building the self-serve version costs 2–3 of the 7 weeks and improves the pilot
by nothing.

**If a background worker is needed later** (scheduled generation, self-serve upload), GitHub Actions
is the near-zero-cash option, with known failure modes to design around: scheduled workflows
auto-disable after 60 days of repo inactivity; failures notify only by email to the repo owner;
secrets live separately from `.env.local`, so a rotated key breaks the worker silently while local
keeps working. During the pilot a silent failure means a gap day, which breaks the Wordle streak,
which is the retention signal — so any worker needs an in-app health signal, not just an email.

### 1.6 Difficulty as cognitive level — proposed fix for R1

**PROPOSED 30 Jul, not yet decided. Under review by `sol-consult`.**

Source: a gamification talk (transcript in this session) arguing that points and badges are "a
surface crutch," and that the real teaching mechanic is *cognitive* — never handing over the answer,
opening a small gap between what the learner knows and what is next, and letting them deduce across
it.

Held against our own output, this names the problem we have measured three times. Every question the
generator produced on 29 Jul was independent recall. The model's own rationales say so: "recall a
stated purpose outright," "recall a specific definition," "recall a financial figure stated
outright." **Recall questions have no real difficulty range** — you either remember a fact or you
don't — so asking a model to score them 1–5 is asking it to invent a number. That is why the labels
do not discriminate.

**The proposal: stop asking for a difficulty number, ask for a named cognitive level.**

1. Recall a stated fact
2. Apply a definition to a new instance
3. Discriminate between two similar concepts
4. Deduce from incomplete information
5. Transfer to a case not present in the material

These differ in *kind*, not in a model's guess about hardness. "Write a question requiring the
learner to apply this definition to an unseen case" is a structural instruction a model can follow;
"write a difficulty-4 question" is not. Empirical p-value calibration (R1) still happens — but it
would be calibrating a scale that means something.

**Known tension: deduction chains and adaptive difficulty fight each other.** If questions 1–4 form a
chain where each is solvable only because the previous one eliminated an option, the sequence *is*
the mechanic and cannot be reordered by performance. A chain has to be a fixed-order unit that the
lever moves *between*, not within — structurally the same as the board granularity already defined
for match-the-following.

**Honest caveat:** generating genuine deduction chains at scale from arbitrary PDFs is far harder
than the hand-crafted example in the talk. The five-level taxonomy is the cheap, high-confidence part;
chains are speculative until tested.

**REVISED 30 Jul after `sol-consult`** (`docs/consults/2026-07-30-content-layer-and-difficulty.md`).

Sol's objection, and it holds: **a cognitive taxonomy is not a hardness ordering.** A recall question
about an obscure fact can be harder than an "apply" question with an obvious answer. Bloom-style
levels describe what kind of thinking a task demands, not how many students get it right. Numbering
them 1–5 and calling that difficulty renames the problem instead of solving it.

But the objection only kills half the proposal, and the surviving half is the more important one.
The measured defect was that **every generated question was recall** — there was no variance for any
scale to discriminate. Asking for a named cognitive level is a structural instruction a generator can
actually follow, so it produces genuinely varied task types. That fixes the real problem whether or
not the types are ordered by hardness.

**So the position is now:**
- Cognitive level is a **generation control** — a dimension we deliberately vary to get item
  diversity. It is stored as a label, not as an ordinal difficulty.
- **Difficulty is empirical, and only empirical.** It comes from observed facility, never from a
  label anyone asserts — not the model's, not ours.
- The two are separate columns. Conflating them is what broke the current design.

### 1.7 Metrics — what gets measured, per game

Points are not the dataset. Three families, all logged through the K-3 event contract.

**Learning**
- Per-topic accuracy → a strength/weakness map. `topic` already exists on questions, so this is
  nearly free and drives a real dashboard feature.
- Accuracy by cognitive level (if §1.6 is adopted) → reveals a student who can recall but not apply.
- Improvement per topic over time → the actual learning signal.
- First-attempt vs repeat accuracy → spaced-repetition signal.

**Engagement and retention**
- Rounds per session — the supervisor's stated DV.
- Return rate: days active / days available. Wordle gives this cleanly.
- Streak length.
- Which games a student chooses when free to pick — becomes a *measured behaviour*, and bears
  directly on the supervisor's open research-variable question (§2.5).
- Time-of-day patterns.

**Per game**
- Quiz — difficulty trajectory, answer-time distribution, streak.
- Match-the-following — pairs correct on first try, reshuffles.
- Fill-in-the-blanks — performance with vs without the word bank.
- Choose-the-right-word — distractor confusion matrix.
- Wordle — guesses to solve, solved/failed, missed days.

**The gap worth fixing now:** `events` logs `is_correct` but **not which option the student chose**.
Adding `selected_option` costs one column and unlocks misconception analysis — if 70% of a cohort
picks distractor C, that is a specific, nameable wrong belief the professor can teach against. That
is a stronger paper finding than most engagement metrics, and it is currently discarded on every
single answer. **Goes into K-3.**

**Leaderboard — an open decision, not a feature.** In SDT terms it is a relatedness play, which is
the supervisor's own research turf, so he will have a view. But public ranking of students carries
ethics implications and could confound the persistence DV. Ask; do not build.

---

## 2. The project, exploded

Nine categories. The one that matters most is §2.7 — assumptions never confirmed — because that is
where this session's misses actually lived.

### 2.1 Decided and built (verified working)

- Auth: email+password, gated app, `proxy.ts` deny-by-default, `events.student_id` from the session
  cookie. Exercised end to end against live Neon 28 Jul.
- Quiz loop: `app/game-setup` → `app/quiz` → `app/results`. Fixed points, negative marking, both
  levers, rapid/normal modes, keep-going loop.
- Event logging: `events` table, per-question grain, round and session markers. `round_stop` emits
  one shape as of commit 404f2cb.
- DB: Neon, `db/schema.sql` + migrations 001, 002 applied and verified live.
- Ingestion tools: `scripts/inspect-source.mjs` (routing), `scripts/validate-questions.mjs`
  (rejection + deterministic shuffle). Both proven against a real deck.
- LibreOffice PPTX→PDF export, exact command verified (26 slides → 26 pages).
- Front end: "Aurora glass" visual language.

### 2.2 Decided, specced, not built

- Per-window generator — full spec at `docs/architecture/generator-spec.md`.
- `db/003` question provenance (`slide`, `generator_model`).
- Validator extracted into an importable module so "nothing reaches the DB unvalidated" is structural.

### 2.3 The game roster

The prof named eight games. He said *what*, not *how*; §1 is the design pass.

**In scope for the pilot (decided 30 Jul):**
quiz (normal + rapid), match-the-following, fill-in-the-blanks, choose-the-right-word, Wordle.
Four of the five read `term_definition`; all but Wordle carry a lever.

**Named by the prof, deferred past the pilot:** crossword, word search (both need grid generation
and layout — the most expensive work in the project), article-then-answer, video-then-answer (both
need a `passage` primitive and, for video, a media source we do not have).

Deferring crossword and word search is a scope decision, not a rejection — the prof described them
most vividly and shared his screen to show a word search. They come back after the pilot.

### 2.4 Explicitly deferred by the prof

Quoted, so nobody re-litigates them:

- **Teacher sign-off on questions** — "Eventually we will have to build all of that... for now we
  can skip that." Manual for the pilot.
- **Multi-login (student/faculty)** — "we can skip that complexity for now."
- **Course structure** — "Maybe we can skip the course part altogether because we are not building
  a portal, it's just for experimentation."
- **Teacher combined dashboard** — later.
- **Both levers at once** — "Both will keep last."

### 2.5 Unknown — the prof owns it

**The research variable for the multi-game design.** He raised it and closed the meeting on it:

> "it would be more of different things, different things gamified that would be shown to the
> student and they can interact with any one or each of them and then we decide on the scores.
> **Okay, that is something I have to work on and I will plan it accordingly.**"

Until this lands we do not know whether students see all games (making game *choice* a measured
behaviour) or are assigned to games (making game type a *condition*). It changes the dashboard, the
event schema, and the paper. **This is the single highest-value question for Tue 4 Aug.**

Settled, so it does not need re-asking: the artifact is DSR — "show that the generative AI can be
used for adaptive learning" — and pre/post tests plus surveys are evaluation, deliberately separate
from design. The surviving DV is voluntary persistence: "does the student keep on going to further
rounds."

### 2.6 Unknown — we own it

- **Empirical difficulty calibration.** No facility data exists yet. **Revised 30 Jul after
  `sol-consult`:** calibrate **generation recipes**, not individual items. A recipe is a knowledge
  unit × task type × cue strength; pooling responses across every item sharing a recipe makes
  estimates usable far sooner, and a new item inherits its family's prior. Update continuously
  across the pilot rather than freezing a number beforehand.
- **The pilot-of-the-pilot cannot calibrate anything, and never could.** At n=5–6 an observed 40%
  facility carries a confidence interval of roughly 12–77%, and adaptive delivery means different
  students see different items, confounding it further. Its real job is smoke-testing: catching
  broken questions, confusing UI and wrong scoring before real students arrive. Still worth doing —
  just not for this.
- **The points table** (§1) — needs prof sign-off but we propose it.
- **P-1 and P-2** (negative marking and lever semantics for puzzle games).
- **Per-game difficulty definitions.**
- **Which model produced the 29 Jul output** — `GEMINI_MODEL` was empty; the defect rate is
  currently unattributable to any tier.
- **Real free-tier rate limits** — Google no longer publishes them; read per-project in AI Studio.
- **Lever assignment is self-selection, not randomization.** The student *picks* adaptive-difficulty
  or time-pressure — the prof's design ("we can let them choose also"). Students who choose time
  pressure may differ systematically from those who choose difficulty, so any between-lever
  comparison is confounded by that choice. Either name it explicitly as a limitation in the paper or
  randomize and drop the choice. Needs a supervisor conversation; it is a methods decision, not a
  build task.
- **Shared-device protocol.** None exists. Affects `student_id` attribution in the event log.
- **Retention and backup** for the Neon dataset across the pilot window.

### 2.7 Assumed but never confirmed — the dangerous category

Every one of these was operating as fact in `CLAUDE.md` or in a session's working memory without
being traced to the transcript. This category is why the project drifted.

| Assumption | Reality |
|---|---|
| Points are flat +20/−10 everywhere | Fixed *within* a game, varying *across* games (C-1) |
| Difficulty is an internal parameter | It is **displayed to the student** (C-2) |
| Course material blocks the content pipeline | "Find any PDF on any topic doesn't matter" (C-3) |
| Quiz is the product, dashboard is a view of it | Dashboard is the spine, quiz is one tile (C-4) |
| Next meeting is Mon 3 Aug | Transcript says Tuesday (C-5) |
| ~20 students | Prof said ~100 capacity planning; cohort size unconfirmed |
| Pilot is the Digital Transformation course | Likely, but the transcript decouples content from the course |
| **The obstacle to revision is motivational** | **Never tested.** The whole design assumes students don't revise because it's dull, and that points plus variety fix it. The real blocker could be time, no immediate feedback, or a distant exam — in which case gamifying changes nothing. Good question for the supervisor, who has taught this cohort. |
| Model-asserted difficulty is a usable scale | Disproved on three samples. See §1.6 for the proposed replacement. |

**Standing rule going forward:** anything in this project stated as a prof decision cites the
transcript, or is marked as our inference. The summaries are lossy; the transcript is the source.

### 2.8 Known-broken

- Answer key ships to the browser; scoring is client-side (`app/quiz/page.tsx` compares `i === q.answer`).
- Difficulty labels do not discriminate — confirmed on three independent samples.
- Abandoned rounds reuse a round number (`session.roundsPlayed` never increments on quit).
- Adaptive difficulty saturates at 5 and resets each round — the treatment vanishes mid-experiment.
- Cosmetic ToS checkbox sits beside the real research-consent checkbox.
- Signup collects `phone`, `gender`, `education`, `learningGoals` that nothing reads.
- Quiz badge reads "Level 5"; should read "Difficulty 5/5".
- `generate-questions.mjs` falls back to `gemini-2.0-flash`, shut down 1 Jun 2026.
- Zero automated tests of any kind.
- `lib/game/questions.ts` seed bank could silently serve non-course questions during a pilot *(unverified — read it)*.
- `clsx` and `tailwind-merge` are unused in `package.json` since `cn()` was deleted.
- The DOCX and PDF source paths have never been exercised end to end — only PPTX.
- `events` does not record **which option the student picked**, only whether it was right. Every
  answer discards the misconception data (§1.7). Fix in K-3.
- Generated questions are almost entirely recall, which is why difficulty labels cannot
  discriminate (§1.6).

### 2.9 Out of scope

Parked from the pre-pivot design and not to be revived without a decision: variable/mystery-box
rewards, anti-comfort-zone economy (weak topics pay more), age × reward-schedule hypothesis,
HEXAD/personality typing, Phase-1/Phase-2 N=3 trigger. Also: mathematics rendering (deferred),
`.ppt`/`.doc` support, Cursor and Emergent as tools.

---

## 3. Work packages for parallel sessions

### Freeze three contracts first — this is the whole game

Disjoint sessions only recombine cleanly if they agree on interfaces they cannot see each other
change. **Three contracts must be frozen before any parallel work starts.** They are small — a
single focused session — and everything else depends on them.

- **K-1 `content_items` + `sources` schema. DECIDED 30 Jul — shape below.**

**Two primitives, not three.** `passage` is dropped: no pilot game consumes it, and the games that
would (article/video-then-answer) are deferred past the pilot. Do not add a type nothing reads.

**Enriched, not re-architected.** Sol was right that bare `(term, clue)` cannot actually feed five
games — but its three-layer knowledge-unit model is the over-building this project has already been
burned by. Add the missing fields to one table instead.

**Derive, don't store.** A word's normalised form (uppercase, punctuation stripped — for Wordle and
word search) and its word count are pure functions of `term`. Compute them in code; storing them
creates two things that can disagree.

`sources` — one row per uploaded document:
`id`, `subject`, `title`, `filename`, `checksum`, `page_count`, `uploaded_by`,
`status` (`pending|processing|ready|failed`), `created_at`.

`content_items` — shared columns, then type-specific ones, nullable and guarded by a CHECK per kind.
Sparse columns cost nothing in Postgres and keep the dataset queryable in plain SQL, which is a hard
research constraint that a `payload jsonb` blob would break.

| Column | Applies to | Why |
|---|---|---|
| `id`, `source_id`, `subject`, `topic`, `page`, `created_at` | all | provenance; `topic` drives the strength/weakness map (§1.7) |
| `kind` | all | `mcq` \| `term_definition` |
| `cognitive_level` | all | `recall\|apply\|discriminate\|deduce\|transfer`. **A generation control, not a difficulty ordering** (§1.6). |
| `recipe` | all | groups items generated the same way, so facility can be pooled across a family — this is what makes recipe-level calibration possible (§2.6) |
| `empirical_p`, `p_responses` | all | observed facility and how many responses it rests on. **The only difficulty that exists.** Null until data arrives. |
| `generator_model` | all | which model wrote it; the paper needs this |
| `stem`, `options`, `answer` | mcq | |
| `term`, `clue` | term_definition | `clue` is the crossword clue, the match target, and the Wordle hint |
| `example_sentence` | term_definition | a sentence containing the term — **this is what fill-in-the-blanks blanks out**. Nullable; without it that game skips the item. |
| `variants` | term_definition | other acceptable answers (abbreviations, plurals). Cannot be derived. |
| `distractors` | term_definition | near-miss terms for choose-the-right-word and match-the-following. Cannot be derived. |

Note `empirical_p` and `cognitive_level` are **separate columns on purpose**. Collapsing them is
exactly the mistake that produced a difficulty scale which does not discriminate.
- **K-2 The points table + game registry.** One module: game id, display name, primitive consumed,
  points per outcome, `adaptGranularity: 'item' | 'board'`, and `lever: 'both' | 'none'`. Dashboard
  reads it, every game reads it, scoring reads it. Values are placeholders pending the prof.
- **K-3 The event-emitter signature.** One `logGameEvent(...)` covering all game types, so every
  game logs comparably and the dataset stays analysable. Extends the existing `events` table
  additively with `game_type` already present. Must carry `adapt_granularity` and `boards_completed`
  so analysis can tell *the lever never fired* apart from *the lever fired and did nothing*.
- **K-4 `resolveLever(config, streak) → { difficulty, timeLimit }`.** The engine resolves the active
  lever once and pins the inactive knob. Games consume the result and never branch on `lever`, so
  both-levers-at-once collapses from ~25 scattered branches into one tested function. **Not
  literally unrepresentable** — the return type does not forbid both values varying; only the
  implementation and its tests do (conceded to `sol-consult`, 30 Jul). Ships with the two
  invariant tests in §1.

Until K-1..K-4 land, parallel game work will conflict. After they land, packages below are disjoint
by file ownership.

### Package table

Each package owns its files exclusively. "Do not touch" is as important as "owns".

**Status legend:** ✅ done · 🟡 partial · ⬜ not started · 🔒 blocked on a person

| WP | Status | Package | Owns | Depends on | Pri |
|---|---|---|---|---|---|
| **K** | ✅ **DONE** 30 Jul | **Contracts** — `content_items` + `sources` schema (subject-scoped), points/game registry, event columns, `resolveLever` + invariant tests. **Migrations applied and verified live** against project `ancient-brook-62806105`: 2 tables, 20+9 columns, 5 new `events` columns, 6 CHECKs, 3 indexes. | `db/003`, `db/004`, `lib/games/registry.ts`, `lib/game/engine.ts`, `tests/lever.test.ts`, `tests/registry.test.ts` | — | **P0, first** |
| **G1** | ⬜ | Generator: MCQ per-window. **Spec written** (`docs/architecture/generator-spec.md`) — build is next. Must write `content_items`, not `questions`. | `scripts/`, `scripts/lib/` | K-1 ✅ | P0 |
| **D1** | ⬜ | Dashboard shell — points display (gross / net / activity), game tiles. **The professor's first instruction; `app/dashboard/` does not exist.** | `app/dashboard/`, `app/page.tsx` | K-2 ✅ | **P0** |
| **Q1** | ⬜ | Quiz hardening — server-side scoring, kill the answer leak, fix round reuse, refactor onto `resolveLever` | `app/quiz/`, `app/api/questions/`, new scoring route | K-3 ✅ | **P0** |
| **G2** | ⬜ | Generator: `term_definition` extraction — including `example_sentence`, `variants`, `distractors` | `scripts/lib/` (new file only) | K-1 ✅, G1 | P0 |
| **A0** | ⬜ | **Wordle supply check** — extract terms from one deck; confirm ≥8 usable 4–8 letter candidates so 5 distinct ones can be picked | `scripts/` (throwaway) | G2 | P1, cheap |
| **A1** | ⬜ | Game: match-the-following. **Open:** are its points per pair or per board? The type does not say. | `app/games/match/`, `lib/games/match.ts` | K ✅, G2 | P1 |
| **A2** | ⬜ | Game: fill-in-the-blanks | `app/games/fill/`, `lib/games/fill.ts` | K ✅, G2 | P1 |
| **A3** | ⬜ | Game: choose-the-right-word | `app/games/choose/`, `lib/games/choose.ts` | K ✅, G2 | P1 |
| **A4** | ⬜ | Game: Wordle — daily word, streak counter, no catch-up, gap-day fallback | `app/games/wordle/`, `lib/games/wordle.ts`, `db/005` (daily schedule) | K ✅, G2, A0 | P1 |
| **G3** | ⬜ | Adversarial critique pass over drafts — the only thing that catches an arithmetic contradiction | `scripts/lib/` (new file only) | G1 | P1 |
| **Q2** | 🟡 | Quiz modes — rapid/normal exist. Confirm "rapid" with the prof; flip `enabled` as games ship. | `lib/game/engine.ts` | K-2 ✅ | P1 |
| **R1** | ⬜ | Difficulty calibration — **recipe-level**, not per item. Schema is ready (`recipe`, `empirical_p`, `p_responses`); needs the recompute script and real response data. | `db/`, `scripts/calibrate.mjs` | K-1 ✅, real event data | **P0** |
| **E1** | ⬜ | Event-log audit + analysis queries + export | `scripts/analysis/`, `docs/` | K-3 ✅ | P0 |
| **T1** | Tests — validator first, then scoring | `tests/` | Q1, G1 | P0 |
| **O1** | Ops — `GEMINI_MODEL`, Vercel deploy, error visibility | `.env.local`, config | — | P0 |
| **W1** | Paper — DSR method write-up, design-cycle record, literature | `docs/literature/`, `docs/` | — | P1 |

A1/A2/A3 are near-identical in shape (one primitive, one interaction, one scorer) and are the best
candidates to run as three simultaneous sessions. A4 (Wordle) is unlike the others — daily
scheduling, streaks, no lever — so it wants its own session and its own head.

Crossword and word search are deferred past the pilot (§2.3) and have no package here.

### Session brief template

Any session picking up a package should be handed exactly this, so it needs no other context:

```
Package:        <WP id and name>
Owns:           <exact file paths — create or modify only these>
Do not touch:   <files owned by other packages, especially the K contracts>
Contract:       <the K-1/K-2/K-3 interfaces it must conform to, quoted>
Acceptance:     <a command to run and the expected output>
Line ceiling:   <per file>
Read first:     docs/PROJECT_MAP.md §1 and §2.7, docs/CURRENT_STATE.md
```

---

## 4. Decisions needed, and from whom

**From Prof. Singh (Tue 4 Aug):**
1. **The research variable for multi-game** — he owns it and said he would plan it. Highest value.
2. Sign-off on the points table (§1) and the high/low spread.
3. Paid Gemini Tier 1 — reframed: the whole corpus costs ~$1.42, so it is a consent decision about
   his unpublished material, not a budget one.
4. Cohort size and whether the pilot is the DT course specifically.
5. Ethics/consent ownership and timeline.

6. **Does "rapid round" mean fewer questions or less time?** We have locked it to fewer questions
   because a faster clock would collide with the difficulty lever (§1). He used the word "rapid," so
   confirm.
7. Should rapid pay more than normal? At parity for now.

**Decided by Sumeet, 30 Jul — closed, do not re-litigate:**

- Lever semantics: **per-game (option b)**, with granularity declared per game.
- Both levers at once: **never**, enforced structurally via `resolveLever` (K-4).
- Points: **varying table**, machinery built now, values set with the prof.
- Pilot roster: **quiz + match + fill + choose + Wordle**. Crossword and word search deferred.
- Wordle: 5 words per deck, one per day, ~4 weeks, unlevered, no catch-up.
- Platform: **live ingestion, subject-agnostic, PDF input**. Multi-tenant schema built now; upload
  UI, job queue and faculty login deferred until after the pilot (§1.5).
- LibreOffice is **out of the pipeline**. Professors export their own PDFs.

**From us, with data:**
9. Difficulty calibration (R1) — needs the pilot-of-the-pilot scheduled by week 2, not week 4.

---

## 5. Suggested sequence

**Now → Tue 4 Aug:** package **K** (all four contracts) and **O1**. Prepare the prof questions in §4.
K is the one thing that must not be parallelised, and everything waits on it.

**Week of 4 Aug:** parallel — **G1**, **D1**, **Q1**. Three disjoint sessions, no shared files.
Dashboard first honours the prof's actual first instruction (C-4).

**Weeks 2–3:** **G2**, then **A0** (the cheap Wordle feasibility count), then **A1/A2/A3** as three
parallel sessions. **R1** scaffolding, and schedule the pilot-of-the-pilot with real humans.

**Weeks 4–5:** **A4** (Wordle), **G3**, **E1**, **T1**. Run the pilot-of-the-pilot; calibrate
difficulty. Wordle needs four weeks of daily play, so it must be live by the start of week 4 at the
latest — earlier if the pilot window is tight.

**Weeks 6–7:** freeze features. **E1** audit, **O1** deploy hardening, **W1** write-up.

**Standing risk:** R1 needs 5–6 humans who are not Sumeet. It is the item most likely to be
discovered as impossible too late.
