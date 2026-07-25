# AI-Personalized Gamification Platform

A gamified learning platform where an AI layer designs the gamification itself — quests, badges, point values — per student from their performance history, with a human-in-the-loop teacher approval layer.

**Status:** Development (started Jul 22 2026)  
**Supervisor:** Prof. Harshit Kumar Singh, XLRI  
**Timeline:** 6 months (pilot by mid-September 2026)

## Quick start

See `CLAUDE.md` for the operating brief and `HANDOFF.md` for the full project context.

```bash
# After cloning, install dependencies
npm install

# Start development
npm run dev
```

## Stack

- **Runtime:** Gemini paid Tier 1 (LLM), Supabase/Firebase (DB), Vercel (hosting)
- **Dev:** Claude Code (primary), v0 (frontend), Antigravity (overflow), DeepSeek (code review)
- **Knowledge:** Gamification for Dummies + course material

## Roadmap

See `HANDOFF.md` §6 for the full 3-month breakdown. Current focus: Week 1 — architecture doc + model justification.

## Files

- `CLAUDE.md` — working brief, operations manual
- `HANDOFF.md` — project history, literature, full spec
- `docs/literature/` — reference papers
- `src/` — application source

