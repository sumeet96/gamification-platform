---
description: Rehydrate a fresh session from the last checkpoint and confirm the plan before working
---

Start-of-session rehydration. Keep this cheap — read only what is listed.

1. Read `docs/CURRENT_STATE.md`, then `AGENTS.md`. Do not read `HANDOFF.md` unless CURRENT_STATE.md
   is missing or clearly stale.
2. Run `git status --short` and `git log --oneline -3`. If the working tree disagrees with the
   checkpoint, trust the working tree and say where they differ.
3. Do not open source files yet. If you need to know the state of the code, spawn `scout`.

Then reply with, and nothing more:

- **Where we are** — 3 sentences.
- **Next action** — the single first thing to do, with the file or command.
- **Confirm?** — one question if anything in the checkpoint is ambiguous or looks stale.

Wait for the user before starting work.
