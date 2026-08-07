# Product design rules and current stack detail

Moved verbatim out of `CLAUDE.md` on 7 Aug 2026, when it was split into `AGENTS.md` +
`CLAUDE.md`. The one-line versions of these rules live in `AGENTS.md` and
`DECISIONS.md`; this file holds the detail, the open questions, and the unconfirmed values
that did not need to sit in launch-time context. Nothing was edited in the move.

---

## The adaptivity lever, and the experimental gap it left

- **SUPERSEDED 1 Aug 2026 — one adaptivity lever per student:** adaptive difficulty (ramps) or time
  pressure (clock). Not both. Clean experimental design. Kept here, marked superseded rather than
  deleted, because it is the rule that made the levers a two-arm experiment in the first place.
  - _Superseded by, reported 1 Aug 2026:_ per the user, Prof. Singh has said to drop the
    adaptive-difficulty lever — difficulty tagging is proving difficult — and stick with time
    pressure for everyone.
    - _Transcript status upgraded 7 Aug 2026, but only partway._ The 4 Aug transcript
      (`docs/meeting/Aug 4 at 3-31 PM.txt`) now exists and carries "adaptive difficulty… I have
      shelved for now, but there is some kind of evidence by using and iterating on those local
      models". That is **the user reporting the shelving and the supervisor not objecting** — weaker
      than an explicit ruling, and it does not say the lever is dropped permanently. Treat as
      reported-and-unopposed; do not upgrade it to a decision. The standing rule that professor
      decisions cite a transcript in `docs/meeting/` (five drifts were found on 30 Jul 2026 by
      re-reading one) is what this distinction exists to serve.
  - **OPEN AND URGENT: this removes the between-arm contrast.** The difficulty-vs-time split WAS the
    independent variable. If everyone gets time pressure, nothing is established to vary between
    conditions — time-on vs time-off? rapid vs normal? something else? Without a contrast there is no
    experiment, only an instrumented app.
    - _Status, 7 Aug 2026 — RAISED BUT NOT DISCUSSED, now overdue._ This was the top item for the
      4 Aug meeting. The transcript (`docs/meeting/Aug 4 at 3-31 PM.txt`) is now in the repo and
      **contains no mention of arms, independent variables, or the difficulty-vs-time split at all**.
      It was in the pre-meeting brief and did not come up. Two packages have shipped since
      (A5 on 7 Aug, deliberately `lever: 'none'`), so build work that assumes a design has now
      overtaken the design. This is still the single most consequential open item in this file.
  - **Difficulty moves from item-selection INPUT to analysis COVARIATE, not out of the project.** Even
    under random or least-recently-served item assignment, item difficulty is still needed to say
    anything credible about a time-pressure effect — otherwise a student who drew harder items merely
    looks slower. It also opens whether time pressure hurts disproportionately on hard items. The
    calibration work below (bake-off, term-MCQ rendering) keeps a home in the paper.
  - **Do not delete the adaptive machinery.** The "delete obsoleted machinery" convention below was
    written for code that never changed an outcome; this is a working, tested capability the professor
    may want back once tagging is easier. `nextDifficulty`, the adaptive branch of
    `resolveLever()`/`advanceLeverState()` in `lib/game/engine.ts`, and the difficulty ranking in
    `lib/games/item-select.ts` all stay, parked behind the registry flag, until the decision is
    confirmed in writing. Full detail: `docs/CURRENT_STATE.md`.

---

## Rapid mode, the persistence loop, and event logging

- **Rapid mode decided 31 Jul 2026: fewer questions *and* a fixed per-question timer**, not fewer
  questions alone. Working assumption, pending confirmation: rapid = 10s, normal = 15s, pinned for
  difficulty-lever students while time-lever students still tighten from that base rather than from a
  pinned value — exact seconds UNCONFIRMED. Live collision: `TIME_BASE`/`TIME_MIN`/`TIME_STEP`
  (`lib/game/engine.ts:26-28`) currently tighten the clock only under the time lever; if rapid mode
  pinned the timer for everyone, a time-lever student in rapid mode would get an inert lever. See
  `docs/PROJECT_MAP.md` §1.
- **Persistence loop:** "keep going → next round" incentivizes repeated engagement.
  - _Made measurable 1 Aug 2026:_ `round_offer` was added to `EventType` (`lib/log/logEvent.ts`),
    emitted when the Keep Going affordance renders. The log now distinguishes accepted
    (`round_continue`), declined (`round_stop`), and abandoned (an offer followed by neither) — before
    this, declining and never being offered were the same in the data. Round-number reuse on abandoned
    rounds, which had been corrupting this same measure, was fixed in the same pass.
- Log all events (session, round, per-question interactions, score, adaptivity feedback) for DSR dataset. Do not train on student data.

---

## Runtime stack detail

- **Runtime LLM: Gemini paid Tier 1** (Flash-class), not free tier — free tier's ~10 RPM and training-data clause fail a classroom pilot. Pending prof sign-off on the small spend; until then, develop against free tier but architect for Tier 1.
  - _Provider reality, 31 Jul 2026:_ **Gemini prepayment credits are depleted** — every Gemini call
    429s. Generation currently runs on **OpenAI** via the provider-agnostic adapter
    (`scripts/lib/llm-client.mjs`, default `gpt-4.1-mini`, `--provider openai`). This is the
    adapter-abstraction rule above paying off exactly as designed — a provider outage is a flag
    change, not a rewrite.
  - _Model guidance revised 29 Jul 2026:_ `gemini-2.0-flash` is two generations stale. As of 21 Jul 2026 the current tier is **Gemini 3.6 Flash** ($1.50/$7.50 per 1M tokens) and **Gemini 3.5 Flash-Lite** ($0.30/$2.50). **Flash-Lite is the right default for bulk MCQ generation** — the task is schema-constrained, not reasoning-heavy. Confirm the exact API model string in Google AI Studio and set it via `GEMINI_MODEL` in `.env.local`, not by editing the script fallback. Google no longer publishes universal RPM limits; they are project-specific in the console.
- **All LLM calls through one provider-agnostic adapter** (Vercel AI SDK pattern). Fallback: Gemini → retry → alternate. **Hard rule: student-derived data never goes to Chinese-hosted endpoints.** Non-student calls (MCQ drafts from course material) may use cheap open-model providers.
- **Rate-limit-proof by design:** MCQs pre-generated from session PDFs and served from DB; no live LLM calls on the critical path. Queue + backoff + cache.
- **DB: Neon serverless Postgres** — SQL queryable event logs for the DSR dataset; schema in `db/schema.sql`. Vercel Hobby hosting. Front-end: Next.js 16 / React 19 / Tailwind v4.
- **Auth (28 Jul 2026, commits b569cc5 + 408bd54):** real email+password login/signup; `events.student_id` is populated from the session cookie, never the request body. The whole app is gated (`proxy.ts`, deny-by-default) — only `/login`, `/signup` and the login/signup/logout API routes are public. Dashboard reads lifetime totals from `GET /api/stats`. Exercised end to end against live Neon on 28 Jul. First automated tests landed 30 Jul 2026 (`tests/lever.test.ts`) — see the testing rule below.
- **Quiz hardening (Q1, 31 Jul 2026):** the quiz no longer ships the answer key to the browser.
  `app/api/answer/route.ts` looks the answer up server-side, scores the submission, and is the only
  place `question_answered` gets written — `correctIndex` comes back only on the one POST that
  actually scores an item, never on a repeat. See the reviewer-pass rule under Conventions.
- **Dev tools:** Claude Code = primary builder. v0 free = frontend scaffolds. Antigravity = free overflow agent. DeepSeek/Qwen via OpenRouter = code review 2nd opinion. Codex = diffs-only review, never the builder. Cursor and Emergent are deliberately excluded.
  - _Revised 28 Jul 2026:_ the original "mini model, $10/mo cap" rule is superseded. `gpt-5.1-codex-mini` was retired by OpenAI (API 404s), and Codex now runs on pay-per-token API-key auth: **`gpt-5.6-terra` for routine diff review, `gpt-5.6-sol` only when explicitly requested.** Cost control moved from model choice to usage discipline: one run per invocation, scoped diffs, no retry fan-out. Watch the credit balance.
  - _Added 28 Jul 2026:_ **GPT-5.6's role in this project is adversary, not author.** Gemini Flash-class models generate bulk content such as question drafts; GPT-5.6 is used to attack and validate that output, and for anything requiring schema-guaranteed JSON via Structured Outputs. It is not the bulk generator — that would spend premium tokens on exactly the high-volume, low-stakes work cheap models are for.
  - _Tooling change, 3 Aug 2026:_ Playwright MCP removed, Playwright CLI installed globally instead —
    an MCP server loads its tool schemas every session, a CLI costs nothing until called.
    `.playwright-cli/` and `.playwright/` are gitignored. The `UV_HANDLE_CLOSING` assertion (seen on a
    second Neon `sql` SELECT immediately before `process.exit(0)`) is confirmed to be a **Node
    24.11.1-on-Windows process-exit bug, not a neon-serverless defect** — `playwright-cli --version`
    triggers the identical assertion with no Neon involved; a prior checkpoint had mis-attributed it.

---

## Cadence as of 7 Aug 2026

Time-sensitive. `docs/CURRENT_STATE.md` is the live version.

Weekly supervisor meetings Mon/Tue afternoons. **The 4 Aug meeting happened** —
`docs/meeting/Aug 4 at 3-31 PM.txt` (+ `.m4a`), summarised in `HANDOFF.md` §20.

**Next contact: a Friday 7 Aug check-in the user committed to in that meeting** ("I'll reach out to
you on Friday with whatever progress I have made"). Availability from the same transcript: he is
teaching until the 18th and is free Saturdays and Sundays, so a weekday slot before then is
unlikely. **Two things are owed at that check-in and neither has been sent:** that game 4 became
Connections rather than the crossword he steered toward, and the between-arm contrast, which was in
the pre-meeting brief and never came up.
