# Games and content findings

Moved verbatim out of `CLAUDE.md` on 7 Aug 2026, where it was consuming launch-time context on
every session. This is reference material — game-family analysis, the crossword/Connections
decision and its measurements, the relation-harvest failure classes, and the per-package build
entries. Read it when working on game selection or content generation.

The chronological version of the same history is `HANDOFF.md` §15-§20; this file is the
findings view. Where they disagree, HANDOFF is the record of what happened and this is the
record of what was concluded.

---

- **Seven packages shipped: G1 (generator, 31 Jul), G2 (term/definition generator, 1 Aug), D1
  (dashboard, 31 Jul), Q1 (quiz hardening, 31 Jul), A1 (match-the-following, 1 Aug), A3
  (choose-the-right-word, 1 Aug), A5 (Connections, 7 Aug — full record in `HANDOFF.md` §20).**
  `app/dashboard/page.tsx` drives its tiles from
  `GAME_REGISTRY`; `scripts/generate-questions.mjs` writes `content_items` plus `source_excerpt`;
  `scripts/generate-terms.mjs` + `scripts/lib/terms-validate.mjs` extract `term_definition`
  primitives, unblocking match-the-following, fill-in-the-blanks, choose-the-right-word, and Wordle
  (all four consume that primitive and were blocked on zero rows); `app/api/answer/route.ts` scores
  server-side off the DB answer key and the client bundle no longer ships it. Migrations `db/005` and
  `db/006` are applied and verified on Neon project `ancient-brook-62806105`. Tests **10 → 18**,
  `tsc --noEmit` clean, `npx next build` succeeds.
  - _Validator lesson, 1 Aug 2026:_ G2's first clue-leak rule tested each word of a multi-word term
    independently, so a clue for "Minimum Viable Product" was rejected for containing the ordinary
    word "product" — it rejected 5 of 8 valid items. Fixed: single-word terms leak on any inflection;
    multi-word terms only leak if the clue contains every content word. Yield went from 3 items to 13
    on the same deck. General lesson: an over-rejecting guard is not automatically the safe
    direction — it can silently destroy yield the same way an under-rejecting one lets bad data
    through. See the standing convention below.
  - _Wordle's viability is now in doubt, 1 Aug 2026 (package A0):_ 0 of 13 terms extracted from the
    Thoughtworks deck are single words of 4-8 letters — management terminology is phrasal ("Lean and
    Agile Delivery Model"); the one single word, "Inception", is nine letters. Run A0 against a second
    deck before dropping Wordle, but the reason likely generalises: a case study yields a taxonomy of
    terms, not a lexicon of words.
    - _Settled and generalised 5 Aug 2026 — the corpus has a 9-cell floor in CANONICAL form._
      Measured across all 136 domain strings in the live bank (34 terms + 102 distractors, spaces and
      punctuation stripped): **none is ≤8 cells**, range 9–35, median ~21, exactly one single word.
      Replicated on a second deck, so A0's "run it against another deck" is discharged.
      `scripts/spike-short-terms.mjs` then tested whether that floor was a PROMPT artefact by
      re-running the glossary pass with a clause explicitly asking for short and single-word
      canonical names: **2 decks × 2 arms, 59 concepts, zero at ≤8 cells.** Short canonical terms
      cannot be prompted into existence — the material does not contain them. Wordle, Strands and
      the NYT Mini are dead on canonical forms and stay dead; they cannot use the fragment escape
      below, because their whole answer must be one short word.
      - _Independently corroborated by the supervisor, 4 Aug 2026_
        (`docs/meeting/Aug 4 at 3-31 PM.txt`): "in MBA curriculum or business context, usually
        phrases are used instead of five to eight letter words". Same conclusion reached from
        domain knowledge that the 136-string measurement reached from data — which is the strongest
        form this finding can take, and it is also where the "explore crossword" steer came from.
  - **Game families: letter-constrained vs semantics-constrained (5 Aug 2026).** A game is
    letter-constrained when the answer is a letter string and geometry decides validity (Wordle,
    Spelling Bee, Letter Boxed, Strands, the Mini, crossword); semantics-constrained when the answer
    is a selection or a relation and letters never matter (Connections, and every game shipped so
    far — quiz, match, choose-word). The corpus's 9-cell floor is fatal to the first family and
    irrelevant to the second. **Spelling Bee and Letter Boxed are additionally disqualified for
    having no clue channel at all** — there is nowhere to put a definition, so the valid answer set
    is decided by letter combinatorics and the game cannot carry curriculum. That is not a
    pool-size problem and more decks do not fix it.
  - **Entry length is NOT the crossword blocker — fragments and constituent expansion solve it
    (5 Aug 2026, user's insight, adopted).** A grid entry need not be the canonical term. (a) Any
    content word can be the entry with the clue carrying the rest: EMPATHY(7), STANDUP(7), SLICE(5),
    PRIORITY(8), LEAN(4), CAGE(4), DEMAND(6), TRADE(5) — roughly a third of the bank reaches ≤8
    cells, the same ratio as a working published puzzle (6 of 22). (b) A framework with named parts
    becomes several short entries clued by position: CAGE → CULTURAL(8) / ADMINISTRATIVE(14) /
    GEOGRAPHIC(10) / ECONOMIC(8); Build-Measure-Learn → BUILD(5) / MEASURE(7) / LEARN(5). This is
    better pedagogy than asking for the framework's name, and management education is dense with
    such constructs (SWOT, PESTEL, Five Forces, 4Ps, 7S). **Consequence: a crossword clue is a
    contextualizing device, not a standalone definition** — it gets enumeration and framing
    scaffolds ("the C in CAGE") that an MCQ clue cannot use. The residual problem is **fragment
    collisions** (CAGE claimed by 3 terms, ANALYSIS by 5, STORY/MAP/AGILE by 3 each), which is a
    board-selection constraint of the same shape as match's "a board never spans two subjects" rule,
    not a content defect. Full detail and the collision table: `docs/architecture/game4-rfc-prompt.md`.
  - **Game 4 was Connections. DECIDED 6 Aug, SHIPPED 7 Aug as package A5** (`HANDOFF.md` §20). The
    RFC (`docs/architecture/game4-rfc-prompt.md`) went to five model families and all five chose it;
    it is length-irrelevant by construction, reuses the whole board-game machinery (tokens, board
    dedupe, board selection, board scoring, board timing), and tests taxonomy rather than recall —
    which attacks the standing memorisation confound, since public vocabulary like `Agile Manifesto`
    scores ~1.00 ungrounded. Its hard part is trap-category generation: a board with more than one
    valid partition is broken.
    - _Superseded caution, kept because its reasoning still binds:_ this bullet used to say "do not
      start building either until §5.2 of the RFC (the between-arm contrast) is settled". A5 shipped
      **without** that being settled, which is exactly why it carries `lever: 'none'` and produces no
      experimental data. The caution was not wrong — it was accepted as a cost. A crossword remains
      the harder case for a clock, being slow and non-linear.
    - **UNREPORTED DIVERGENCE, 7 Aug:** the 4 Aug transcript has the supervisor saying "crossword,
      explore crossword" and the user answering "that is the only thing I would be working on now".
      The RFC then chose Connections and A5 shipped it. The choice is well-evidenced; the change of
      direction has not been communicated. See `HANDOFF.md` §20.
    - **Crossword's sharpest open objection (crossing density) is spike-verified RESOLVED — 7 Aug
      2026.** §7.1 asked: "with crossing density this low, is a crossword meaningfully different
      from fill-in-the-blanks arranged decoratively?" `scripts/spike-crossword-density.mjs`
      implements the exact greedy-placement-with-random-restarts algorithm §6 already analysed in
      published generators (sort longest-first, search every candidate letter against the grid,
      test the perpendicular placement both orientations, score `intersections×10 − area`, keep the
      best of 100 random restarts) and runs it against the REAL live bank (`content_items` where
      `kind = 'term_definition'`) instead of reasoning from the four published-puzzle comparisons
      alone. Fragment extraction follows §4.2's already-settled method (any content word, 3–10
      cells) verbatim — not re-decided.
      - **Three scales, all clear the RFC's own cited freeform-generator floor of <25% fill:** full
        live bank (134 terms → 179 fragments, **179/179 placed, 46.5% fill**); largest single
        `source_id` — one lecture deck, the real board grain (33 terms → 30 fragments, 28/30
        placed, 43.5% fill, 2 orphaned); smallest single source (9 terms → 20 fragments, 17/20
        placed, 44.6% fill, 3 orphaned). Orphaned fragments per board are a board-construction
        problem (supplement from an adjacent topic or drop), not a placement failure.
      - Fragment collisions reproduced the RFC's own table exactly (AGILE, STORY, MODEL claimed by
        multiple terms) — confirms the extraction is right, and confirms collisions remain a
        board-selection concern only: a placer needs one instance of each unique string, and which
        term's clue attaches to it downstream never blocked a placement in any run.
      - **What this does NOT resolve** — still open per §7.1/§5: the mobile viewport (finding 5, a
        dense grid is still far below minimum touch target and needs pan-and-zoom plus a
        focused-clue banner), difficulty without an MCQ rendering (§5.3), and whether time pressure
        survives a slow, non-linear solve (§5.2/§5.4). This spike answers one question, not the RFC.
      - **This is a narrow, targeted feasibility check, not a re-run of the five-model RFC or a
        rebuild of Connections** — `docs/CURRENT_STATE.md`'s "do not redo" entry refers to those,
        and neither happened. Connections stays shipped as-is; the user's scope decision (7 Aug) is
        crossword ships as an additional `GAME_REGISTRY` tile, not a replacement.
      - Data: `spike-data/crossword-density.json` (full bank), `spike-data/crossword-density-
        source33.json`, `spike-data/crossword-density-source9.json`.
      - **Lever stance, decided by the user, 7 Aug 2026: `lever: 'both'`, declared but left
        unconsumed until a crossword-appropriate mechanic is designed** — not `'none'` like
        Connections. Rejected the simpler `'none'` path deliberately: `'none'` forecloses the game
        as a study arm structurally and permanently, even after the between-arm contrast (the
        AGENTS.md top blocker) is resolved, whereas `'both'` keeps crossword symmetric with
        quiz/match/choose-word and leaves the door open. **The trap this creates and must not be
        walked into:** `resolveLever()` is the single chokepoint every game is supposed to consume
        (`lib/game/engine.ts`) — if crossword ships `enabled: true` while declaring `'both'` but
        never actually reading the resolved `(difficulty, timeLimit)`, any event logged for it
        would misrepresent a lever as active when nothing enforced it, corrupting the research
        data exactly the way a client-supplied score would. **Do not set `enabled: true` on the
        crossword registry entry until the mechanic genuinely consumes `resolveLever()`** — ship
        it `enabled: false` (matching Wordle's current precedent) through however much of the build
        happens before that design work lands. §5.2's objection (crossword is slow and non-linear;
        a 90s board clock or 10s item clock is nonsensical for it) and §5.3's (no MCQ rendering to
        hang the difficulty calibrator on) are UNCHANGED by the density spike — a crossword-shaped
        clock and a crossword-shaped difficulty source are still fully open design problems, not
        solved by declaring the capability.
      - **Mobile viewport recommendation (not yet built):** even the smallest measured single-deck
        board (24 columns) is ~16px/cell at a 390px screen — under a usable touch target at every
        board size tested, so pan-and-zoom with a focused-cell viewport plus a separate clue banner
        (RFC finding 5) is required regardless of board-size capping, not an edge case. Cap boards
        to single-`source_id` grain — the real board unit, ranging 9-33 terms live, producing grids
        in the 20x10 to 32x12 range rather than the RFC's 38-column worst case. Buildable with CSS
        transforms and React state; no new dependency needed.
    - _RFC answered 6 Aug 2026 — five model families (ChatGPT via API and Playground, Claude, Gemini,
      DeepSeek, Grok) ALL chose Connections._ Weigh that against a real caveat: the brief was written
      with §7.1 (crossword) as a list of open problems and §7.2 (Connections) as a list of settled
      advantages, and the system message fixed the justification order as learning/research/build —
      the order in which Connections wins. The verdict is theirs, the framing was ours. Effort
      estimates spread 7× (Gemini 30–40h, Claude 215–285h); the spread is entirely whether the
      content-generation pipeline and human review were counted. **Three of five independently
      recommended hand-authoring boards for the pilot and building the pipeline afterwards** — that
      is the convergent recommendation and it removes both the biggest work block and the biggest
      correctness risk.
    - **CORRECTION, 6 Aug 2026 — do NOT use `distractors` as board tiles.** The bullet above says
      they become "trap material"; that is wrong and was caught in review. Distractors are
      *generated* (never selected — see G2 above), i.e. fabricated strings. Every tile on a board
      carries an implicit assertion that it is a real concept, so a student who successfully sorts a
      fabricated term learns it as real. Use them OFFLINE as a confusability signal for choosing
      which *real* terms to co-locate, and never render them. A distractor may only become a tile if
      the source independently supports it, and then it must be minted as its own `content_items` row
      with provenance.
  - **Connections' learning-value claim is OVERSTATED — measured 6 Aug 2026.** The reason to prefer
    Connections was that partitioning requires the material's own structure where recall does not.
    `scripts/spike-connections-solve.mjs` tests exactly that: give a model the 16 shuffled tiles and
    nothing else — no deck, no excerpt, no labels — and see whether it recovers the partition. On
    three hand-curated boards, 10 trials each:

    | board | `gemma2:9b` | `gpt-4.1-nano` | `gpt-4.1-mini` | `gpt-5-nano` |
    |---|---|---|---|---|
    | b2 change/process | 40% | 20% | 100% | **100%** |
    | b1 data/AI | 20% | 10% | 70% | **100%** |
    | b3 AI systems | 0% | 20% | 40% | **90%** |
    | **boards rejected** | 1/3 | **0/3** | 3/3 | **3/3** |

    **THE VERDICT IS ENTIRELY INSTRUMENT-DETERMINED — it spans reject-nothing to reject-everything
    across four models that all pass the capability control.** What is defensible is only the weaker
    claim: **grouping is harder to do cold than recall is, not that it requires the deck.** Do not put
    "Connections requires the material's structure" in the paper without human data. Mechanism: you do
    not need the deck to see that `Strategic Prompt Engineering` / `Data Savvy` / `AI Oversight` are
    *skills* while `Knowledge Base` / `Inference Engine` / `Forward Chaining` are *system components*
    — that is semantic type recognition, i.e. general competence, and the 4×4 partition constraint
    helps the solver rather than hindering.
    - **RETRACTED 6 Aug 2026, same day it was written:** an earlier version of this entry, and commit
      `17c5ece`'s message, claimed "the rank order replicates exactly across families". It does not.
      That was two instruments agreeing, and `gpt-4.1-nano` then ordered them differently
      (b2=b3>b1 against b2>b1>b3). Worse, **at n=10 none of these gaps were ever resolvable** — a
      binomial rate near 0.2 over 10 trials has SE ≈ 13 points, so the agreement I read as replication
      was inside the noise. The band-count lesson again: **n is the binding constraint, not the
      instrument.** Two points agreeing is not replication.
    - **"Nano" is a PRICE tier, not a capability tier.** `gpt-5-nano` is a reasoning model and
      `gpt-4.1-nano` is not; partitioning is a reasoning task, so the generation gap dominates the
      size label completely. The cheapest model on the list ($0.05/1M in) is the *strongest* instrument
      here, beating `gpt-4.1-mini` ($0.40/1M). Never infer capability from a price tier or a size
      suffix — run the capability control. Caveat on its cost: `gpt-5-nano` emits reasoning tokens
      billed as output, so its headline output rate understates real spend, and it is slow.
    - **Temperature was ruled out as the confound.** `gpt-5-nano` rejects any temperature but the
      default 1, so it cannot be run at the 0.7 every other arm used. A matched `gpt-4.1-nano` run at
      temp 1 gave 10/20/20 against 10/20/20 at 0.7 — identical. The gap is the model. `--temp` exists
      on the script for exactly this kind of matched arm.
    - **What survives is one asymmetric use: the WEAKEST eligible model as a REJECTION-ONLY filter.**
      If even `gpt-4.1-nano` solves a board cold, that board is definitely bad. If it does not, nothing
      positive has been learned. Under that rule all three boards pass — none catastrophic, none
      certified. **Do not add a sixth instrument**; the instrument-dependence is the finding, not a
      sampling problem to be averaged away.
    - **Eligibility (capability control on Colours/Animals/Countries/Fruits + Planets/Days/Chess/
      Instruments):** `llama3.2` 3B **0.00/4 — ineligible, cannot do the task**; `gemma2:2b` 1.90/4
      **ineligible, too unreliable**; `gemma2:9b` 3.70/4, `gpt-5-nano` 3.60/4, `gpt-4.1-nano` 4.00/4,
      `gpt-4.1-mini` 4.00/4 all eligible. Note a 2B *gemma* beats a 3B *llama* here — family beats size.
    - **This is a publishable methods finding, not just a build obstacle.** "LLM-based content-validity
      screening for taxonomy-grouping items yields instrument-dependent verdicts spanning reject-none
      to reject-all" belongs beside `docs/literature/item-difficulty-without-students.md`. What
      actually settles memorisation-resistance is human data, i.e. the pilot.
    - **Keep the deck-specific-anchor board rule anyway:** one group whose membership is deck-specific
      phrasing moved a board from 100% to 40% solved cold. A real effect, just not a sufficient one.
    - **Methodological inversion worth stating before someone misapplies the old rule:** for term
      items the ungrounded arm is NOT a valid rejection gate (`Agile Manifesto` scores 1.00 ungrounded
      and is a *good* item — fame is not a defect). For Connections boards the no-source arm IS the
      construct under test, because the claim being made is "requires the material". Same instrument,
      opposite validity, because the claim differs.
    - Limits: 3 boards hand-curated by us, 10 trials each, scores bimodal (0 or 4, rarely between —
      expected for exact-set recovery on a partition). Neither model is a student, and this ambiguity
      is not resolvable with simulators.
  - **Relation harvest works but has its own caption-class failure (6 Aug 2026).**
    `scripts/spike-connections-harvest.mjs` asks a deck only for taxonomic relations under a closed
    enum (`constituents_of` / `stages_of` / `members_of_type` / `instances_of`), no quota, empty
    valid, <4 members discarded never repaired. Over 8 DT decks it found real taxonomies (the big-data
    Vs, Descriptive/Diagnostic/Predictive/Prescriptive, Six Thinking Hats, Design Thinking stages,
    Rogers' adopter categories, Human-in/on/out-of-the-Loop). It also produced three failure classes
    needing a structural guard, roughly half the yield: **rhetorical bullet lists** (`Advantages of
    Cloud Computing`, members as full sentences — and an advantages-vs-disadvantages board is solvable
    by sentiment alone), **mutual-exclusivity violations** (unsupervised learning returned `Clustering`
    alongside its own children `K-Means` and `Hierarchical`), and **company-specific lists** (POOK's 17
    partner brands, 19 org units — the data-point-not-concept failure one level up). Hand curation
    caught all three, which is the practical case for the hand-author recommendation above.
  - **Difficulty is plausibly item × game, not a property of the item (5 Aug 2026, unverified).**
    The same term is easier as a crossword entry (enumeration given) than as bare recall, and harder
    than as a 4-option MCQ. The calibrator renders items as MCQs, so it does not apply to a crossword
    entry at all. Flagged as reasoning, not a measured result.
  - _A1, match-the-following, shipped 1 Aug 2026 (commit `fe871e1`):_ the dashboard's third playable
    tile, and the first game that is not the quiz. `app/games/match/page.tsx` +
    `app/api/match/{board,submit}/route.ts` + `lib/games/match.ts`. **Scoring is per board, graded, not
    per pair:** on a bijection board (n clues, n terms, every term used exactly once, no distractors)
    the correct-pair count is the fixed-point count of a permutation, so one mistake always drags at
    least one other pair down — out of 6 the achievable scores are 6, 4, 3, 2, 1, 0, **never 5**. A
    flat per-pair penalty would bill a single error twice. Shipped table: 15 points per correct pair,
    +30 clean-board bonus, −20 floor penalty at 2 or fewer pairs. The floor is deliberate: a random
    permutation has exactly 1 expected fixed point at any board size, so accrual alone would pay for
    pure guessing — a test asserts `perPair + floorPenalty < 0`. The reachability rule is "no singleton
    errors", **not parity** — 3 and 1 are both reachable via odd-length cycles; this was a live
    misconception during the session and would silently corrupt any tier-based scoring table if
    reintroduced. Score per board, log per pair: board economics on `board_complete`, per-pair facility
    on `question_answered`. 68 tests, `tsc --noEmit` clean, `npx next build` succeeds, verified end to
    end against live Neon.
  - _G2 rebuilt, 3 Aug 2026 — the generator is now two-stage:_ playing choose-the-right-word surfaced
    a term item answerable by matching a country name, not the deck's content. Root cause was a single
    model call per page window, under a quota, asked in one pass to find a concept, define it, and
    invent wrong answers — a page of charts still had to yield N items, so it yielded chart captions.
    `scripts/generate-terms.mjs` now runs a glossary pass first (asks only what the deck teaches, no
    quota, empty is a valid answer), then writes items from that glossary. Verified on the same 9
    pages that previously gave 6 drafts and 3 captions: the new flow gave zero captions. **Standing
    rule: caption detection cannot be done with lexical rules on the output** — three separate
    string-rule attempts failed (the validator rejected `Google's Market Share` and passed `Market
    Share of Google`; naming `Netflix Subscribers Statistics 2025` and `Mattel Japan Market Share` as
    forbidden examples still produced `Mattel Market Share Variation`) — only the structural fix
    (ask what the deck teaches before asking for questions) worked. **Distractors are generated,
    never selected from the glossary** — tried and verified worse: glossary-sourced distractors
    paired near-synonym concepts (`Globalization Journey` / `Global Footprint`) as each other's
    distractor and both items became unanswerable; invention cannot accidentally produce a correct
    answer, selection from a glossary of near-synonyms routinely does.
    `scripts/lib/distractor-select.mjs` was deleted, per the delete-obsoleted-machinery convention.
    **New finding: confusable distractors raise the bar on clue precision** — "never a synonym" is
    not enough, the clue must state what distinguishes the answer from its nearest distractor.
    `Extreme Programming` (distractors Scrum / Kanban / Lean Startup) with a clue describing a
    framework that "integrates business demands with software development rules to achieve shared and
    realizable goals" scored 0.10 grounded, worse than chance, because that clue fits Scrum equally
    well; the old, looser version of the same item scored 0.93. Making distractors more confusable
    without tightening the clue made the item worse. `example_sentence` no longer rejects an item —
    only fill-in-the-blanks reads it and that game is unbuilt — it is nulled instead
    (`scripts/lib/terms-example-sanitize.mjs`), another instance of the over-rejecting-validator
    lesson below. **Content items are retired, never deleted:** `db/009_add_item_retirement.sql`,
    applied to Neon `ancient-brook-62806105` on 3 Aug, adds `retired_at`/`retired_reason` as a matched
    pair on a CHECK allowlist plus a partial index on live rows, and all three item-selection routes
    exclude retired rows — 6 of the first 7 retired items (the chart captions) already had `events`
    rows, and events are the append-only research dataset, so a hard delete would hit or cascade
    through the foreign key. Widening the reason allowlist later needs a DROP and re-ADD of the named
    CHECK; Postgres has no `alter constraint`. **Screen before writing, never after:**
    `build-term-mcq-spike.mjs --from-json` reads the generator's `--dry-run` output directly and
    computes ids with the same `sha256(subject::term)` the generator uses on write, so screen results
    join back to the row that will actually exist; `--subject` must be passed explicitly since it is
    part of that id — one pass defaulted every item to a single subject and mis-keyed 15 of them.
    **The item gap screen** (`scripts/analyse-item-gap.mjs`) runs an item ungrounded and grounded on
    `llama3.2:3b`, grounded arm on the full excerpt and deliberately without `--retention` (that flag
    exists to spread ability tiers for difficulty, not to gate quality — this arm only asks whether
    the source answers the question at all, so ceiling here is a good sign). The grounded arm is the
    gate and works — on 29 regenerated items it caught the one broken item above, which reading the
    text would never have surfaced. The ungrounded arm does not work as a rejection gate — it measures
    how famous a concept is, not whether the item is defective (`Agile Manifesto`, `User Story`,
    `Standup Meeting` all score 1.00 ungrounded, the same memorisation confound already found on the
    Airbnb deck, in a new instrument); when the grounded arm ceilings, the gap collapses to
    `1 − ungrounded` and carries no separate information. Measured: old bank of 50 — 5 broken,
    grounded mean 0.90, ungrounded 0.72; regenerated 29 — 1 broken, grounded mean 0.96, ungrounded
    0.687. **Nothing has shipped to the database this session** — the 29 regenerated items exist as
    screened JSON only (`spike-data/`, gitignored); the app still serves the old cohort, 43 live term
    rows plus 7 retired. 159 tests, `tsc --noEmit` clean. Full detail: `docs/CURRENT_STATE.md`.
  - _A3, choose-the-right-word, shipped 1 Aug 2026 (commit `1805d62`):_ clue is the prompt, term is
    the answer, `distractors` supply the wrong options. Item-grained, `FlatPoints` 15/−5, the
    dashboard's fourth tile. Went before A2 (fill-in-the-blanks) because all 50 term rows have ≥3
    distractors while only 35 have an `example_sentence`. Two things worth keeping: the quiz's
    hardened answer-commit path (cookie-only attribution, dedupe, the 23503 FK retry) was
    **extracted, not copied**, into `lib/game/answer-commit.ts`, so `/api/answer` and
    `/api/word/answer` share one implementation instead of two that can drift — this closed a
    same-question concurrency race (12 concurrent POSTs all scoring) that had existed since Q1 and
    affected the quiz and match too, not just word. And `abandonRound()` is now a shared obligation
    in `lib/game/game-context.tsx` — the abandoned-round bug was fixed for the quiz on 1 Aug inside
    the quiz page, then match reintroduced it two days later because the fix wasn't shared; every
    game now calls the same helper. 100 tests, `tsc --noEmit` clean, `npx next build` succeeds,
    verified end to end including a 12-way concurrency salvo (db/008's partial unique index makes
    the answer insert its own lock; the 409 it returns on a repeat is idempotent, reading the
    already-stored result rather than recomputing it).
