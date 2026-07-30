# Consult: content layer, generation, and difficulty calibration

**Date:** 2026-07-30
**Model:** gpt-5.6-sol (via `codex exec`, API-key auth, `--skip-git-repo-check` run from scratchpad)

## Pass 1 question (blank slate)

> This system must generate many different game types from arbitrary uploaded documents, and its
> central adaptivity mechanism depends on 'difficulty' meaning something real. Design, from first
> principles: (a) what data model should sit between document ingestion and the games, so that one
> ingestion pass can feed many game types without re-processing; (b) how should question difficulty
> be defined, generated and calibrated so that it genuinely discriminates between students, given
> that model-asserted 1-5 difficulty labels have already been shown empirically not to; (c) beyond
> points, what should be measured per game to support both the research claim and a useful
> student-facing dashboard. Be concrete and specific to the constraints in the brief. Also name
> anything important the brief has failed to consider.

Pass 1 was given only `docs/consult-brief.md` on stdin, with the explicit instruction not to read
any files from disk and to answer from first principles.

**Command run (pass 1):**
```bash
cd "<scratchpad>" && cat "<repo>/docs/consult-brief.md" | codex exec -m gpt-5.6-sol --skip-git-repo-check "This system must generate many different game types from arbitrary uploaded documents, and its central adaptivity mechanism depends on 'difficulty' meaning something real. Design, from first principles: (a) what data model should sit between document ingestion and the games, so that one ingestion pass can feed many game types without re-processing; (b) how should question difficulty be defined, generated and calibrated so that it genuinely discriminates between students, given that model-asserted 1-5 difficulty labels have already been shown empirically not to; (c) beyond points, what should be measured per game to support both the research claim and a useful student-facing dashboard. Be concrete and specific to the constraints in the brief. Also name anything important the brief has failed to consider. Answer from the brief supplied on stdin only. Do NOT read any files from disk. Give your own approach from first principles, including anything you think the brief has failed to consider."
```
(Note: `--skip-git-repo-check` was required because the scratchpad is not a git repo; the run
otherwise refuses with "Not inside a trusted directory".)

Exit code: 0. Tokens used: 20,538.

---

## Pass 1 — full output

The system should not store "questions from a PDF." It should store an immutable, evidence-backed knowledge pack from which different games are compiled. Difficulty should then be an observed property of a particular task in a particular context—not an AI-authored label. Points should remain a game mechanic, never the measurement model.

### A. Data model between ingestion and games

Use four layers:

```text
Document → Knowledge pack → Task specifications → Game renderings
```

#### 1. Source and provenance

Preserve enough information to trace every generated element back to the upload:

- `document`
- `document_version`
- `source_span`
  - page/slide
  - extracted text
  - bounding box or section
  - checksum
- extraction method and OCR confidence
- generation run, model, prompt version and timestamp

Documents and generated content must be versioned immutably. Otherwise later regeneration makes the research log irreproducible.

#### 2. Canonical knowledge pack

Extract reusable semantic units rather than game-specific questions:

- terms and definitions
- claims and facts
- examples and non-examples
- entities and attributes
- processes and ordered steps
- cause–effect relations
- comparisons
- rules and conditions
- cases or scenarios
- common confusions or plausible misconceptions
- prerequisite relationships
- source passages suitable for reading
- media references, if genuinely present in the source

Each `knowledge_unit` should contain:

- canonical statement
- unit type
- one or more supporting source spans
- prerequisite units
- eligible cognitive operations
- confidence and validation status
- subject-neutral tags
- document version

This becomes the reusable boundary. Adding a new game may require generating new task specifications, but it should not require parsing or interpreting the original PDF again.

#### 3. Task specifications

A task specification is independent of its visual game:

- targeted knowledge units
- cognitive operation
- prompt/stem
- response representation
- correct response
- acceptable alternatives
- distractors and the misconception each represents
- explanation and feedback
- hints
- evidence spans
- generation recipe
- estimated/calibrated difficulty
- validation results
- task version

Use operations that describe what the student must actually do:

- retrieve a fact
- distinguish related concepts
- interpret an example
- apply a rule to a new case
- identify an error or misconception
- order a process
- connect information across two source spans

Do not accept "Bloom level" or an AI explanation as evidence that an operation has been achieved.

#### 4. Game compiler/rendering

Game-specific records reference task or knowledge-unit versions:

| Game | Reusable inputs |
|---|---|
| Quiz | QA task, distractors, explanation |
| Crossword | term–definition pairs |
| Word search | validated terms |
| Matching | typed relations or paired units |
| Fill in the blanks | claim plus removable answer span |
| Choose the right word | cloze plus plausible alternatives |
| Video then answer | media segment plus anchored QA tasks |
| Article then answer | passage spans plus anchored QA tasks |

Store renderer payloads separately from canonical answers and scoring policy. A crossword clue, for example, may reuse the same definition that appears in a quiz without becoming the same database object.

Not every game measures knowledge equally. Word search is principally visual search and exposure; it should not update concept mastery as if it were a quiz. Crossword and matching become increasingly assisted after crossings or failed pairings. Only their first unassisted response is strong assessment evidence.

#### Minimum practical schema

The relational core could be:

- `documents`, `document_versions`, `source_spans`
- `knowledge_units`, `knowledge_unit_evidence`, `knowledge_relations`
- `task_specs`, `task_versions`, `task_unit_links`
- `game_items`, `game_item_versions`
- `generation_runs`, `validation_results`
- `difficulty_calibrations`
- `offers`, `rounds`, `task_exposures`, `attempts`, `events`
- `adaptation_decisions`

Frequently analysed values should be columns, not buried in JSON. JSONB is appropriate only for renderer-specific details.

### B. Meaningful difficulty

#### Operational definition

Difficulty is:

> The probability that a learner from the target population will answer a particular task correctly on the first independent attempt, under a stated game mode and assistance/time condition.

An item discriminates when stronger learners are materially more likely to succeed than weaker learners. A hard but ambiguous item does not necessarily discriminate.

Keep separate:

1. **Semantic difficulty:** knowledge and reasoning demanded.
2. **Interaction difficulty:** crossword crossings, matching mechanics, reading burden.
3. **Time pressure:** opportunity to complete before the deadline.
4. **Perceived difficulty:** what the student reports.

Combining these into one AI label would recreate the present problem.

#### Generate difficulty; do not ask the model to judge it

Generate item families for the same knowledge unit using controlled recipes:

- direct retrieval versus application to a new case
- one fact versus integration of several relations
- strong cue versus weak cue
- familiar example versus novel example
- obviously wrong versus near-neighbour distractors
- single-step versus multi-step inference
- presence or absence of scaffolding

The model's job is "produce an item satisfying this recipe," not "produce a level-4 item." The recipe supplies a prior difficulty estimate; student responses determine the eventual level.

Reading complexity and obscure wording should not be used to manufacture difficulty.

#### Validation before calibration

Reject tasks when:

- the answer is unsupported by the source
- more than one answer is defensible
- the stem leaks the answer
- distractors are nonsensical
- the required information is missing
- the item depends on outside knowledge
- the supposed application item is still verbatim recall
- two generated variants are effectively duplicates

A sampled human content audit is still necessary. Deferring teacher sign-off does not eliminate the validity problem; an incorrect item damages both trust and the research dataset.

#### Calibration model

With only 20–100 students and many generated items, estimating separate complex parameters for every item will be unstable. Use a regularised Rasch-style model:

P(correct_si) = logistic(θ_s − b_i + game/mode offset)

where:

- `θs` is current learner proficiency
- `bi` is empirical item difficulty
- game type, time condition and assistance are recorded separately

Initially, shrink `bi` toward the prior for its generation recipe, cognitive operation and game type. Update it offline after accumulated responses; no LLM or student data is involved.

Do not estimate free item-discrimination parameters until there are enough observations. Initially inspect simpler evidence:

- correctness increases with estimated learner proficiency
- positive item–total association
- distractors attract some lower-performing learners
- no distractor is accidentally more defensible than the key
- response time and reports do not suggest ambiguity

Retire or quarantine items that show negative discrimination, key problems, extreme timing or repeated ambiguity reports.

Difficulty calibration must use first unassisted attempts only. Hinted answers, retries and crossword answers exposed by crossings are learning evidence, not clean calibration evidence. Time-pressured outcomes must not silently recalibrate semantic difficulty.

#### Five student-facing levels

The five levels should be presentation bands derived from empirical estimates, separately by game/mode. For a reference learner, illustrative target success ranges might be:

- Level 1: 85–95%
- Level 2: 70–85%
- Level 3: 55–70%
- Level 4: 40–55%
- Level 5: 25–40%

These are not permanent item properties. Store the calibration version, sample size and uncertainty used when an item was served.

Because the pilot is small, calibrate generation recipes rather than expecting every generated item to receive enough observations. Obtain a small pre-pilot response set from representative MBA-level volunteers, then update between teaching sessions. Use conservative priors and avoid high-confidence labels for sparsely observed items.

#### Keep adaptivity comprehensible

Separate the hidden calibration process from the visible progression rule. For example:

- At the end of a round, at least 80% correct on first attempt without hints: move up one level.
- At most 40%: move down one level.
- Otherwise: stay.
- Never skip a level.

For the difficulty arm, time remains constant. For the time-pressure arm, semantic difficulty remains at a fixed middle band and the clock changes by a clearly displayed, bounded amount. Store every decision and its reason.

Scoring and answer validation must move to the server. The browser should receive only what it needs to render the current task; scoring and event insertion should occur atomically.

### C. What to measure beyond points

Points are confounded by game choice, fixed game prices, difficulty and negative marking. They measure the reward system—not mastery or engagement.

#### Universal measurements

For every offered game or round, record:

- what tiles/options were displayed, in what position
- whether the student selected, ignored or abandoned each option
- game, task and calibration versions
- selected lever and current lever setting
- difficulty estimate, uncertainty and displayed level
- time limit
- first response and first-attempt correctness
- retries, hints, reveals and skips
- active response time
- completion or abandonment
- points available, earned and lost
- adaptation decision and reason
- whether a "continue" opportunity was displayed
- accept/decline/no-response
- session ending reason: voluntary, class ended, timeout, logout or technical failure

Logging only played games creates selection bias. The system must log what was offered.

#### Game-specific evidence

- **Quiz/choose-word/cloze:** selected distractor, abstention, first response, revisions.
- **Crossword:** clue-level first entry, checks, reveals, crossings already exposed and completion order.
- **Word search:** targets found, false selections and search time; do not treat this as concept mastery.
- **Matching:** first attempted pair, incorrect pairings and repair count.
- **Video:** play, pause, seek, segment exposure and answer results. Playback is exposure, not proof of attention.
- **Article:** section exposure, active dwell and answer results. Dwell time is only a weak proxy.
- **All games:** focus loss or interruption where reliably observable, without pretending it measures attention.

Use server timestamps, idempotency keys and immutable task versions. Store option IDs rather than shipping or logging answer-key text unnecessarily.

#### Research outcomes

Define voluntary persistence before launch:

- Primary event: accepting another round after a genuine continuation offer.
- Primary summary: rounds continued before voluntary stopping.
- Suitable analysis: continuation probability or time-to-disengagement.
- Exclude or separately classify forced endings and technical failures.

Supporting measures:

- voluntary starts from the dashboard
- completion rate
- active practice time
- abandonment point
- return on later days
- challenge–skill alignment: whether performance remains in the intended success band
- response to level/time changes
- first-attempt accuracy
- hint/reveal dependence
- concept coverage
- task discrimination and calibration error

#### Student dashboard

Show interpretable measures:

- points and point history
- rounds and games completed
- practice time
- first-try accuracy
- progress by concept
- current difficulty or time-pressure setting
- a plain-language explanation of the latest change
- hints/reveals used
- recent improvement and content coverage

Mastery should be difficulty-adjusted and based on assessment-bearing first attempts, with "insufficient evidence" shown when appropriate. Avoid presenting points, word-search performance or raw time spent as mastery.

### Important omissions and threats

The most consequential gaps are:

1. **Causal identification:** students choose their lever, so the difficulty and time groups are self-selected. Their outcomes cannot be causally attributed to the lever. Without a non-adaptive comparison, the pilot can demonstrate feasibility and associations—not that adaptivity caused persistence or learning.

2. **Content validity:** teacher review may be a management concern operationally, but it is a research-validity concern. At minimum, audit a sample and provide an in-game "ambiguous/incorrect" report mechanism.

3. **Primary-variable definition:** "keep going" needs an explicit eligible offer, inactivity cutoff and treatment of class endings before data collection starts.

4. **Game comparability:** points and success rates across games do not share a common construct. Some named games are practice or entertainment activities, not assessments.

5. **Motivational assumption:** the brief acknowledges that the reason students stop revising is unknown. A handful of short pre-pilot interviews is more valuable than adding another unvalidated reward mechanic.

6. **Document safety and quality:** arbitrary PDFs introduce OCR failure, tables, prompt injection embedded in documents, copyrighted material and unsupported claims.

7. **Media provenance:** "watch a video" is underspecified. The system needs a lawful source, transcript, accessibility support and exact linkage between answer and media segment.

8. **Research governance:** consent, ethics approval, pseudonymisation, retention, export and deletion rules are absent.

9. **Accessibility and device constraints:** timers, crosswords, drag matching and negative marking can disadvantage some students and behave differently on mobile.

10. **Pilot reliability:** no automated tests, browser-side answers and a single unrepeated pilot are a larger immediate threat than the absence of additional games.

For the seven-week horizon, I would prioritise the canonical knowledge pack, server-side scoring, trustworthy telemetry, one calibrated assessment family, a simple dashboard and automated end-to-end tests before maximizing the number of game types.

---

## Pass 2 question (what did we miss)

Sol was given the same brief plus the team's actual plan (content layer with `mcq` /
`term_definition` / `passage` primitives; PDF-only generation via Gemini Files API in 3-page
windows; the `resolveLever(config, streak)` adaptivity design; named-cognitive-level difficulty with
p-value calibration against 5-6 pilot volunteers; static published points table; the metrics list;
and the daily-Wordle retention feature) and asked what is wrong with it, what was missed, and where
it disagrees with pass 1.

**Command run (pass 2):**
```bash
cd "<scratchpad>" && cat "<scratchpad>/pass2_input.txt" | codex exec -m gpt-5.6-sol --skip-git-repo-check "Here is the same problem, plus the plan its team actually intends to commit to. What is wrong with it, what did they miss, and where does your own earlier answer disagree? Be specific and concrete. Do NOT read any files from disk."
```
(`pass2_input.txt` contained the brief plus the plan text, verbatim as supplied by the user, no
other files.)

Exit code: 0. Tokens used: 18,204.

---

## Pass 2 — full output

The plan is not commit-ready. It contains several good implementation ideas, but it does not resolve the two existential risks: whether the "difficulty" manipulation is real, and what causal/research claim the pilot can support. It also leaves the known scoring vulnerability untouched and is far too broad for one builder in seven weeks.

### What is wrong

1. **Cognitive level is not difficulty.**

"Recall → application → discrimination → deduction → transfer" is a task taxonomy, not a validated ordered hardness scale. A recall question about an obscure detail may be harder than an application question with an obvious answer. Levels 4–5 also invite unsupported inference beyond the uploaded material.

The generator may label these more consistently than arbitrary 1–5 ratings, but that does not establish increasing empirical difficulty. The plan has renamed the problem, not solved it.

2. **Five or six people cannot calibrate the item bank.**

If "p-value" means item facility—the proportion answering correctly—each item may receive only five observations. An observed 40% could mean 12–77% with enormous uncertainty. Calibration also will not transfer reliably across subjects or cohorts.

Worse, adaptive delivery selectively exposes items to students. Difficulty estimates from those responses are confounded by which students received which items. The small rehearsal can test comprehension, plumbing, and grossly broken items; it cannot calibrate a five-level adaptive scale.

3. **The content primitives do not support the promised games.**

`term_definition` is enough for basic matching and perhaps crossword clues. It is not a sufficient representation for:

- Fill-in-the-blanks: sentence/context, blank position, acceptable variants, normalization rules.
- Choose-the-right-word: contextual sentence, candidate set, correct choice, distractor rationale.
- Word search: eligible normalized word, display form, length and character constraints.
- Crossword: answer normalization, multiword handling, clue variants and board feasibility.

Likewise, "video/article then answer reads `mcq`" omits the actual article/video asset, transcript, segment or passage association, release rules, and question-to-evidence link. The `passage` primitive is introduced but apparently consumed by no game.

"One ingestion forever" is therefore false. New game mechanics will require new derived content. The durable layer should be retained source pages/chunks plus provenance, allowing regeneration without uploading the PDF again.

4. **The page-window scheme gives false provenance confidence.**

Assigning the loop's page number proves which window was prompted, not that the question is supported by that page. Three-page windows also miss concepts spanning windows and create duplicates around boundaries.

Each generated item needs a supporting evidence span or quote that can be checked against extracted page text. Other missing checks include semantic correctness, ambiguous answers, duplicate questions, distractor quality, OCR failures, diagram-dependent questions, and cross-window coverage.

5. **"Both levers unrepresentable" is overstated.**

`resolveLever` returns both `difficulty` and `timeLimit`. Nothing in that shape prevents both from changing across calls. Two example tests do not enforce a historical invariant.

More importantly, `streak` is underspecified:

- What counts as a streak?
- When does it reset?
- What are the thresholds, floors, ceilings, and hysteresis?
- How is oscillation prevented?
- Is the selected lever immutable on the server?
- How are accommodations handled?
- What settings and policy version are logged for every exposure?

Item-versus-board adaptation also produces different numbers and timings of adaptation opportunities, complicating comparison across games.

6. **Difficulty is undefined for most games.**

The proposed cognitive labels describe questions, not crossword, word-search, or matching-board difficulty. Those depend on grid size, directions, word length, clue directness, number of pairs, ambiguity, and similar mechanics.

Every game needs a concrete, student-comprehensible mapping from difficulty state to mechanics. Otherwise the shared `difficulty` number is only a common variable name.

7. **The known scoring defect is not fixed.**

The plan says nothing about moving scoring and timer enforcement to the server. This is a pilot-blocking issue.

The server must authoritatively store the presented item/order, accept an idempotent answer submission, compute points and negative marking, and append the event. Stable option IDs should be shuffled per attempt; an answer index should never be exposed to the browser.

8. **The research question remains unresolved.**

A metric list is not a research design. The plan still lacks:

- Primary hypothesis and estimand.
- Unit of analysis.
- Comparison condition.
- Exact definition of voluntary persistence.
- Treatment/exposure definition once students choose among games.
- Handling of students self-selecting their adaptivity lever.
- Handling of game choice, point value, game novelty, and difficulty as confounders.

Because students choose the lever, comparisons between lever groups are observational, not causal. Multiple games, differing rewards, and an unlevered daily game make attribution still harder.

9. **Several proposed metrics cannot support their claimed interpretations.**

- Per-topic measures require a stable topic taxonomy, which the schema does not provide.
- Selecting a distractor does not identify a misconception unless distractors are explicitly misconception-coded and validated.
- "Improvement over time" is invalid if later items, topics, and exposure difficulty differ; anchor items or a defensible model are needed.
- `days_active / days_available` needs defined enrollment, release, weekends, censoring, and absence rules.
- Voluntary persistence requires logging every explicit opportunity to continue and the accept/decline outcome. App closure, timeout, content exhaustion, and network loss are not equivalent to declining.

### The retention feature is especially problematic

The Wordle proposal is a new intervention, not merely a measurement instrument. Daily gating, scarcity, shared puzzles, streak loss, and no catch-up can themselves drive or suppress return behavior. That makes return impossible to attribute cleanly to adaptive learning.

It also has practical defects:

- Terms may be multiword, contain punctuation, or have unsuitable lengths.
- Shared answers can be circulated between students.
- Missed days measure scheduling constraints as much as motivation.
- No catch-up prevents persistence rather than observing it.
- An unlevered game muddies what selecting an adaptivity lever means.
- One puzzle per day imposes an artificial ceiling on persistence.

If retained, it should be treated as a separately identified intervention and analysed separately—not used to repair the primary outcome.

### What they missed operationally

The seven-week delivery plan has no prioritisation, freeze date, or fallback. It proposes a dashboard, roughly seven additional games, new generation, a schema migration, adaptivity infrastructure, Wordle, analytics, and security work while starting from zero automated tests.

At minimum, it also needs:

- Critical-path end-to-end tests for login → play → server scoring → event logging → continue/stop.
- Ingestion fixtures and regeneration/versioning tests.
- Append-only event IDs, content version, generator version, policy version, presented option order, resolved settings, and prior-state snapshots.
- Pilot content review by the builder, even if faculty sign-off remains deferred.
- A CLI/admin path for loading and replacing pilot content since upload UI is deferred.
- Database export/backup and pilot-night recovery procedures.
- Load rehearsal, mobile/browser testing, accessibility, timer visibility, and timezone handling.
- Consent, pseudonymisation, data retention, researcher access, and ethics/IRB treatment.
- A short formative study of why students currently stop revising. The central motivational assumption is still untested.

A credible seven-week commitment would secure scoring and logging first, freeze the research design, validate one difficulty policy, deliver the dashboard, and add only the smallest number of genuinely distinct games needed for the pilot.

### Where my earlier answer disagrees

I cannot honestly compare this with "my earlier answer" because that answer is not present in the supplied conversation. If you mean the consultation stored in `.claude/agents/sol-consult.md`, reading it would violate your explicit instruction not to read disk files.

My current position clearly disagrees with any earlier recommendation that treated cognitive-level labels as an adequate difficulty solution, 5–6 people as meaningful item calibration, `term_definition` as a universal five-game primitive, or daily Wordle as a clean measurement of retention. Those claims should be withdrawn or substantially qualified.

**Note on pass-2 session:** each `codex exec` invocation starts a fresh session with no memory of
pass 1's session, so pass 2's "where my earlier answer disagrees" section correctly states it cannot
see pass 1's actual text. In practice pass 2 independently re-derives criticisms consistent with
pass 1 (e.g. that cognitive-level labels don't equal empirical difficulty, that small samples can't
calibrate a five-level scale, that `term_definition` is too thin a primitive) rather than literally
cross-referencing it. That consistency is itself informative — two independent Sol runs converged on
the same substantive objections.
