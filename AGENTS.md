# AGENTS.md — Gamified Adaptive Learning Platform

Instructions for any AI coding agent working in this repository. Tool-agnostic: Claude Code reads
it via `CLAUDE.md`, Codex and others read this file directly.

**Keep this file short.** It loads into context on every session. Detail lives in the documents
named below and is read on demand — do not inline it here, and do not convert these pointers into
`@imports`, which would load everything at launch and defeat the point.

## What we're building

A gamified adaptive-learning dashboard for a Design Science Research artifact. The dashboard is the
spine; the quiz is one tile in it. `app/dashboard/page.tsx` renders one tile per entry in
`GAME_REGISTRY` (`lib/games/registry.ts`), the single source of truth for what games exist and how
each scores. Five tiles ship today across four games: quiz (normal and rapid),
match-the-following, choose-the-right-word, and Connections. A "keep going → next round" loop drives persistence. **Per-question event logging is
the research dataset** — that is the deliverable, not a side effect.

Pilot: Prof. Singh's Digital Transformation course (~20 sessions), ~60–120 students, from
mid-Sept 2026. Budget is ~400–450 hours over six months and near-zero cash. Resist scope creep.

Stack: Next.js 16 / React 19 / Tailwind v4, Neon serverless Postgres, Vercel Hobby. Auth is real
email+password; the whole app is gated deny-by-default in `proxy.ts`, and `events.student_id` comes
from the session cookie, never the request body.

## Read before significant work

- `docs/CURRENT_STATE.md` — **start here.** Where things stand, what was interrupted, what not to
  redo. Written by `/checkpoint`, read by `/resume`.
- `DECISIONS.md` — settled rulings and why. Read before changing architecture; do not reverse an
  entry without adding a superseding one.
- `docs/PROJECT_MAP.md` — decomposition, work packages, and what is decided vs assumed. §2 is the
  status ledger; §2.7 ("assumed but never confirmed") is the dangerous category.
- `HANDOFF.md` — chronological history, §1–§20. The record of what happened and when.

Topic detail, read when the work touches it: generation and validator methodology in
`docs/architecture/generator-spec.md`; game selection and content findings in
`docs/architecture/games-and-content-findings.md`; difficulty calibration in
`docs/experiments/2026-08-02_term-item-calibration.md`; local models and ingestion in
`docs/architecture/local-models-and-ingestion.md`; the data layer in
`docs/architecture/data-layer.md`.

If documentation and implementation disagree, **the implementation is the source of truth** — and
say so rather than silently following one.

## The open research question

**The between-arm experimental contrast is undecided, and it is the top blocker.** Each student was
to get exactly one adaptivity lever — adaptive difficulty or time pressure, never both — and that
split *was* the independent variable. The adaptive lever was reportedly dropped on 1 Aug, leaving
nothing established to vary between conditions. Without a contrast there is no experiment, only an
instrumented app.

It was the stated top item for the 4 Aug meeting and **does not appear in that transcript at all**
(`docs/meeting/Aug 4 at 3-31 PM.txt`). Two packages have shipped since, so build work has overtaken
the design. Connections ships `lever: 'none'` and therefore produces **no experimental data** — an
engagement tile, not a study arm. If that is still true at pilot start, the methods section must say
so rather than let it be assumed in.

Do not soften this entry. Full status: `docs/PROJECT_MAP.md` §4 and `HANDOFF.md` §20.

## Rules that bind

Breaking one of these costs money, corrupts research data, or forces a rewrite.

- **Never stage with a broad `git add`.** Course-material PDFs sit in the working tree; a 9.8 MB
  deck was committed by accident on 1 Aug and had to be amended out. Stage files by name.
- **Student-derived data never goes to Chinese-hosted endpoints.** Non-student calls (question
  drafts from course material) may use cheap open-model providers.
- **Ask before adding dependencies or paid services.**
- **Scoring is server-side, off the DB, always.** Never trust a client-supplied score, mistake
  count, membership, or terminal state. The client bundle must never contain an answer key.
- **Anything touching scoring or auth gets an adversarial review pass before commit.** A builder's
  "done" is not sufficient evidence on this class of change — the first attempt at quiz hardening
  reported success while the answer key still shipped in the client bundle.
- **Migrations are additive only.** Read-only preflight against live Neon first; content items are
  retired, never deleted, because `events` holds a foreign key into them.
- **Any claim destined for the paper cites a source in `docs/literature/` or is marked unverified.**
- **Read the transcript, not the summary.** Anything stated as a supervisor decision cites a file in
  `docs/meeting/`. Five drifts were found on 30 Jul by re-reading one.
- **When a design decision changes, delete the machinery it obsoleted** — except where `DECISIONS.md`
  says otherwise (the adaptive lever is parked deliberately, not dead).
- **Exercise the artifact against real data before believing a package is done.** Static review and
  unit tests are necessary and not sufficient. Three packages have passed every static check while
  broken: A1 locked a student out after 8 boards, A3 computed a value and never sent it, and A5
  passed eleven live API checks while the board was literally unplayable. **API-level verification
  is structurally blind to UI failure — open a browser.**
- **An over-rejecting validator is not automatically the safe direction.** A guard that is too
  strict destroys yield as surely as a loose one lets bad data through. Check yield, not just
  precision. Four instances so far.
- **A rejection gate is meaningless until a capability control has passed on the same instrument.**
  Ship a trivially-solvable control alongside any new gate and run it first.

## Conventions

- `npm test` runs `node --test tests/*.test.ts`. **No external test framework** — do not add vitest
  or jest. 253 tests as of 7 Aug 2026.
- Prefer small, verifiable increments. Match the existing style; do not reformat unrelated files.
- Both adaptivity levers must never be active at once, enforced structurally: games consume
  `resolveLever()` from `lib/game/engine.ts` and never branch on `config.lever` themselves.
- `EventType` is derived from `CLIENT_EMITTABLE_EVENT_TYPES` in `lib/log/logEvent.ts`, not
  maintained beside it — the runtime allowlist and the compile-time type cannot drift.
- Difficulty is empirical, never asserted. Cognitive level is a generation control, not a hardness
  ordering.

## Agent contract

- **Read the referenced documentation before significant changes.** Do not re-derive facts the repo
  already records, and do not re-run analysis marked as settled — `DECISIONS.md` exists to stop that.
- **Preserve existing architecture unless there is a compelling, stated reason to change it.**
- **Keep changes scoped to the request.** If you find problems outside it, list them separately
  rather than fixing them in the same pass.
- **When a requirement is ambiguous, make the routine judgment call and say what you assumed.** Stop
  and ask only when different readings lead to materially different work.
- **Report outcomes faithfully.** If tests fail, say so with the output. If a step was skipped, say
  that. Only claim completion when the work is actually done and verified.
- **Ground progress claims in evidence you can point to.** Do not report a check as passing that you
  did not run.
- **When finished, summarise what changed, why, what the risks are, and what is left.**
