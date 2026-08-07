---
description: Save session state to docs/CURRENT_STATE.md so a fresh session can pick up exactly where this one stopped
argument-hint: "[optional note about what you were mid-way through]"
---

Write a handoff checkpoint so this session can be closed and a brand-new one can resume with no loss.

Extra context from the user: $ARGUMENTS

Do this yourself — do not delegate, you are the only one who knows what happened in this session.

1. Run `git status --short` and `git log --oneline -3` for ground truth.
2. Overwrite `docs/CURRENT_STATE.md` with the following. Be specific: names of files, functions, and
   exact next commands. Someone with zero memory of this conversation must be able to continue.

```markdown
# Current state — <absolute date>

## Where we are
<3-5 sentences: what is built and working, what is half-built>

## Working tree
<git status summary; branch; last commit hash + message; anything uncommitted and why>

## In progress right now
<the exact task that was interrupted, the files open on it, and the next concrete step>

## Decisions made this session
- <decision> — because <reason>

## Open questions / blocked on
- <question, and who or what unblocks it>

## Next 3 actions
1. <concrete, with the command or file to start from>
2.
3.

## Do not redo
<paths already explored and rejected, so the next session does not repeat them>
```

3. If anything in this session changed the project's direction, rules, or architecture, also spawn
   `scribe` to fold that into `HANDOFF.md` (chronology) and, if a rule or ruling changed,
   `AGENTS.md` / `DECISIONS.md`. Routine progress does not need this. **`AGENTS.md` and `CLAUDE.md`
   load on every session and are kept under ~195 lines combined — put detail in `docs/`, not there.**
4. Reply with only: the path written, the "Next 3 actions" list, and whether HANDOFF.md was updated.
   Nothing else.
