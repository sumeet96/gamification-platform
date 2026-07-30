# Current state — 30 July 2026

## Where we are

This session re-read the 27 Jul meeting transcript (`docs/meeting/Jul 27 at 3-39 PM.txt`) as a
**primary source** and found five places where `CLAUDE.md` had drifted from what the professor
actually said — three of which change the build. `docs/PROJECT_MAP.md` is now the project spine: it
decomposes everything into nine categories (including "assumed but never confirmed", where all five
drifts lived) and defines work packages scoped by file ownership so multiple sessions can run
disjointly and recombine.

**Package K — the four contracts everything else depends on — is COMPLETE and committed.**
`content_items` + `sources` schema, the game registry, the event-log additions, and the lever
resolver. The project also has automated tests for the first time: **10 passing, `tsc --noEmit`
clean.**

A two-pass GPT-5.6 Sol consultation ran via a new `sol-consult` agent and reversed three decisions
(full text in `docs/consults/2026-07-30-content-layer-and-difficulty.md`).

**What does not exist:** no dashboard (`app/dashboard/` — the professor's first instruction), no game
other than the quiz, no generator wired end to end, and the quiz still ships the answer key to the
browser.

## Working tree

Branch **`feat/multi-game-contracts`**, **clean**, **5 commits ahead of `main`, not pushed.**

```
542597b  Give the six pilot games one place to declare how they score
1ca3a20  Add the content-primitive layer and stop discarding the chosen answer
59b4826  Make the two adaptivity levers mutually exclusive by construction
a290af2  Add an outside-opinion agent and run it on the content layer
50f3686  Map the project against what the professor actually said
bd123b3  (main) Record that the format migration is applied and verified live
```

Merge is Sumeet's call: `git checkout main && git merge --ff-only feat/multi-game-contracts`

`docs/PROJECT_BACKLOG.md` was created and deleted this session — `PROJECT_MAP.md` supersedes it.
Do not resurrect it; one list only.

## In progress right now

**Nothing is mid-edit.** Package K is done and `GEMINI_MODEL` is set.

**The one thing blocking everything else: `db/003` and `db/004` are written but NOT APPLIED.**
Paste `db/003_add_content_items.sql` then `db/004_add_event_metrics.sql` into the Neon web SQL
editor (`psql` is not installed). Nothing that reads `content_items` can be built until they are live.

## Decisions made this session

- **Read the transcript, not the summaries.** Five drifts were found this way. Anything stated as a
  professor decision now cites the transcript or is marked as our inference.
- **Points vary across games, fixed within** — the professor's actual spec; flat +20/−10 was a
  misreading. Machinery built, numbers are placeholders pending his sign-off.
- **Dashboard is the spine, quiz is one tile.** His first instruction; still the least-built part.
- **Per-game lever semantics (option b)** — each game declares `adaptGranularity: 'item' | 'board'`,
  one difficulty knob, one time knob.
- **Both levers never fire at once**, enforced by `resolveLever` rather than convention. Not
  literally unrepresentable — the return type does not forbid both varying — but centralised into
  one tested function instead of ~25 scattered branches.
- **Rapid = fewer questions (10 vs 20), not a faster clock.** A tighter clock would give a
  difficulty-lever student both pressures at once.
- **Pilot roster:** quiz (normal + rapid), match-the-following, fill-in-the-blanks,
  choose-the-right-word, Wordle. Crossword and word search deferred past the pilot.
- **Two content primitives, not three.** `passage` dropped — no pilot game consumes it.
- **Enrich the primitive, don't re-architect it.** Sol was right that `(term, clue)` cannot feed five
  games; its three-layer knowledge-unit model was rejected as the over-building this project has
  already been burned by. Added `example_sentence`, `variants`, `distractors` instead.
- **Derive, don't store** — normalised word form and length are pure functions of `term`.
- **`cognitive_level` and `empirical_p` are separate columns.** One is what kind of thinking an item
  demands; the other is observed facility, and is the only difficulty in the system.
- **Cognitive level is a generation control, not a difficulty scale** (reversed after Sol).
- **Calibrate generation recipes, not individual items** (reversed after Sol).
- **The pilot-of-the-pilot cannot calibrate anything** — at n=5–6 an observed 40% facility spans
  roughly 12–77%. It is a smoke test, still worth running as one.
- **Wordle is an intervention, not a neutral instrument** (reversed after Sol) — its return data is a
  separate treatment and must never be folded into the primary persistence claim.
- **LibreOffice is out. Professors upload PDFs they exported themselves.** Its only job was
  PPTX→PDF; PowerPoint's export produces the same visual render. This also deleted the page-count
  guard and is what makes serverless ingestion possible.
- **Live ingestion, never live generation** — no LLM call on the student's critical path.
- **Multi-tenant schema now, operator surface after the pilot.**
- **New agent `sol-consult`** — two-pass Sol consultation for expensive-to-reverse decisions.

## Open questions / blocked on

- **The research variable across multiple games** — the professor owns this, raised it himself and
  said he would plan it. Highest-value question for the next meeting.
- **"Rapid round" — fewer questions or less time?** His word; we locked it to fewer questions.
- **Points table numbers**, including whether rapid should pay more than normal (at parity now).
- **Does a leaderboard go in?** SDT relatedness play and his research turf, but it carries ethics
  implications and could confound the persistence DV.
- **What actually stops students revising?** Never tested. The design assumes the obstacle is
  motivational. He has taught this cohort.
- **Match-the-following points are `{correct: 15}` with a `// per pair` comment**, but nothing in the
  type says per-pair rather than per-board. Resolve when package A1 is built.
- **`streak` semantics unspecified** — on a wrong answer the clock snaps 5s → 10s, and alternating
  right/wrong oscillates. Ours to decide.
- **Which model produced the 29 Jul question output** — still unknown; `GEMINI_MODEL` was empty then.
- **Next meeting is Tuesday 4 Aug, not Monday 3 Aug** — the transcript has him travelling Monday.

## Next 3 actions

1. **Apply `db/003` then `db/004`** in the Neon web SQL editor. Blocks everything below.
2. **Fan out into three disjoint sessions** — no shared files, safe to run simultaneously:
   - **G1** — rewrite `scripts/generate-questions.mjs` per `docs/architecture/generator-spec.md`
     (PDF in, page-windowed, `responseSchema`, validator-gated, writes `content_items`).
   - **D1** — build `app/dashboard/`. Reads `lib/games/registry.ts` for tiles and points; shows
     gross / net / activity. The professor's first instruction and entirely unbuilt.
   - **Q1** — server-side scoring. `GET /api/questions` currently returns `answer` and
     `app/quiz/page.tsx` compares client-side. Also fix abandoned-round number reuse.
3. **Refactor the quiz onto `resolveLever`** (part of Q1) so it stops hand-branching on
   `config.lever` in four places, and flip `enabled: true` in the registry as each game ships.

## Do not redo

- **Do not learn the professor's spec from `HANDOFF.md` or any summary.** Read
  `docs/meeting/Jul 27 at 3-39 PM.txt`. Summaries are lossy — that is how five drifts happened.
- **Do not reinstate LibreOffice** or the PPTX→PDF render. Professors upload PDFs.
- **Do not build the page-count-vs-slide-count guard.** It compared two representations of a deck;
  there is now only one.
- **Do not add a `passage` content type** until a game actually consumes it.
- **Do not adopt Sol's three-layer knowledge-unit architecture** without a deliberate decision.
- **Do not treat cognitive levels as a difficulty ordering.** A recall question on an obscure fact
  can beat an "apply" question with an obvious answer.
- **Do not merge `cognitive_level` into `empirical_p`.** The migration comment says why.
- **Do not plan to calibrate difficulty from a 5–6 person pilot.** The confidence intervals make it
  meaningless.
- **Do not use Wordle data as the primary retention evidence.** It manufactures what it measures.
- **Do not rename `LeverSupport` back to `Lever`** in `lib/games/registry.ts` — `lib/game/engine.ts`
  already exports a different `Lever`, and the directories differ by one letter.
- **Do not add vitest or jest.** `node --test` with Node's native TypeScript stripping works.
- **Do not use `node --test tests/`** — Node 24.11.1 resolves `tests/` as a module name and throws
  `MODULE_NOT_FOUND`. The working form is `node --test tests/*.test.ts`, already in `package.json`.
- **Do not add `"type": "module"` to `package.json`** to silence the ESM reparse warning. It changes
  resolution across the whole Next app and the `.mjs` scripts for no real benefit.
- **Do not remove `allowImportingTsExtensions`** from `tsconfig.json` — `tsconfig` includes
  `**/*.ts`, so without it `next build` fails on `tests/`, not just `tsc`.
- **Do not put a CHECK on `events.cognitive_level`.** `events` is an append-only log written on the
  answer path; a failed INSERT there loses research data or breaks gameplay. Permissive write,
  validate on read. `content_items` is different and is constrained.
- **Do not run `sol-consult` without `--skip-git-repo-check`** (the scratchpad is not a git repo), and
  always pipe pass 1's text into pass 2 — each `codex exec` run is a fresh session.
- **Do not recreate `docs/PROJECT_BACKLOG.md`.** `PROJECT_MAP.md` replaced it.
- All prior "do not redo" items from the 29 Jul checkpoint still stand (no Poppler/ImageMagick, no
  npm ZIP library, no `psql`, no bcrypt/argon2, no steering prompt on `codex exec review`).
