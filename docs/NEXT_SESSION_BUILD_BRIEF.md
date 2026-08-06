# Build brief — package A5, Connections (write for a cold session)

Written 6 Aug 2026 by the session that chose this game. **Deadline: something demoable by Friday.**
Read `docs/CURRENT_STATE.md` first, then this. Do not re-run the game-selection analysis — it is
done, and repeating it will cost you the week.

> **CONFIRM BEFORE YOU START:** the user wrote "chaining/crossword". This brief assumes
> **Connections** (16 tiles → 4 groups of 4), which is what the five-model RFC unanimously chose
> (`docs/architecture/game4-rfc-prompt.md`). If they meant crossword, most of §3–§6 still applies but
> §4 and §5 do not — ask before writing code.

## 1. What this is

The dashboard's fifth tile and the second board-grained game. 16 term tiles, partition into 4 groups
of 4 by shared category, 4 mistakes allowed. It is a **selection** game, not a letter game — entry
length is irrelevant by construction, which is why it beat crossword.

## 2. Ship the smallest thing that is real

Three of five model families independently said: **hand-author the boards for the pilot and build
the generation pipeline afterwards.** Take that. It removes the largest block of work *and* the
largest correctness risk, and it is the honest reading of the standing quota rule — a human writing
however many groups the material actually contains cannot manufacture garbage the way a pipeline
under an implicit quota can.

**MVP = hand-authored boards + server-scored play + full event logging.** Nothing else.

Bank available: **113 live `term_definition` rows** in Digital Transformation, 9 in International
Management, plus ~170 Competitive Strategy items pending screen (see CURRENT_STATE). A board needs
16 tiles from **one subject** — DT is the only subject with enough today.

## 3. Reuse, do not rewrite

This is the second board game. The first one paid for all of this:

| Need | Already exists | Notes |
|---|---|---|
| Board token / nonce | `lib/games/board-token.ts` (see `tests/board-token.test.ts`) | |
| Board-submit dedupe | `db/007` partial unique index on `events(question_id) where event_type='board_complete'` | the INSERT *is* the lock — there are no transactions on the Neon HTTP driver |
| Least-recently-served selection | `lib/games/item-select.ts` `selectItems()` | recency reorders, never excludes — see the 8-board lockout in "Do not redo" |
| One-subject-per-board rule | `lib/games/match-board-select.ts` | thin wrapper that groups by subject; copy that shape |
| Round abandonment | `abandonRound()` in `lib/game/game-context.tsx` | **every** path that ends a started round must call it; match reintroduced this bug two days after the quiz fixed it |
| Answer commit + 409 idempotency | `lib/game/answer-commit.ts` | extracted, not copied — do the same |
| Board timing profile | `BOARD_TIME_BASE/MIN/STEP` in `lib/game/engine.ts` | see §6, the numbers are probably wrong for this game |
| Lever resolution | `resolveLever(config, state, 'board')` | **never branch on `config.lever` in the game** |

Files to create, mirroring match exactly:
`app/games/connections/page.tsx`, `app/api/connections/board/route.ts`,
`app/api/connections/submit/route.ts`, `lib/games/connections.ts`.

## 4. Scoring — needs a new points shape

`BoardPoints` does not fit; a 4-guess mistake budget has no home in it. Add a fourth variant to
`lib/games/registry.ts`:

```ts
export interface PartitionBoardPoints {
  kind: 'partition'
  perGroup: number          // per correctly submitted group
  perfectBonus: number      // zero mistakes
  mistakePenalty: number    // per WRONG GUESS, never per tile
  maxMistakes: number       // 4
  floorAtOrBelow: number
  floorPenalty: number
}
```

**The rule that matters:** penalise per *guess*, never per *tile*. A four-tile guess is one decision.
This is the same double-billing trap `BoardPoints` was designed around — read the comment above it
before you write anything.

**The forced fourth group:** once three groups are solved the fourth is arithmetically determined and
pays for no decision. Do **not** distort the economics to fix this. Award normally and set
`forced: true` on that `group_solved` event so it is excludable at analysis time.

All values are placeholders pending Prof. Singh's sign-off, same as every other row in the registry.

## 5. Board construction

Boards are **authored offline and persisted**, not built per request. New tables:

```
connection_groups        (id, subject, label, created_at, retired_at, retired_reason)
connection_group_members (group_id, content_item_id, ordinal)   -- exactly 4 rows
connection_boards        (id, subject, board_token, difficulty, created_at, retired_at, ...)
connection_board_groups  (board_id, group_id, ordinal 0..3)
```

Retire, never delete — `events.content_item_id` is a foreign key into append-only research data.
Migration is `db/011`; additive only.

**Do NOT put `distractors` on a board as tiles.** They are *generated* strings, i.e. fabrications. A
tile carries an implicit assertion that it names a real concept, so a student who correctly sorts a
fabricated term has learned it as real. Use them offline as a confusability signal only. (An earlier
version of the RFC said the opposite; it was wrong and is corrected in `CLAUDE.md`.)

**Board design rule that is measured, not guessed:** include at least one group whose membership is
deck-specific phrasing. One un-guessable group moved a board from 100% to 40% solvable-with-no-deck.
It is a real effect and not a sufficient one — see §8.

**Uniqueness cannot be proven, so stop trying.** Whether a partition is "valid" depends on whether a
human would accept an ad-hoc label, which is not decidable. Bound the failure instead: author from
disjoint relation axes, and ship a one-tap **"this board seems ambiguous"** affordance logged as an
event. Treat the report rate as a measurement. Above ~5% of boards, the authoring is wrong.

## 6. The lever, and the risk you must not discover in September

Connections is board-grained. Use `resolveLever(config, state, 'board')`.

**The board clock is almost certainly wrong for this game.** `BOARD_TIME_BASE` is 90s, set for a
6-pair match board, not a 16-tile taxonomy search. The failure mode is a floor effect: if the clock
is tight enough to feel like pressure, everyone times out at two groups, the dependent variable
loses variance, and it *looks like working data*.

**Run a timing check in week one, before the client is finished.** 8–10 people, three real boards,
untimed; log time-to-first-group and time-to-completion. Set base near the 75th percentile and floor
near the median. A rough prior is 180s base / 90s floor with a −20s ramp — treat that as a hypothesis,
not a spec.

**Live risk, flag it early:** the user reinstated **adaptive difficulty** on 6 Aug. Two of the five
model families said a difficulty-led design flips the game choice away from Connections, because a
board carries one difficulty for all 16 tiles and therefore adapts coarsely — toward
**fill-in-the-blanks**, which is item-grained and already renders as an MCQ so it inherits the
existing calibrator unchanged. If difficulty turns out to be the primary manipulation, say so before
week two rather than after.

## 7. Events

Extend the existing row shape. Server-side only for anything scored — the client physically cannot
emit a scored event (`CLIENT_EMITTABLE_EVENT_TYPES` in `lib/log/logEvent.ts` derives the type from
the runtime allowlist; add to that array, never to a parallel list).

| Event | Grain | Carries |
|---|---|---|
| `board_served` | board | board_id, difficulty, time_limit, shuffle seed |
| `guess_submitted` | guess | four tile ids in `submitted_text`, guess hash, correct, one-away, mistakes_after, ms since board start |
| `group_solved` | group | group ordinal, `forced` flag, points_delta |
| `board_complete` | board | groups solved, mistakes, elapsed, terminal reason (`solved`/`budget`/`timeout`/`abandoned`) |
| `board_reported_ambiguous` | board | optional free text |

Plus the existing `round_offer` / `round_continue` / `round_stop` trio, unchanged.

**Do not log** tile taps, deselects, shuffles, or timer ticks. Capture `deselect_count` and
`shuffle_count` as integers on `board_complete` instead — same behavioural signal, three orders of
magnitude less volume. Estimated total for the pilot: under 50k rows.

**Idempotency:** partial unique index on `(session_id, board_id, guess_hash)` where guess_hash is
sha256 of the four tile ids sorted ascending. That gives the 12-way-salvo defence and the correct UX
rule (a repeat of an already-submitted combination is rejected, not re-scored) in one constraint.

## 8. Known limits — write these into the paper, do not try to engineer them away

- **"Connections requires the material's structure" is NOT established.** Measured 6 Aug: boards are
  solved with no course material at all in 0/3, 1/3, 3/3 and 3/3 of cases depending only on which
  model does the solving. The defensible claim is the weaker one — grouping is *harder* to do cold
  than recall is. Do not put the strong version in the paper without human data.
- **Do not add a sixth screening instrument.** The instrument-dependence is the finding.
- **A rejection gate needs a capability control first.** `llama3.2` 3B scores 0.00/4 on
  Colours/Animals/Countries/Fruits and cannot do the partition task at all.

## 9. Acceptance before you call it done

1. `npm test` green (188 today), `npx tsc --noEmit` clean, `npx next build` succeeds.
2. **Play it against live Neon.** Static review and unit tests have twice passed a game that was
   broken — A1's 8-board lockout and A3's badge that was computed and never sent. Play it and count.
3. 12-way concurrent POST salvo on `/api/connections/submit` — one score, eleven idempotent 409s.
4. Inspect the browser payload: no group ids, no labels, no membership map, no answer key.
5. `reviewer` pass before commit — this touches scoring and DB writes.

## 10. First three commands

```bash
git pull                                   # 442515e or later
npm test                                   # expect 188 passing
node -e "1" && npx tsc --noEmit            # baseline clean
```

Then write `db/011`, then `lib/games/connections.ts` with its tests, and only then any route or page.
