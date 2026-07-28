# Agent orchestration setup

_Written 28 Jul 2026. How this project uses subagents to stop running out of context._

## The problem this solves

A Claude Code session has one context window. Every file read, every grep result, every build log
stays in it. Two sessions have already had to be abandoned mid-work because the window filled up.

The fix is not a bigger window. It is keeping the *bulk* out of the main window in the first place.
A subagent runs in its own separate context window, does the messy work there, and returns only its
final message to the main conversation. A subagent that reads 40 files and reports 300 words costs
the main session 300 words.

So the main session stops being a worker and becomes an **orchestrator**: it holds the plan,
decides who does what, reads the summaries, and decides the next move.

## The roles

| Agent | Model | What it does | Can write? |
|---|---|---|---|
| `scout` | Haiku | Finds things. "Where is X / what does Y do" → file:line pointers | No |
| `builder` | Sonnet | Implements one scoped change, verifies it, reports | Yes |
| `reviewer` | Opus | Adversarial defect hunt on the diff | No |
| `codex-review` | Sonnet bridge | Runs OpenAI Codex CLI for a second-opinion review | No |
| `gemini-bulk` | Haiku bridge | Offloads large text generation to the Gemini CLI | Yes (output files) |
| `db-engineer` | Sonnet | Schema, migrations, SQL, event-log design | Yes |
| `scribe` | Sonnet | Updates HANDOFF.md and docs/ | Yes (docs only) |
| `researcher` | Sonnet | Cited literature notes into docs/literature/ | Yes (docs only) |

Definitions live in `.claude/agents/*.md`. Each file is YAML frontmatter (name, description, tools,
model) plus a system prompt in Markdown. Editing one takes effect within seconds — no restart —
except the first time the `agents/` directory is created.

## Model tiering, and why

Cost and latency scale with model size, so the work is tiered by how much judgment it needs:

- **Haiku** — mechanical work with a clear success test: locating code, or shelling out to another
  CLI and handing back what it produced. Cheap and fast, and there is nothing subtle to get wrong.
- **Sonnet** — the workhorse. Implementation, schema design, research synthesis, documentation.
  Real judgment, bounded scope.
- **Opus** — reserved for review and for the orchestrator itself. Finding a subtle scoring bug is
  exactly where the extra capability pays for itself.

Two agents were moved up a tier on 28 Jul 2026, both for the same underlying reason.

`scribe` started on Haiku. Writing docs looked like transcription, but a doc that describes what code
does is not transcription — the first Haiku run asserted that a mid-round page refresh wipes session
state, which is wrong, and it did so after two tool calls.

`codex-review` started on Haiku too, on the theory that a bridge only shells out to another CLI and
relays the answer. That undersold the job. The bridge is also supposed to open each file Codex cites
and discard findings that are wrong about the code, which is judgement work. On the authentication
diff, Codex returned almost nothing and the Haiku bridge relayed that as a clean bill of health,
while the Opus reviewer working from the same files found a HIGH-severity defect. A bridge that
cannot tell a genuine all-clear from a thin response is worse than no second opinion, because it
reads as confirmation.

The lesson generalizes: the tier should follow how much the agent has to *work out*, not how
mechanical the output format looks.

`model: inherit` is the default if you omit the field, which means the subagent uses whatever the
main session is using. That is usually wrong for cheap work — set the model explicitly.

## Cross-model agents

Two agents are bridges to other vendors' CLIs, both already installed:

**Codex** (`codex-cli` 0.145.0) runs `codex exec -m gpt-5.6-terra review --uncommitted`. A different
model family fails differently, so it catches things a Claude reviewer is blind to.

Terra is the mid-tier workhorse of the GPT-5.6 family and handles routine diff review. Sol, the
high-reasoning tier, is reserved for reviews the user explicitly asks for it on. That split is
deliberate: the agent is forbidden from escalating on its own judgment, because "this diff looks
important" is exactly the reasoning that quietly drains a prepaid balance. If Terra's reviewer thinks
a diff deserves a Sol pass, it says so in its report and the orchestrator decides. The model is
always passed explicitly with `-m`; the machine-wide default in `~/.codex/config.toml` is also Terra.

Two constraints found while setting this up, both worth recording. Sol is rejected outright under
ChatGPT-account auth ("not supported when using Codex with a ChatGPT account") and only runs when
Codex is logged in with an API key — `codex login status` should read "Logged in using an API key".
And `gpt-5.1-codex-mini`, the model this project originally standardized on, was retired by OpenAI;
the API now returns `404 Model not found` for the whole `gpt-5.1-codex*` family.

Because billing is pay-per-token against prepaid credits rather than a subscription quota, cost
control lives in usage discipline: Terra by default, one run per invocation, scoped diffs
(`--uncommitted` or a single `--commit`, not `--base main` across many commits), and no retry
fan-out. Each run costs roughly 11k tokens before it reads any code. Codex reviews diffs and never
writes code. `.claude/settings.local.json` denies the bypass-sandbox and full-auto flags outright.

**Gemini** (`gemini` CLI 0.19.4) handles bulk generation from source material — drafting MCQs from
course readings, summarizing long PDFs. It never sees student data; that boundary is written into
the agent's system prompt and is a project-level rule, not a preference.

Both bridges are wrapped in a Haiku agent rather than called directly, so that a 50KB CLI transcript
lands in the bridge's context window and only the verified findings reach the orchestrator.

## The orchestrator's rules

The main session should:

1. **Delegate reading.** Never grep and read files to answer "where is X" — spawn `scout`.
2. **Delegate implementation.** Hand `builder` a spec with the files to touch and an acceptance
   check. Review its 300-word report, not its process.
3. **Give one agent one job.** Scope creep inside a subagent produces a long report, which defeats
   the point.
4. **Run independent agents in parallel.** Multiple spawns in one turn run concurrently.
5. **Hold the plan, not the details.** If the orchestrator is reading a build log line by line,
   something should have been delegated.

What should stay in the main session: architectural decisions, anything needing conversation with
the user, and the final judgment call on a subagent's report.

## Session lifecycle

- `/resume` at the start — reads `docs/CURRENT_STATE.md`, checks git, reports where things stand,
  and waits. Cheap: it deliberately does not open source files.
- `/checkpoint` when context gets tight, or before stopping for the day — writes
  `docs/CURRENT_STATE.md` with what is half-built, what was decided and why, the next three concrete
  actions, and what has already been tried and rejected. Then the session can be closed without loss.

Checkpoint *before* the window is nearly full, not after. Writing a good checkpoint itself needs
room to work.

## What this does not cover

Subagents cannot talk to each other; every result routes through the orchestrator. They share the
working tree, so two writing agents run in parallel on the same files will conflict — either scope
them to different files or run them in sequence.
