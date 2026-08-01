# Current state — 1 August 2026, continued again (supersedes the A1/A3 checkpoint)

## Where we are — the headline change first

**The professor has reportedly dropped the adaptive-difficulty lever.** Reported by the user after a
conversation with Prof. Singh: difficulty tagging is proving difficult, and the instruction is to
stick with the time lever. **This is REPORTED, NOT TRANSCRIBED** — the project rule (see
`CLAUDE.md` Conventions) is that professor decisions cite `docs/meeting/…`, because five drifts were
found on 30 Jul 2026 by re-reading the actual transcript. There is no transcript or notes for this
one yet. If a recording or notes exist, they belong in `docs/meeting/`; none have been supplied.

**OPEN AND URGENT: the experimental design currently has no between-arm contrast.** The
difficulty-vs-time-lever split WAS the independent variable. If every student gets time pressure,
nothing is known to vary between conditions — time-on vs time-off? rapid vs normal? something else?
`CLAUDE.md` already recorded the research variable across games as the professor's to plan; this
report makes settling it urgent rather than pending. Without a contrast there is no experiment, only
an instrumented app. Raise at the 4 Aug meeting before any further build work that assumes a design.

**Difficulty is not discarded — its role changes from item-selection INPUT to analysis
COVARIATE.** Even under random or least-recently-served item assignment, item difficulty is still
needed to say anything credible about time pressure's effect — otherwise a student who happened to
draw harder items merely looks slower, confounding item hardness with lever effect. It also opens the
more interesting question of whether time pressure hurts disproportionately on hard items. So
calibration work (the bake-off, term-MCQ rendering, below) keeps a home in the main paper even though
it no longer drives adaptive item selection.

**Do NOT delete the adaptive machinery.** The house rule ("when a design decision changes, delete the
machinery it obsoleted") was written for code that never changed an outcome — the adaptive lever is a
working, tested capability the professor may want reinstated once tagging is easier. `nextDifficulty`,
the adaptive branch of `resolveLever()`/`advanceLeverState()`, and the difficulty ranking in
`lib/games/item-select.ts` all stay in place, parked behind the registry flag, until the decision is
confirmed in writing.

## Also this stretch: the simulator bake-off finished, with no single winner

Two arms, both grounded + retention-gated, n=30 simulated students per item. Reproduce both tables
with `node scripts/analyse-bakeoff.mjs` (new file, committed untracked — stage before next commit).

**SLIDE-MCQ ARM — CAGE deck, 17 items:**

| model | mean | IQR | ceiling | floor | gradient (BB/Bas/Prof/Adv) | monotonic | mins |
|---|---|---|---|---|---|---|---|
| llama3.2:1b | 0.38 | 0.23 | 0/17 | 0/17 | 0.30/0.40/0.44/0.35 | NO | 13 |
| qwen2.5:1.5b | 0.74 | 0.27 | 5/17 | 1/17 | 0.67/0.72/0.81/0.84 | yes | 10 |
| gemma2:2b | 0.74 | 0.33 | 7/17 | 1/17 | 0.63/0.74/0.80/0.82 | yes | 28 |
| llama3.2:3b | 0.72 | 0.23 | 2/17 | 0/17 | 0.62/0.73/0.79/0.80 | yes | 20 |
| gemma2:9b | 0.82 | 0.23 | 8/17 | 1/17 | 0.74/0.81/0.90/0.90 | yes | 101 |

**TERM-MCQ ARM — 50 term items rendered as choose-word MCQs:**

| model | mean | IQR | ceiling | floor | gradient | monotonic | mins |
|---|---|---|---|---|---|---|---|
| llama3.2:1b | 0.54 | 0.30 | 0/50 | 0/50 | 0.49/0.49/0.63/0.63 | yes | 35 |
| qwen2.5:1.5b | 0.95 | 0.03 | 42/50 | 0/50 | 0.94/0.95/0.96/0.95 | NO | 30 |
| gemma2:2b | 0.89 | 0.10 | 35/50 | 0/50 | 0.88/0.89/0.90/0.90 | yes | 90 |
| llama3.2:3b | 0.89 | 0.10 | 31/50 | 1/50 | 0.87/0.88/0.90/0.93 | yes | 58 |

**THE FINDING: simulator choice is ITEM-TYPE dependent.** The same model, same method, same n, goes
from 2/17 at ceiling on slide MCQs (12%) to 31/50 on term MCQs (62%). `llama3.2:3b` is the best
simulator for conceptual slide MCQs and unusable for term items; `llama3.2:1b` is exactly the
reverse. **Recommendation: 3B for the quiz's MCQs, 1B for term items (match, choose-the-right-word).**
There is no global winner.

Mechanism worth recording: a choose-word item asks you to match a definition to a short label among
near-miss options — recognition. A slide MCQ asks you to reason about a concept. Recognition
saturates a competent model; reasoning does not.

Two honest caveats:
- Earlier in this stretch `llama3.2:1b` was said to have "failed" on slides because its gradient
  inverted. The fairer statement: the inversion was on 17 items (~51 Advanced observations, ~1.3 SE)
  and did **not** reproduce at 50 items. The load-bearing separator is CEILING and MEAN, not the
  gradient shape.
- `llama3.2:1b`'s term gradient is step-shaped (0.49/0.49 then 0.63/0.63) — it separates low- from
  high-retention students but does not resolve four tiers. Coarser than the headline suggests; state
  this in any write-up.

**The selection criterion is DISCRIMINATION, not weakness.** This corrects `CLAUDE.md`'s "weaker
models simulate students better" line: directionally right, but ceiling is what actually breaks runs.
Criterion: mean facility ~0.50–0.65, ceiling <20%, floor <10%, monotonic gradient across the four
retention tiers, IQR >0.30. The gradient check is the only guard against going too small — a model at
chance (0.25 on four options) has a flattering low mean and no ability signal at all.

All inference is 100% CPU, so model size dominates runtime (`gemma2:9b` 101 min vs `llama3.2:1b`
13 min on the same 17-item deck).

## Term items are calibratable — new tooling this stretch

`scripts/build-term-mcq-spike.mjs` (new, committed `bf925fd`) renders every `term_definition` row as
the MCQ A3 actually shows: clue as stem, term + 3 distractors as options, option order shuffled
deterministically from the item id (never its position in the result set). Produces
`spike-data/terms-mcq.json` (50 items) and `spike-data/excerpts-terms-mcq.json`. All 50 rows render;
every one has a source excerpt. This is the shim that closed the "term items cannot be calibrated"
gap recorded in the prior checkpoint. No new method — it reuses the existing grounded, retention-gated
simulator, just against a rendering of term rows as MCQs instead of quiz rows.

## Literature review — `docs/literature/publishing-llm-item-difficulty.md` (new, untracked)

- **The r = 0.75–0.82 figure is confirmed as NAEP mathematics MCQs only.** New comparator: SMART
  (Chen et al., preprint) reports Spearman 0.57 on reading comprehension and 0.42 on coding for the
  same simulation approach. **Management prose should be expected nearer r ≈ 0.5, not 0.75.** Tell
  Prof. Singh before the pilot, not after.
- **The memorisation confound (this project's finding 2, ρ = 0.62 unmemorised vs 0.14 memorised) is
  an EXTENSION of known work, not a discovery.** Contamination inflating LLM benchmark scores unevenly
  by item is well established in the literature; applying it as a cross-simulator agreement contrast
  inside a student-simulation difficulty method appears unreported elsewhere. The contribution is the
  framing and quantification, not the underlying mechanism.
- **A 2026 preprint (Hoard et al.) shows pairwise comparison plus calibration examples rescues DIRECT
  LLM difficulty rating** on maths items. This contradicts the standing project lean against direct
  rating (`CLAUDE.md` records that question as unresolved-but-discouraged). Untested on prose; cheap
  to try if time allows, but not prioritised over settling the design contrast.
- **The facility/discrimination tradeoff looks genuinely unreported**: this project's finding that the
  one model weak enough to match human-like mean facility (`llama3.2:1b`, 0.38 on slides) is also the
  one whose gradient inverted on the smaller sample — a possible U-shape rather than "weaker is always
  better" — has no clear match in the surveyed literature. Flagged suggestive, not confirmed, and
  n≈3 per Advanced tier at the time it was first observed made it preliminary; see the bake-off
  correction above (did not reproduce at 50 items).
- **Nothing produced so far is publishable standalone without human validation.** Every comparison to
  date is simulator-vs-simulator; `empirical_p` is null on every row in the database.
- **Two-paper plan, and the timing is favourable.** Workshop deadlines (BEA 2027, AIED late-breaking)
  sit around Feb–Mar 2027, while the pilot runs Sept–Dec 2026. Pilot data would be in hand before the
  workshop deadline, so there is no need to rush a validation-free paper now. Recommendation: stop
  investing build time in the simulator method, let the pilot produce `empirical_p`, write once with
  validation included.
- Caveat: most cited sources are arXiv preprints with peer-review status unverified; the LAK/DESRIST
  2027 deadlines and one paper's exact year are marked UNVERIFIED in the note itself.

## A tooling bug worth not repeating

The simulation runner scripts guarded against concurrent Ollama jobs by waiting for `ollama ps` to
report EMPTY. **That check was wrong: `ollama ps` lists LOADED models, not BUSY ones.** Ollama keeps a
model resident for roughly 5 minutes after use, so the condition could never clear while anything was
merely warm — two runs sat in the wait loop until they aborted, instead of running. A warm idle model
is not a conflict; the actual protection is the mutex. The `ollama ps`-empty check was **removed, not
repaired.**

Second half of the same bug: a hard kill does not fire an EXIT trap, so a killed run left its lock
directory behind and silently blocked the next run even though nothing was executing. **A mutex whose
release depends on graceful exit is only half a mutex.** The lock now records the owning PID so a
stale lock is distinguishable from a live one — `spike-data/run-term-llama3b.sh` has the working
pattern; copy it for future runs rather than re-deriving the fix.

## Housekeeping

- New files this stretch: `scripts/build-term-mcq-spike.mjs` (committed, `bf925fd`),
  `scripts/analyse-bakeoff.mjs` (untracked, staged for next commit),
  `docs/literature/publishing-llm-item-difficulty.md` (untracked, staged for next commit).
- Local models now installed: `llama3.2:1b`, `qwen2.5:1.5b`, `gemma2:2b`, in addition to the
  previously installed `llama3.2` (3B) and `gemma2:9b`. `gemma4:31b-cloud` remains present in
  `ollama list` and must **never** be used for simulation — it is a CLOUD model; course material would
  leave the machine.
- All bake-off outputs live in gitignored `spike-data/` (`bakeoff-*.json`, `termbake-*.json`).

## Everything below carries forward unchanged from the A1/A3 checkpoint

Six packages shipped: G1 (MCQ generator), G2 (term/definition generator), D1 (dashboard), Q1 (quiz
hardening), A1 (match-the-following), A3 (choose-the-right-word). Migrations `db/005`–`db/008`
applied and verified live on Neon project `ancient-brook-62806105`. Branch `main`, last committed
work `bf925fd` ("Render term items as the MCQs they already are, so they can be calibrated"); two
files sit untracked in the working tree (see Housekeeping above). 100 tests pass, `tsc --noEmit`
clean, `npx next build` succeeds.

The full package history, the concurrency-race fix (db/008), the shared `answer-commit.ts` and
`abandonRound()` extraction, match's scoring table, the cross-simulator memorisation-confound result
(ρ = 0.62 unmemorised vs 0.14 memorised, pooled genre-matched slide decks), and the reviewer-found
defect list from A3 are all unchanged from the prior checkpoint and are not restated here — see git
history (`ad129bf`, `99adc96`, `1805d62`, `fe871e1`) for the original detail if needed.

## Next actions (replaces the prior list)

1. **Settle the experimental contrast with Prof. Singh** — top open question, ahead of any further
   build work that assumes a design.
2. Calibrate the 50 term rows using `llama3.2:1b` and the 17 MCQ rows using `llama3.2:3b` (per the
   bake-off's item-type-dependent recommendation above); write `simulated_p` and the binned 1–5
   `difficulty`. **Never `empirical_p`.**
3. Package A2 (fill-in-the-blanks, 35 rows have `example_sentence`) or L1 (leaderboard) — build
   priority is now lower than settling the design question.
4. Tue 4 Aug meeting agenda: the between-arm contrast (now urgent, see above), points table numbers,
   rapid/normal exact seconds, Wordle's viability (5 of 50 terms qualify, all proper nouns), the
   r ≈ 0.5 expectation for prose (tell him before the pilot), and confirmation — ideally written or
   recorded — of the lever-drop decision itself.

## Open questions / blocked on

- **Is there still a between-arm experimental contrast, and if so what is it?** New and urgent as of
  this checkpoint — see the headline section above. Everything else is secondary to this.
- **The lever-drop decision has no transcript.** Confirm in writing or recording before treating it as
  final; until then `CLAUDE.md`'s superseded rule stays visible, not deleted.
- **Wordle (A4) may be structurally unviable.** Only 5 of 50 terms across both decks are single words
  of 4–8 letters, and all five are proper nouns. No *concept* clears the bar. Raise with the professor
  rather than silently cutting it.
- **Rapid/normal exact seconds** — working assumption 10s rapid / 15s normal, unconfirmed.
- **Points table numbers**, including whether rapid pays more than normal, and whether match's
  15/30/−20 table needs his sign-off like the other games' placeholder values.
- **Whether the asserted 1–5 difficulty labels discriminate** stays unresolved even after the
  bake-off — it answers which simulator to use, not whether the resulting bands track real student
  performance. Only the pilot's `empirical_p` can answer that.
- **Does simulated facility track real facility?** Needs the pilot; the literature review above puts
  the realistic expectation at r ≈ 0.5 for prose, not the 0.75–0.82 figure that is math-only.
- **Direct LLM difficulty rating** — reopened as an untested middle ground by Hoard et al. (pairwise
  comparison + calibration examples), on math only; not tried on prose, not prioritised over the
  design-contrast question.
- **Next meeting Tuesday 4 Aug 2026.**

## Do not redo

- **Do not treat the lever drop as final without a transcript or recording.** It is reported, not
  documented; `docs/meeting/` has no record of it as of this checkpoint.
- **Do not delete the adaptive-difficulty machinery** (`nextDifficulty`, the adaptive branch of
  `resolveLever()`/`advanceLeverState()`, difficulty ranking in `lib/games/item-select.ts`) — park it
  behind the registry flag, it may be reinstated.
- **Do not feed `simulated_p`/`difficulty` into item selection once the lever is off** — its role is
  now analysis covariate only; wire changes here need the design contrast settled first, not before.
- **Do not use `gemma2:9b` for term items** — 90 minutes for a mean of 0.89 with 35/50 at ceiling; it
  is both slow and uninformative on this item type.
- **Do not use `qwen2.5:1.5b` for term items** — 42/50 at ceiling and a non-monotonic gradient.
- **Do not assume one simulator serves both item types.** The bake-off's headline finding is that
  slide MCQs and term MCQs need different simulators (`llama3.2:3b` and `llama3.2:1b` respectively);
  do not default to one for both without re-checking against the discrimination criterion above.
- **Do not guard concurrent Ollama runs by waiting for `ollama ps` to be empty** — it lists loaded
  models, not busy ones, and a model stays loaded ~5 minutes after use regardless of activity. Use the
  PID-recording mutex pattern in `spike-data/run-term-llama3b.sh` instead.
- **Do not rely on an EXIT trap alone to release a run lock** — a hard kill skips it. Record the owning
  PID in the lock so a stale lock is distinguishable from a live one.
- **Do not run two Ollama jobs concurrently** — the mutex guards exist for exactly this.
- **Do not run the simulation ungrounded and call it difficulty.** Settled on three model families
  before this stretch.
- **Do not give every tier the full excerpt** — arm B inverts the ability gradient on all three
  models tested.
- **Do not add more than five difficulty levels**, and **do not bin by rank position** — ties must
  share a band (`scripts/lib/quintile-difficulty.mjs`).
- **Do not seed the simulator from array position.** Item id only.
- **Do not carry difficulty across rounds**, and do not "fix" the per-round reset.
- **Do not let XP or a leaderboard feed into item selection.**
- **Do not merge `simulated_p` into `empirical_p`**, or `cognitive_level` into either.
- **Do not add a per-pair penalty to match** — it double-bills a single error on a bijection board.
- **Do not make the match board all-or-nothing** — it blinds the facility signal and flatlines the
  board-grained lever.
- **Do not pad the match board with `distractors`** — that column is for choose-the-right-word and
  fill-in-the-blanks; padding breaks the bijection the scoring rests on.
- **Do not select boards (or word items) by whole-history exclusion** — locked a student out
  permanently after 8 boards in live testing. Selection is least-recently-served ranking, shared via
  `lib/games/item-select.ts`.
- **Do not copy the quiz's answer-commit logic into a new game — extract and share it via
  `lib/game/answer-commit.ts`.**
- **Do not add a new "declined a round" state that blurs with abandonment** — `round_stop` (a direct
  decline) and an unresolved `round_offer` (abandonment) must stay distinct in the log.
- **Do not claim `difficultyHonored: true` without sending it in the API response** — the badge bug
  that shipped silently under two reviews and 100 tests.
- **Do not assume match scores come in even numbers only** — 3 and 1 are reachable (odd-length
  cycles); the only forbidden score is 5-of-6 (no singleton errors).
- **Do not switch simulator to `gemma2:9b` or `gpt-3.5-turbo` for slide MCQs without re-checking the
  bake-off.** Both ceiling badly on the Airbnb baseline and both recognise course decks from training
  data; `gemma2:9b` is also ~6× slower.
- **Do not `git add -A` with course-material PDFs in the tree** — a 9.8 MB deck was committed by
  accident and had to be amended out. Root `*.pdf` is now gitignored.
- **Gemini prepayment credits are depleted** — every Gemini call 429s. Generation runs on OpenAI
  (`--provider openai`, default `gpt-4.1-mini`).
- **Do not use `thinkingConfig` with `gemini-3.5-flash-lite`** — rejected with a 400.
- **Do not add vitest or jest**, and **do not use `node --test tests/`** — the working form is
  `node --test tests/*.test.ts`.
- **Do not remove `allowImportingTsExtensions`** from `tsconfig.json`.
- **Do not put a CHECK on `events.cognitive_level`** — append-only log on the answer path.
- **Do not reinstate LibreOffice**, add a `passage` content type, or recreate
  `docs/PROJECT_BACKLOG.md`.
- **Do not learn the professor's spec from summaries.** Read
  `docs/meeting/Jul 27 at 3-39 PM.txt`; the lever-drop item above is exactly the kind of claim that
  needs the same discipline once a transcript exists.
- All prior "do not redo" items from the 29–31 Jul checkpoints still stand (no Poppler/ImageMagick,
  no npm ZIP library, no `psql`, no bcrypt/argon2, no steering prompt on `codex exec review`).
