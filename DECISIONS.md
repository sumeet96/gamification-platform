# Decisions

Settled rulings that should not be re-litigated. **Append-only.** An entry here does not change
status — if a decision is reversed, add a new entry that supersedes the old one and leave the old
one in place with a pointer. The reasoning is the point: without it, a later agent "improves" the
code by reversing a deliberate choice.

**Boundary against `docs/PROJECT_MAP.md` §2.** That section is a *status* ledger — built, specced,
deferred, unknown, assumed, broken — and it changes weekly. This file is *why*, and it does not
change. §2 links here for rationale; this file does not restate status. Do not let them become two
competing decision logs.

**Sourcing rule.** Anything attributed to the supervisor cites a transcript in `docs/meeting/`.
Five drifts were found on 30 Jul 2026 by re-reading one, which is why the rule exists. A decision
reported second-hand is marked as reported, not settled.

---

## Product and research design

**Dashboard is the spine; the quiz is one tile.** 27 Jul 2026, `docs/meeting/Jul 27 at 3-39 PM.txt`
— "You need to have a dashboard kind of a thing where quiz is one part of it... start with the
dashboard". The supervisor's first instruction. Shipped 31 Jul as package D1.

**Structural gamification, not content gamification.** 4 Aug 2026,
`docs/meeting/Aug 4 at 3-31 PM.txt`. Content gamification builds the game around one scenario and
has "better impact the research", but "cannot be generalized". Ruling: "for our project… let's keep
a little broader so that it can be applied." **A deliberate trade of research impact for
generalizability.** Operationally: ingestion → `content_items` → game is one pipeline and only the
front end differs per game. A game that only works for one topic is out of scope by this rule.

**Points are fixed within a game and vary across games and difficulty.** Corrected 30 Jul 2026
against the transcript; "+20/−10 everywhere" was a misreading. The spread is the mechanic, not a
defect. Values remain placeholders pending sign-off.

**Cohort is 60–120 students, not ~20.** Corrects a figure that had propagated into `PROJECT_MAP`
and the literature notes. Response-budget figures derived from ~20 students are wrong by 3–6×.

**XP and leaderboards are outputs, never inputs.** XP must never feed back into item selection —
that recreates the cross-game conflation the per-round difficulty reset exists to avoid. Any
motivational overlay must be **identical across every experimental arm**, or it is a confound
rather than a constant. Decided by the user; not yet discussed with the supervisor.

## Adaptivity and levers

**Both levers must never be active at once, enforced structurally.** Games consume `resolveLever()`
from `lib/game/engine.ts` and never branch on `config.lever` themselves. This makes
both-levers-at-once one tested function instead of ~25 scattered branches.

**`'none'` is an inert case INSIDE that chokepoint, never a branch around it.** 7 Aug 2026,
package A5. A lever-less game is the tempting exception and must not become one. `Mode` widened to
carry `'none'` too — the alternative was writing a bogus `'normal'` into the research log.

**Adaptive difficulty moves only after two consecutive same-direction answers, and resets every
round.** Both deliberate. Two-in-a-row damps single-question noise; carrying difficulty across
rounds would imply one global student level, conflating several games' performance into one number.

**Do not delete the adaptive machinery.** The standing "delete obsoleted machinery" convention was
written for code that never changed an outcome. This is working, tested capability the supervisor
may want back once difficulty tagging is easier. `nextDifficulty`, the adaptive branch of
`resolveLever()`/`advanceLeverState()`, and the difficulty ranking in `lib/games/item-select.ts`
stay, parked behind the registry flag, until the drop is confirmed in writing.

**`terminal_reason` excludes `'timeout'`.** 7 Aug 2026. A future lever for a partition game may not
be a clock at all — tile count, mistake budget, and one-away feedback are the live candidates.
Adding the value now would bake in a mechanic nobody has chosen. Widening the CHECK later is a
drop-and-re-add, not a destructive change.

## Difficulty

**Difficulty is empirical, never asserted.** Cognitive level (recall / apply / discriminate /
deduce / transfer) is a generation control stored separately — it is *not* a hardness ordering.

**Do not ask a model how hard an item is; make it attempt the item and measure failure.** The
simulated score lives in `content_items.simulated_p` and must **never** be written to
`empirical_p`, which is reserved for observed human facility. Full method and its corrections:
`docs/experiments/2026-08-02_term-item-calibration.md`.

**Difficulty stays at five levels.** At n=30 simulated students the standard error on a success
rate is ~0.09, so ten bands would be about one standard error wide — false precision. Ties share a
band; do not bin by rank position.

**One simulator is one measurement, not a result.** Any difficulty claim names its simulator, and
anything load-bearing is replicated on a second.

## Games

**Game 4 is Connections, not crossword.** 6 Aug 2026 by five-model RFC
(`docs/architecture/game4-rfc-prompt.md`); shipped 7 Aug as package A5 (`HANDOFF.md` §20). Carry
the caveat: the brief listed crossword's open problems against Connections' settled advantages, so
the framing favoured the outcome. **Unreconciled** — the supervisor steered toward crossword on
4 Aug and has not been told.

**Crossword reopened as a sixth tile, 7 Aug 2026 — Connections is NOT being unwound.** The RFC's
sharpest open objection (crossing density, §7.1: "is a crossword meaningfully different from
fill-in-the-blanks arranged decoratively?") is spike-verified false: `scripts/spike-crossword-
density.mjs` against the live bank clears the RFC's own <25% freeform-generator floor at every
scale tested — 46.5% on the full bank, 43.5%/44.6% at realistic single-deck board scale. Full
record: `docs/architecture/games-and-content-findings.md`. Scope, per the user: crossword ships
**alongside** Connections as a new `GAME_REGISTRY` entry; A5 stays shipped as-is, no rollback.
This resolves ONE objection, not the whole RFC — mobile viewport, difficulty without an MCQ
rendering, and lever/time-pressure compatibility (§5.2–§5.4, §6 finding 5) are still open and
gate the actual build. **Still unreconciled**: the supervisor has still not been told about the
4 Aug divergence; a density spike makes reopening crossword more defensible, it does not
substitute for that conversation.

**Crossword's lever, 7 Aug 2026: `lever: 'both'`, declared but unconsumed until designed** — not
`'none'` like Connections, chosen by the user specifically to keep crossword eligible as a future
study arm once the between-arm contrast (the standing top blocker) is resolved. Consequence that
must hold: **the crossword `GAME_REGISTRY` entry must ship `enabled: false` until it genuinely
consumes `resolveLever()`** — declaring `'both'` without acting on it would log events claiming a
lever was active when nothing enforced it, the same class of defect as a client-supplied score.
Full reasoning: `docs/architecture/games-and-content-findings.md`.

**Crossword's scoring economics, 7 Aug 2026: DESIGNED, not just placeholder numbers** — closes
`game4-rfc-prompt.md` §5, open since the RFC picked Connections before any model answered it for
crossword. User's explicit design, implemented in `lib/games/crossword.ts` / `GridPoints` in
`lib/games/registry.ts`: +10 per correct entry, -5 per wrong (fully-filled-but-incorrect) entry, 0
for not-attempted, +25 clean-board bonus gated on zero wrong AND zero not-attempted (not just zero
wrong), a consumable check budget of `floor(entryCount / 3)` that costs nothing to spend and pays
+2 per unused check, linear (spending 1 of 3 still pays for the other 2). No floor penalty needed —
`perWrong < 0 = notAttempted's 0 < perEntry` already makes blind guessing strictly worse than a
blank, for free. An entry grades only when **every** cell is filled — a down entry left partially
filled as spillover from crossing across answers is `not_attempted`, never `wrong`, closing the
coupling concern for that case. **Accepted, not fixed:** two crossing entries that are both fully
filled and share a wrong letter at the intersection can both grade wrong off one mistake — a real
double-bill, deliberately left as-is (see `gradeEntry`'s docstring in `lib/games/crossword.ts`).
This is scoring/economics only — no routes, API, or UI exist yet to call it.

**Crossword's lever, 8 Aug 2026 — SUPERSEDES the 7 Aug entry above: `lever: 'time'`, not `'both'`.**
The difficulty half of `'both'` is dropped, not deferred: a pre-authored fixed grid has no
difficulty knob to turn without *asserting* a difficulty level, and `AGENTS.md` states "Difficulty
is empirical, never asserted." The user's own framing: we cannot reliably calibrate difficulty even
for MCQs — the term-item calibration experiment (`docs/experiments/2026-08-02_term-item-
calibration.md`) exists precisely because that is hard — so asserting it for a crossword grid is
worse, not better. Two alternatives were considered and rejected before landing on time-only: (a)
modulating the **check budget** as an adaptive-scaffolding lever — rejected because it is a
different construct from the quiz's item-difficulty ramp, so pooling both under one "adaptive" arm
would mean the arm no longer names a single manipulation, a construct-validity problem, not just an
implementation inconvenience; (b) authoring difficulty-tiered boards — blocked, only one board
exists and boards carry no difficulty attribute to tier by. In-repo precedent: Wordle was refused a
lever on purely structural grounds (one board/day means the lever would fire 24h apart, not
adaptivity) — this is the same discipline applied to crossword's difficulty half, not a new rule.
`LeverSupport` (`lib/games/registry.ts`) was widened from `'both' | 'none'` to admit `'time'`,
since the type previously had no way to express "eligible for the time arm only."

Time lever design: a count-up clock that never terminates the board (`terminal_reason` still needs
no `'timeout'`, consistent with the entry below), and a time bonus that pays in full inside a
window then decays linearly to zero. Elapsed time is server-authoritative, derived from the oldest
uncompleted `board_served` row within the token TTL, never from the client-reported
`time_taken_ms` (kept, logged separately, for research comparison only — never scored). The
full-bonus window is snapshotted onto the `board_token_issued` row at serve time so the displayed
and scored windows cannot drift apart. Lever state is reconstructed server-side from the student's
last 10 crossword `board_complete` rows, so adaptation survives across sessions with no new state
table. Both `checkBonus` and `timeBonus` are now scaled by fraction-correct — closes a scoring
exploit a review pass found, where an instant empty submission previously paid +34 (14 unused-check
points plus a full 20 time bonus) and was farmable every few seconds; it now scores 0. Two additive
migrations applied live to Neon this session: `db/015_add_crossword_time_lever.sql` (adds
`events.server_time_taken_ms`) and `db/016_add_events_question_id_index.sql` (adds
`events_question_id_idx`). Crossword's `GAME_REGISTRY` entry is now `enabled: true`.

**Wordle, Strands and the NYT Mini are dead, not deferred.** The corpus has a measured 9-cell floor
in canonical form (136 domain strings, none ≤8 cells) and short terms cannot be prompted into
existence. Independently corroborated by the supervisor on 4 Aug from domain knowledge.

**Spelling Bee and Letter Boxed are disqualified for having no clue channel** — there is nowhere to
put a definition, so the valid answer set is decided by letter combinatorics and the game cannot
carry curriculum. Not a pool-size problem; more decks do not fix it.

**Never render generated `distractors` as board tiles.** They are fabricated strings, and a tile
carries an implicit assertion that it names a real concept — so a student who correctly sorts a
fabricated term learns it as real. Use them offline as a confusability signal only.

## Data and infrastructure

**Scoring inputs are derived server-side, never read from the request body.** 7 Aug 2026. Gating a
penalty on a client-supplied field turned it into a scoring input a client could lie about. General
form: when a fix makes a field load-bearing, re-ask where that field comes from.

**Config carries `ownerGameId`, and the guard is central.** `getConfig()`/`configBelongsTo()` in
`lib/game/game-context.tsx`, not per-game — a per-game guard is the shape that let match
reintroduce the abandoned-round bug two days after the quiz fixed it.

**Content items are retired, never deleted.** `events` is append-only research data with a foreign
key into `content_items`; a hard delete would be blocked or would cascade through it. `retired_at`
and `retired_reason` are a matched pair on a CHECK allowlist, not free text, so the methods section
can `group by` it.

**Migrations are additive only, and applied against live Neon after a read-only preflight.**

**Ollama is local-only and used for difficulty simulation, never content generation.** Three
reasons in order: reproducibility (a hosted model can change mid-pilot and silently shift the
instrument), course material never leaves the machine, and the selection criterion is
discrimination rather than raw capability. Detail:
`docs/architecture/local-models-and-ingestion.md`.

**Input is PDF; LibreOffice is out of the pipeline.** Supervisors export PDFs from PowerPoint
themselves.

**All LLM calls go through one provider-agnostic adapter** (`scripts/lib/llm-client.mjs`). A
provider outage is then a flag change, not a rewrite — which is exactly what happened when Gemini
credits ran out on 31 Jul. **Hard rule: student-derived data never goes to Chinese-hosted
endpoints.**

**No external test framework.** `npm test` runs `node --test tests/*.test.ts`. Do not add vitest or
jest.
