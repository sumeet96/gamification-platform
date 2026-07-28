# CLAUDE.md — Gamified Adaptive Learning Platform

Read `HANDOFF.md` for full project history. This file is the working brief.

## What we're building
A gamified adaptive-learning dashboard. The mechanic is fixed points (+20 correct, −10 negative marking); students see net score against potential. Each student picks exactly one adaptivity lever: either adaptive difficulty (which ramps up/down per performance) or time pressure (clock tightens). Rapid and normal modes. A "keep going → next round" loop drives persistence. Pilot: Prof. Singh's Digital Transformation course (~20 sessions), from ~mid-Sept 2026. The artifact is a Design Science Research piece; per-question event logging is the research dataset.

## Core design rules
- **Fixed point economy:** +20 for correct, −10 for negative marking. Student sees net vs potential (e.g., 60/100).
- **One adaptivity lever per student:** adaptive difficulty (ramps) or time pressure (clock). Not both. Clean experimental design.
- **Rapid and normal modes** control question velocity.
- **Persistence loop:** "keep going → next round" incentivizes repeated engagement.
- Log all events (session, round, per-question interactions, score, adaptivity feedback) for DSR dataset. Do not train on student data.

## Stack & constraints (28 Jul 2026 rebuild — details in HANDOFF.md §4)
- **Runtime LLM: Gemini paid Tier 1** (Flash-class), not free tier — free tier's ~10 RPM and training-data clause fail a classroom pilot. Pending prof sign-off on the small spend; until then, develop against free tier but architect for Tier 1.
- **All LLM calls through one provider-agnostic adapter** (Vercel AI SDK pattern). Fallback: Gemini → retry → alternate. **Hard rule: student-derived data never goes to Chinese-hosted endpoints.** Non-student calls (MCQ drafts from course material) may use cheap open-model providers.
- **Rate-limit-proof by design:** MCQs pre-generated from session PDFs and served from DB; no live LLM calls on the critical path. Queue + backoff + cache.
- **DB: Neon serverless Postgres** — SQL queryable event logs for the DSR dataset; schema in `db/schema.sql`. Vercel Hobby hosting. Front-end: Next.js 16 / React 19 / Tailwind v4.
- **Auth (28 Jul 2026, commit b569cc5):** real email+password login/signup now exist; `events.student_id` is populated from the session cookie instead of always null. Not yet tested against a live database.
- **Dev tools:** Claude Code = primary builder. v0 free = frontend scaffolds. Antigravity = free overflow agent. DeepSeek/Qwen via OpenRouter = code review 2nd opinion. Codex = diffs-only review, never the builder. Cursor and Emergent are deliberately excluded.
  - _Revised 28 Jul 2026:_ the original "mini model, $10/mo cap" rule is superseded. `gpt-5.1-codex-mini` was retired by OpenAI (API 404s), and Codex now runs on pay-per-token API-key auth: **`gpt-5.6-terra` for routine diff review, `gpt-5.6-sol` only when explicitly requested.** Cost control moved from model choice to usage discipline: one run per invocation, scoped diffs, no retry fan-out. Watch the credit balance.
- Knowledge layer: course PDFs → MCQ generator (`scripts/generate-questions.mjs`). No hardcoded questions; all sourced from Prof. Singh's content.
- Total budget ~400–450 hours over 6 months and near-zero cash (~$0–15/mo dev, <$10/mo runtime during pilot). One artifact. Resist scope creep.

## Cadence
Weekly supervisor meetings Mon/Tue afternoons. Next: **Mon 3 Aug 2026**.

## Conventions for Claude Code
- Ask before adding dependencies or paid services.
- Prefer small, verifiable increments matching the week plan in HANDOFF.md §6.
- Any claim destined for the paper must cite a source in `/docs/literature/` or be flagged as unverified.

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
- `gemini-bulk` (haiku bridge → `gemini`) — bulk generation from course material. **Never student data.**
- `db-engineer` (sonnet) — schema, migrations, event-log design. Additive migrations only.
- `scribe` (sonnet) — HANDOFF.md and docs/. Moved up from haiku on 28 Jul after a haiku run
  invented an unverified claim in a doc derived from code.
- `researcher` (sonnet) — cited notes into `docs/literature/`.

Rules: one agent, one job. Independent agents get spawned in parallel in a single turn. Don't run two
writing agents on the same files at once. Architectural decisions and anything needing the user stay
in the main session.

Session lifecycle: `/resume` at the start, `/checkpoint` before context gets tight — it writes
`docs/CURRENT_STATE.md` so a fresh session loses nothing.
