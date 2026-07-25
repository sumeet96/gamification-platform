# CLAUDE.md — AI-Personalized Gamification Platform

Read `HANDOFF.md` for full project history. This file is the working brief.

## What we're building
A gamified learning platform where an **AI layer designs the gamification itself** — quests, badges, point values — per student from their performance history. Human-in-the-loop: every AI-proposed quest (with reasoning) needs teacher approval via an admin dashboard before delivery. Pilot: Prof. Singh's Digital Transformation course (~20 sessions, AI-generated MCQs), from ~mid-Sept 2026.

## Core design rules
- **Anti-comfort-zone economy:** point rewards diminish in a student's strong areas; weak areas get more quests and higher rewards.
- **Phase 1** = identical baseline for all students. **Phase 2+** = AI-personalized.
- AI proposals are **structured JSON** (quest, difficulty, points, reasoning) and never reach students without teacher approval.
- Teacher dashboard shows the AI's inferred strengths/weaknesses per student and supports chat-to-redesign.
- Log engagement/satisfaction events from day one (future paper dataset).

## Stack & constraints (ratified 22 Jul 2026 — details in HANDOFF.md §4)
- **Runtime LLM: Gemini paid Tier 1** (Flash-class), not free tier — free tier's ~10 RPM and training-data clause fail a classroom pilot. Pending prof sign-off on the small spend; until then, develop against free tier but architect for Tier 1.
- **All LLM calls through one provider-agnostic adapter** (Vercel AI SDK pattern). Fallback: Gemini → retry → alternate. **Hard rule: student-derived data never goes to Chinese-hosted endpoints.** Non-student calls (MCQ drafts from course material) may use cheap open-model providers.
- **Rate-limit-proof by design:** quest generation = async background jobs (HITL is already async); MCQs pre-generated per session and served from DB; only teacher chat-to-redesign is live. Queue + backoff + cache everywhere.
- **DB: Supabase (Postgres) preferred** — SQL analytics for the paper dataset; Firebase is the fallback if Postgres slows us down. Vercel Hobby hosting.
- **Dev tools:** Claude Code = primary builder. v0 free = frontend scaffolds. Antigravity = free overflow agent. DeepSeek/Qwen via OpenRouter = code review 2nd opinion. Codex = diffs-only review, mini model, $10/mo hard cap, never the builder. Cursor and Emergent are deliberately excluded.
- Knowledge layer: *Gamification for Dummies* + course content.
- Total budget ~400–450 hours over 6 months and near-zero cash (~$0–15/mo dev, <$10/mo runtime during pilot). One artifact. Resist scope creep.

## Cadence
Weekly supervisor meetings Mon/Tue afternoons. Next: **Mon 27 Jul 2026** — deliverable is the architecture doc + model comparison (see HANDOFF.md §7).

## Conventions for Claude Code
- Ask before adding dependencies or paid services.
- Prefer small, verifiable increments matching the week plan in HANDOFF.md §6.
- Any claim destined for the paper must cite a source in `/docs/literature/` or be flagged as unverified.
