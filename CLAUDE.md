# CLAUDE.md — Gamified Adaptive Learning Platform

Read `HANDOFF.md` for full project history. Read `docs/PROJECT_MAP.md` next — it is the project
spine: decomposition, work packages, and what is decided vs assumed. This file is the working brief.

## What we're building
A gamified adaptive-learning dashboard — the dashboard is the spine and the quiz is one tile in it,
per the professor's first instruction (`docs/meeting/Jul 27 at 3-39 PM.txt`; not yet built, no
`app/dashboard/` exists). Points are fixed *within* a game and vary *across* games and difficulty —
that spread is the intended "high and low" feeling, not a flat rate. Each student picks exactly one
adaptivity lever: either adaptive difficulty (which ramps up/down per performance) or time pressure
(clock tightens), never both. Rapid and normal modes. A "keep going → next round" loop drives
persistence. Course material is not a build prerequisite — the professor said any PDF on any topic
works for building the pipeline — but the pilot itself is Prof. Singh's Digital Transformation course
(~20 sessions), from ~mid-Sept 2026. The artifact is a Design Science Research piece; per-question
event logging is the research dataset.

## Core design rules
- **Dashboard is the spine, quiz is one tile.** "You need to have a dashboard kind of a thing where
  quiz is one part of it... start with the dashboard" (`docs/meeting/Jul 27 at 3-39 PM.txt`). This is
  the professor's first instruction and the least-built part of the app; see `docs/PROJECT_MAP.md` §3,
  package D1.
- **Points: fixed within a game, varying across games and difficulty.** Corrected 30 Jul 2026 against
  the transcript — "Fixed point economy: +20/−10 everywhere" was a misreading. A hard game pays more
  than an easy one; that variability is the mechanic the professor asked for, resolved by a published,
  predictable points table (values are placeholders pending his sign-off; see `docs/PROJECT_MAP.md` §1).
- **One adaptivity lever per student:** adaptive difficulty (ramps) or time pressure (clock). Not both.
  Clean experimental design.
- **Both levers must never be active at once, enforced structurally.** Games consume `resolveLever()`
  from `lib/game/engine.ts` and never branch on `config.lever` themselves — both-levers-at-once becomes
  a single tested function instead of ~25 scattered branches. Not literally unrepresentable — the
  return type does not forbid both varying — but centralised and covered by tests
  (`docs/PROJECT_MAP.md` §1, package K-4).
- **Difficulty is empirical, never asserted.** Cognitive level (recall / apply / discriminate / deduce
  / transfer) is a generation control stored separately — it is not a hardness ordering
  (`docs/PROJECT_MAP.md` §1.6).
  - _Method decided 30 Jul 2026:_ do not ask a model how hard an item is — make models **attempt** it
    at stated ability levels via **LLM student simulation on a small local model, run through Ollama**,
    and take the failure rate as the difficulty estimate. Cited in
    `docs/literature/item-difficulty-without-students.md`. The continuous score is **binned into the
    existing 1–5 column** so current difficulty plumbing (`pickQuestion`, lever constants, badge,
    tests) is untouched. The raw score is stored in `content_items.simulated_p` and must **never** be
    written to `empirical_p`, which is reserved for observed human facility. See `docs/CURRENT_STATE.md`
    for the Phase 0 spike result and its limits.
  - _Revised 31 Jul 2026, grounded simulation:_ the simulated student must be given the **source
    excerpt the item came from**, and the **ability tier must control how much of that excerpt it
    sees** — Below Basic 30% of lines, Basic 55%, Proficient 80%, Advanced 100%. Given the full
    excerpt every tier scored the same (81/87/85/89) and the persona instruction was ignored; thinned
    per tier the gradient appeared (57/71/78/89). Ungrounded simulation measures how much a question
    depends on its source, not difficulty. Implemented as `recall()` in
    `scripts/spike-simulate-difficulty.mjs`, behind `--retention`. Full run:
    `docs/experiments/2026-07-31_grounded-difficulty-simulation.md`. Known limit for package G1: text
    transcription loses *position*, so chart/matrix/2×2 slides cannot be difficulty-calibrated by text
    simulation (the 2×2 competitive-matrix item scored 33/30/33 — grounding did not help it at all).
- **Rapid and normal modes** control question velocity.
- **Persistence loop:** "keep going → next round" incentivizes repeated engagement.
- Log all events (session, round, per-question interactions, score, adaptivity feedback) for DSR dataset. Do not train on student data.

## Stack & constraints (28 Jul 2026 rebuild — details in HANDOFF.md §4)
- **Runtime LLM: Gemini paid Tier 1** (Flash-class), not free tier — free tier's ~10 RPM and training-data clause fail a classroom pilot. Pending prof sign-off on the small spend; until then, develop against free tier but architect for Tier 1.
  - _Model guidance revised 29 Jul 2026:_ `gemini-2.0-flash` is two generations stale. As of 21 Jul 2026 the current tier is **Gemini 3.6 Flash** ($1.50/$7.50 per 1M tokens) and **Gemini 3.5 Flash-Lite** ($0.30/$2.50). **Flash-Lite is the right default for bulk MCQ generation** — the task is schema-constrained, not reasoning-heavy. Confirm the exact API model string in Google AI Studio and set it via `GEMINI_MODEL` in `.env.local`, not by editing the script fallback. Google no longer publishes universal RPM limits; they are project-specific in the console.
- **All LLM calls through one provider-agnostic adapter** (Vercel AI SDK pattern). Fallback: Gemini → retry → alternate. **Hard rule: student-derived data never goes to Chinese-hosted endpoints.** Non-student calls (MCQ drafts from course material) may use cheap open-model providers.
- **Rate-limit-proof by design:** MCQs pre-generated from session PDFs and served from DB; no live LLM calls on the critical path. Queue + backoff + cache.
- **DB: Neon serverless Postgres** — SQL queryable event logs for the DSR dataset; schema in `db/schema.sql`. Vercel Hobby hosting. Front-end: Next.js 16 / React 19 / Tailwind v4.
- **Auth (28 Jul 2026, commits b569cc5 + 408bd54):** real email+password login/signup; `events.student_id` is populated from the session cookie, never the request body. The whole app is gated (`proxy.ts`, deny-by-default) — only `/login`, `/signup` and the login/signup/logout API routes are public. Dashboard reads lifetime totals from `GET /api/stats`. Exercised end to end against live Neon on 28 Jul. First automated tests landed 30 Jul 2026 (`tests/lever.test.ts`) — see the testing rule below.
- **Dev tools:** Claude Code = primary builder. v0 free = frontend scaffolds. Antigravity = free overflow agent. DeepSeek/Qwen via OpenRouter = code review 2nd opinion. Codex = diffs-only review, never the builder. Cursor and Emergent are deliberately excluded.
  - _Revised 28 Jul 2026:_ the original "mini model, $10/mo cap" rule is superseded. `gpt-5.1-codex-mini` was retired by OpenAI (API 404s), and Codex now runs on pay-per-token API-key auth: **`gpt-5.6-terra` for routine diff review, `gpt-5.6-sol` only when explicitly requested.** Cost control moved from model choice to usage discipline: one run per invocation, scoped diffs, no retry fan-out. Watch the credit balance.
  - _Added 28 Jul 2026:_ **GPT-5.6's role in this project is adversary, not author.** Gemini Flash-class models generate bulk content such as question drafts; GPT-5.6 is used to attack and validate that output, and for anything requiring schema-guaranteed JSON via Structured Outputs. It is not the bulk generator — that would spend premium tokens on exactly the high-volume, low-stakes work cheap models are for.
- **Ollama, local-only, added 30 Jul 2026 — difficulty simulation only, never content generation
  (that stays on Gemini).** Already installed, v0.32.1. Three reasons it must be local, in order:
  (1) reproducibility — a hosted model can change mid-pilot and silently shift calibration, which
  would break the paper's instrument; (2) course material never leaves the machine; (3) the research
  finds **weaker models simulate students better** (`docs/literature/item-difficulty-without-students.md`),
  so a small local model is the methodologically correct choice, not a compromise. **Warning:
  `gemma4:31b-cloud` shows up in `ollama list` but is a CLOUD model — do not use it for simulation.**
- Knowledge layer: **input is PDF. LibreOffice is out of the pipeline** (corrected 30 Jul 2026 —
  professors export PDFs from PowerPoint themselves; rationale in `docs/architecture/generator-spec.md`).
  Course material is not a build prerequisite — the professor said any PDF on any topic works for
  building against — but pilot content is sourced from Prof. Singh's decks, no hardcoded questions.
  Clean text/prose material first; mathematics support is deferred (see HANDOFF.md §3a).
  - _Added 31 Jul 2026:_ `scripts/extract-slide-text.mjs` recovers text from image-only slides by
    sending the PDF to **Gemini vision** — 12 of 26 pages of the test deck have no text layer. This is
    content work, so it stays on Gemini, consistent with the existing split: Ollama is local and
    simulation-only, LibreOffice stays out of the pipeline. Gemini's `kind` classification is
    unreliable (mislabelled a real example slide as a template); slide provenance is keyed on the
    number printed on the slide, not on `kind`.
- Total budget ~400–450 hours over 6 months and near-zero cash (~$0–15/mo dev, <$10/mo runtime during pilot). One artifact. Resist scope creep.

## Cadence
Weekly supervisor meetings Mon/Tue afternoons. Next: **Tue 4 Aug 2026 (confirm)** — the transcript has
him travelling Monday and proposing Tuesday same time (`docs/meeting/Jul 27 at 3-39 PM.txt`);
`CLAUDE.md` previously said Monday in error.

## Conventions for Claude Code
- Ask before adding dependencies or paid services.
- Prefer small, verifiable increments matching the week plan in HANDOFF.md §6.
- Any claim destined for the paper must cite a source in `/docs/literature/` or be flagged as unverified.
- When a design decision changes, delete the machinery it obsoleted. The OCR heuristics in `scripts/inspect-source.mjs` survived past "the image path is mandatory," got defended and duplicated across two files, and were reviewed by two model families before a 29 Jul 2026 `/simplify` pass found they never changed a routing outcome.
- **Read the transcript, not the summaries.** Anything stated as a professor decision cites
  `docs/meeting/Jul 27 at 3-39 PM.txt` or is marked as our inference. Five drifts in this file were
  found on 30 Jul 2026 by re-reading the transcript, because summaries are lossy
  (`docs/PROJECT_MAP.md` §2.7 and §0).
- **Tests exist now.** `npm test` runs `node --test tests/*.test.ts`. No external test framework — do
  not add vitest or jest.
- **Do not rely on a model's self-reported difficulty.** Measured 31 Jul 2026, the 1–5 labels are
  **blunt, not broken**: they order items correctly across the full range (ρ = −0.63; d1 91% → d4
  33%) but cannot separate adjacent levels, and the scale is a visible promise to the student. Earlier
  wording here said they "failed on three independent samples" — that was eyeballed and overstated;
  corrected in `docs/PROJECT_MAP.md` §1.6. Simulate an attempt and measure the failure rate instead
  (`docs/literature/item-difficulty-without-students.md`,
  `docs/experiments/2026-07-31_grounded-difficulty-simulation.md`).

## Orchestration (added 28 Jul 2026 — full rationale in `docs/architecture/agent-orchestration.md`)
Two sessions have already died of context exhaustion. The main session is an **orchestrator**: it
holds the plan and delegates the bulk work to subagents in `.claude/agents/`, then reads their short
reports.

- `scout` (haiku, read-only) — "where is X / what does Y do". **Use instead of grepping and reading
  files in the main conversation.**
- `builder` (sonnet) — one scoped code change, verified, reported in <300 words.
- `reviewer` (opus, read-only) — adversarial defect hunt on the diff.
- `codex-review` (sonnet bridge → `codex exec review`) — second opinion from **`gpt-5.6-terra`** by
  default, passed explicitly with `-m`. **Escalates to `gpt-5.6-sol` only when you say so** in the
  request; it will never upgrade on its own judgment. Requires API-key auth (Sol is blocked on
  ChatGPT-account auth). Diffs only, never a builder, one run per invocation, scoped diffs.
  **codex-cli 0.145.0 rejects a steering prompt in every form tested** (found 28 Jul, confirmed
  29 Jul 2026): `--uncommitted "<prompt>"`, `--base <branch> "<prompt>"`, and
  `--commit <sha> "<prompt>"` all fail at argument parsing (`the argument '--commit <SHA>' cannot
  be used with '[PROMPT]'`). No workaround found — a codex review on this version is always
  unsteered; it picks its own focus. Treat topics not mentioned in its report as unreviewed, not
  cleared. `--title` is accepted and is the only way to give it context. The parse errors cost
  nothing (no model call, no billing).
- `gemini-bulk` (haiku bridge → `gemini`) — bulk generation from course material. **Never student data.**
- `db-engineer` (sonnet) — schema, migrations, event-log design. Additive migrations only.
- `scribe` (sonnet) — HANDOFF.md and docs/. Moved up from haiku on 28 Jul after a haiku run
  invented an unverified claim in a doc derived from code.
- `researcher` (sonnet) — cited notes into `docs/literature/`.
- `sol-consult` (sonnet bridge → two-pass `codex exec` with GPT-5.6 Sol) — added 30 Jul 2026 for
  expensive-to-reverse design and research-methods questions. Not a code reviewer (that's
  `codex-review`), never a builder, premium spend, run only when the user approves.

Rules: one agent, one job. Independent agents get spawned in parallel in a single turn. Don't run two
writing agents on the same files at once. Architectural decisions and anything needing the user stay
in the main session.

Session lifecycle: `/resume` at the start, `/checkpoint` before context gets tight — it writes
`docs/CURRENT_STATE.md` so a fresh session loses nothing.
