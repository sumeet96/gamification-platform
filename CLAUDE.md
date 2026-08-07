@AGENTS.md

# Claude Code specifics

Everything project-wide is in `AGENTS.md` above, which is shared with every other coding agent.
This file holds only what is specific to Claude Code. **Keep both short** — they load into context
on every session, and the documented target is under 200 lines for the pair.

**Code comments that cite `CLAUDE.md` for a project rule predate the 7 Aug split** — this file was
749 lines and held everything. Those rules now live in `AGENTS.md` (binding rules), `DECISIONS.md`
(settled rulings), or the topic docs `AGENTS.md` points to. The comments were left as written rather
than churning 40-odd source files for a citation change; resolve one by searching the rule text, not
by looking for it here.

## Orchestration

Two sessions have died of context exhaustion. The main session is an **orchestrator**: it holds the
plan, delegates bulk work to the subagents in `.claude/agents/`, and reads their short reports.
Full rationale: `docs/architecture/agent-orchestration.md`.

| Agent | Use for |
|---|---|
| `scout` (haiku, read-only) | "where is X / what does Y do" — **use instead of grepping and reading files in the main conversation** |
| `builder` (sonnet) | one scoped code change, verified, reported in <300 words |
| `reviewer` (opus, read-only) | adversarial defect hunt on a diff |
| `codex-review` (bridge → `gpt-5.6-terra`) | second opinion from another model family, diffs only, never a builder |
| `db-engineer` (sonnet) | schema, migrations, event-log design |
| `gemini-bulk` (haiku bridge) | bulk generation from course material — **never student data** |
| `researcher` (sonnet) | cited notes into `docs/literature/` |
| `scribe` (sonnet) | `HANDOFF.md` and `docs/` updates |
| `sol-consult` (bridge → GPT-5.6 Sol) | expensive-to-reverse design questions. Premium spend — **only when the user approves** |

One agent, one job. Spawn independent agents in parallel in a single turn. Never run two writing
agents on the same files. Architectural decisions and anything needing the user stay in the main
session.

**Standing authorisation from the user:** do not ask "should I delegate this or build it here" —
dispatch, parallelise independent work, and carry a package through build → review → commit → push
without waiting for permission at each step.

**Known limitation:** codex-cli 0.145.0 rejects a steering prompt in every form tested, so a codex
review is always unsteered and picks its own focus. Treat topics it does not mention as unreviewed,
not cleared. `--title` is the only way to give it context.

**A subagent can die mid-edit.** One was killed by a session limit on 7 Aug after a single edit,
leaving a dangling forward reference that was worse than the stale text it replaced. When an agent
reports partial completion or dies, check what it actually wrote before assuming nothing changed.

## Session lifecycle

`/resume` at the start; `/checkpoint` before context gets tight. Checkpoint writes
`docs/CURRENT_STATE.md`, which is the single "read me first" entry point —
`docs/NEXT_SESSION_BUILD_BRIEF.md` is a task-scoped brief that CURRENT_STATE points to, not a rival
entry point.

## Dev tooling

Claude Code is the primary builder. v0 for frontend scaffolds; Antigravity as free overflow.
Codex is diffs-only review, never the builder. Cursor and Emergent are deliberately excluded.
Playwright is installed as a CLI, not an MCP server — an MCP server loads its tool schemas every
session; a CLI costs nothing until called.
