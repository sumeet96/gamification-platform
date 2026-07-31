# Current state — 31 July 2026

## Where we are

Package **K is complete, committed and merged to `main`**; its two migrations are applied and verified
live on Neon project `ancient-brook-62806105`. Tests: **10 passing, `tsc --noEmit` clean.**

This session ran the **grounded difficulty simulation** that the 30 Jul checkpoint listed as next, and
it worked. Full write-up: **`docs/experiments/2026-07-31_grounded-difficulty-simulation.md`** — read
that before touching difficulty. Three arms × 15 questions × 30 simulated students = 1,350 responses,
0 unparseable, all local on `llama3.2` via Ollama.

The headline is a method change, not just a result: **grounding alone does not work — the ability tier
must control how much of the source the simulated student can see.** Given the full excerpt, a "weak"
persona scores the same as a "top" persona (the persona is decorative). Thin the excerpt per tier and a
proper ability gradient appears.

Still not built: **D1** (`app/dashboard/` — the professor's first instruction, still does not exist),
**G1** (generator → `content_items` + `source_excerpt`), **Q1** (server-side scoring; `/api/questions`
still ships `answer` for all 200 rows and `/api/events` trusts what the client posts). The
`db/005_add_simulated_difficulty.sql` migration is **still unwritten**.

## Working tree

Branch **`main`**, last commit **`44a2443`** ("Record the simulation method and what the spike did not
show"). Level with `origin/main`; nothing pushed this session.

**Uncommitted — nothing is broken, this is just unstaged work:**
```
 M .gitignore                      adds spike-data/ (course material must not be committed)
 M scripts/spike-simulate-difficulty.mjs   + --source, --retention, --out, --label, per-tier breakdown
?? scripts/extract-slide-text.mjs   NEW — recovers text from image-only slides via Gemini vision
?? scripts/spike-compare-arms.mjs   NEW — Spearman agreement, ability slope, ceiling/floor counts
?? docs/experiments/                NEW — the results write-up
```

`spike-data/` exists on disk and is **gitignored on purpose** (it holds the professor's deck text). It
contains `questions-session12.json`, `source-session12.json`, `slides-session12.json`,
`excerpts-session12.json`, `run-A-ungrounded.json`, `run-B-grounded-full.json`,
`run-C-grounded-retention.json`, `run-arms.sh`, `run-arms.log`. **If that directory is lost the runs
must be redone (~90 min).** The 15-question input was originally recovered from a dead session's
scratchpad — that is why it now lives in the repo dir rather than in `%TEMP%`.

## In progress right now

**Nothing is mid-edit and no job is running.** The session ended on a question put to the user that
they have **not yet answered**:

> Should the "model-asserted difficulty labels do not discriminate" claim be corrected in `CLAUDE.md`,
> `docs/PROJECT_MAP.md` §1.6 and `docs/consult-brief.md` to the more accurate "discriminates coarsely
> across the full range, unreliable between adjacent levels"?

Do not make that edit without an answer — the user may have earlier evidence this session did not see.

## Decisions made this session

- **The simulated student's ability tier controls how much of the source excerpt it sees** (Below Basic
  30% of lines / Basic 55% / Proficient 80% / Advanced 100%), because with the full excerpt every tier
  scores the same and the persona does nothing. Implemented as `recall()` in
  `scripts/spike-simulate-difficulty.mjs`, behind `--retention`.
- **Grounding is mandatory for our items.** Ungrounded, success rate measures "answerable without the
  deck", not difficulty. The cited paper (arXiv 2601.09953) never hits this because NAEP maths items
  are self-contained; ours are source-dependent.
- **Image-only slides are recovered with Gemini vision on the PDF**, not OCR and not LibreOffice
  (`scripts/extract-slide-text.mjs`). 12 of 26 pages of `Pitch_Session 12.pdf` have no text layer. One
  call, 13,885 in / 2,841 out tokens. Course material still never goes to Ollama's cloud models, and
  simulation stays local.
- **Slide provenance is keyed on the number printed on the slide**, not on Gemini's `kind`
  classification, which mislabelled page 16.
- **The question-quality gate needs n≥30, not n=4.** At n=4 it flagged 4/15 items as answerable without
  the deck; at n=30 only 1/15 survives. The other 3 were sampling noise.
- **`spike-data/` is gitignored**, so course material and run outputs stay out of version control.
- **Planning figure for the full run is ~3 s/response ⇒ 400 items × n=30 ≈ 10 hours**, an overnight
  job. (Supersedes the 30 Jul "7 hours" estimate.)

## Open questions / blocked on

- **Correct the "labels do not discriminate" claim?** — the user, see "In progress". Measured ρ = −0.63
  and monotonic by band (d1 91%, d2 70%, d3 66%, d4 33%). The filed complaint that "a question labelled
  4 was answerable cold" is wrong: that item is the hardest in the set at 33% ungrounded.
- **Does simulated facility match *real* facility?** Still unknown and needs the pilot. This session
  validated the **ordering**, not the magnitude.
- **The retention fractions 0.30/0.55/0.80/1.00 are a chosen knob**, never calibrated, no sensitivity
  analysis run. A reviewer will ask.
- **How should `source_excerpt` represent chart/matrix slides?** Text transcription loses *position*.
  Item #8 (2×2 competitive matrix) scores 33/30/33 — grounding does not help it at all. Affects G1.
- **The research variable across multiple games** — the professor owns it; he said he would plan it.
- **Rapid mode's exact seconds are unconfirmed.** Decided 31 Jul: rapid is fewer questions *and* a
  fixed per-question timer, not fewer questions alone. Working assumption is rapid = 10s, normal =
  15s, but the user's phrasing ("10/15 seconds") is ambiguous between that and a choice of 10 or 15 —
  the seconds themselves are still open. See `docs/PROJECT_MAP.md` §1.
- **Points table numbers**, including whether rapid should pay more than normal (at parity now).
- **Match-the-following points are `{correct: 15}` with a `// per pair` comment** — resolve at package A1.
- **`streak` semantics** — on a wrong answer the clock snaps 5s → 10s; alternating right/wrong oscillates.
- **Next meeting is Tuesday 4 Aug**, not Monday — the transcript has him travelling Monday.

## Next 3 actions

1. **Commit this session's work.** Five paths, all listed under "Working tree": `.gitignore`,
   `scripts/spike-simulate-difficulty.mjs`, `scripts/extract-slide-text.mjs`,
   `scripts/spike-compare-arms.mjs`, `docs/experiments/`.
2. **Get the user's answer on the "labels do not discriminate" correction**, then either edit
   `CLAUDE.md`, `docs/PROJECT_MAP.md` §1.6 and `docs/consult-brief.md`, or record why not.
3. **Write and apply `db/005_add_simulated_difficulty.sql`** — `simulated_p`, `simulated_n`,
   `simulator_model`, `source_excerpt` on `content_items`. Additive only. Paste into the Neon web SQL
   editor; `psql` is not installed. Then the fan-out K unblocked: **G1**, **D1**, **Q1**.

To reproduce the runs (only if `spike-data/` was lost):
```
node scripts/extract-slide-text.mjs "C:/Users/96sum/Downloads/Pitch_Session 12.pdf" spike-data/source-session12.json
bash spike-data/run-arms.sh > spike-data/run-arms.log 2>&1     # ~90 min, sequential
node scripts/spike-compare-arms.mjs spike-data/run-A-ungrounded.json spike-data/run-B-grounded-full.json spike-data/run-C-grounded-retention.json
```

## Do not redo

- **Do not run the simulation ungrounded and call it difficulty.** It measures how much a question
  depends on its source. Settled — arm A, ability slope −4 pts and non-monotonic.
- **Do not give every tier the full excerpt.** Arm B: 81/87/85/89 — the persona instruction is ignored
  and the task becomes reading comprehension. Settled.
- **Do not re-test whether excerpt length is driving the arm C ordering.** Checked: ρ = −0.08 for lines,
  +0.33 for characters, neither significant at n=15, and the character one runs opposite to the
  artifact hypothesis.
- **Do not harden the retention fractions to break a ceiling.** There is no ceiling — arm C mean 0.71,
  spread 0.67, 1/15 at ceiling, 0/15 at floor. An early n=4 smoke test on the three *easiest* items
  showed 100% and that was misleading.
- **Do not re-derive the question→slide mapping.** `spike-data/excerpts-session12.json` already carries
  it, including the 3 corrected attributions (items #0, #1 → template pages 2 and 4; #13 → page 17).
  False attribution measured at **3/15**, not the 2/15 estimated in `generator-spec.md`.
- **Do not trust Gemini's `kind` field** from `extract-slide-text.mjs` — it called page 16 a template
  when it is an example slide. Key on the number printed on the slide.
- **Do not expect text transcription to answer chart/matrix questions.** Every label is recovered;
  positions are not.
- **Do not look for the spike inputs in `%TEMP%`.** They now live in `spike-data/` in the repo dir.
- **Do not ask a model to rate difficulty 1–5** as the primary method. Simulate attempts instead.
- **Do not use a large model as the simulator** — weaker models simulate students better.
- **Do not use `gemma4:31b-cloud`** — it is a cloud model despite appearing in `ollama list`.
- **Do not merge `simulated_p` into `empirical_p`**, or `cognitive_level` into either.
- **Do not bin with fixed thresholds.** Use quintiles over the observed distribution.
- **Do not plan to calibrate from a 5–6 person pilot.** At n=5–6 an observed 40% facility spans ~12–77%.
- **Do not use Wordle data as primary retention evidence.**
- **Do not build per-item Elo** — ~20 responses per item cannot converge; 200–500 are needed.
- **Do not add vitest or jest**, and **do not use `node --test tests/`** — Node 24.11.1 resolves it as a
  module name. The working form is `node --test tests/*.test.ts`.
- **Do not remove `allowImportingTsExtensions`** from `tsconfig.json` — `next build` then fails on `tests/`.
- **Do not put a CHECK on `events.cognitive_level`** — append-only log on the answer path.
- **Do not rename `LeverSupport` back to `Lever`** in `lib/games/registry.ts`.
- **Do not reinstate LibreOffice**, add a `passage` content type nothing consumes, or recreate
  `docs/PROJECT_BACKLOG.md`.
- **Do not learn the professor's spec from summaries.** Read `docs/meeting/Jul 27 at 3-39 PM.txt`.
- All prior "do not redo" items from the 29–30 Jul checkpoints still stand (no Poppler/ImageMagick, no
  npm ZIP library, no `psql`, no bcrypt/argon2, no steering prompt on `codex exec review`).
