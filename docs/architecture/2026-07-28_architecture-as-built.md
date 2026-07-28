# Architecture as Built: 28 Jul 2026

**Prepared for:** Project record · **Date:** 28 Jul 2026 · **System state:** commit e0b3fd9, running locally, not pushed.

This document describes the system actually built after the 27 Jul pivot toward a gamified adaptive-learning dashboard. The 27 Jul architecture docs (AI-designed quests with teacher approval, variable-reward experiment) are superseded; see the "Status" section below.

---

## Status

On 27 Jul the supervisor pivoted the project from its original AI-personalized quest design to a simpler gamified dashboard framed as Design Science Research. The codebase was rebuilt to match on 28 Jul.

- **27 Jul docs** (`2026-07-27_architecture-and-model-comparison.md` and `roadmap-and-flow.md`): described the quest-design + teacher-approval vision. Those docs stand as historical record but do not describe the built system.
- **This doc:** describes what was actually implemented.
- **Unchanged:** `docs/architecture/data-layer.md` and `docs/architecture/agent-orchestration.md` remain current.

---

## One-paragraph summary

A gamified adaptive-learning dashboard where students choose a challenge lever (adaptive difficulty or time pressure) and play rounds of multiple-choice questions with fixed +20 points for correct answers, −10 for wrong. Difficulty adapts per answer in adaptive mode; in time mode, difficulty is fixed at level 3 and the countdown tightens instead. State persists in browser sessionStorage across route navigation within a tab. Questions come from a Neon Postgres database or fall back to a hardcoded seed bank when the database is unavailable. Events (session start, round start, question answered, round continue/stop) are logged client-side and posted asynchronously to the server, which inserts them into Neon when connected, attributed to the logged-in student via a signed session cookie. As of 28 Jul 2026, email/password authentication is implemented — signup, login, logout, and a route gate that, after a same-day correction, denies every route by default except `/login`, `/signup`, the auth API, and Next.js internals. The signup and login flows have been exercised manually at least once against a real database, and the gate itself was verified with live HTTP requests against a running server; there is still no automated test of any of it. There is still no teacher dashboard, no AI-generated quests, and no per-student personalization.

---

## Runtime architecture

```mermaid
graph TB
    subgraph Client["Client (Next.js / React 19 / Tailwind v4)"]
        Router["Five routes:<br/>/ (dashboard)<br/>/game-setup<br/>/quiz<br/>/results<br/>/login, /signup"]
        Context["GameContext (React)<br/>sessionId, config, session totals<br/>lastRound summary<br/>resetSession() on auth transitions"]
        Engine["Game engine (pure)<br/>scoreDelta, nextDifficulty,<br/>timeForStreak, roundLength"]
        Storage["sessionStorage<br/>key: alg.session.v1<br/>(cleared on tab close)"]
        Logger["logEvent (fire-and-forget)<br/>keepalive: true<br/>(survives navigation)"]
    end

    subgraph Gate["proxy.ts (Next 16 route gate)"]
        Proxy["Deny by default.<br/>Public: /login, /signup, auth API,<br/>Next.js internals.<br/>Pages redirect to /login;<br/>APIs return 401 JSON."]
    end

    subgraph Server["Server (Next.js API routes)"]
        QAPI["/api/questions GET<br/>→ question pool"]
        EAPI["/api/events POST<br/>→ event ingestion,<br/>student_id from session cookie"]
        AuthAPI["/api/auth/signup, login,<br/>logout, me<br/>→ scrypt hash + signed cookie"]
    end

    subgraph DB["Neon Postgres"]
        QTable["questions table<br/>id, difficulty, prompt,<br/>options, answer"]
        STable["students table<br/>id (opaque), email,<br/>password_hash, dob, consented_at"]
        ETable["events table<br/>session_id, student_id (FK),<br/>event_type, mode, lever, round,<br/>question_id, is_correct,<br/>points_delta, net_after, ..."]
    end

    subgraph Fallback["Offline fallback"]
        Seed["Seed bank (20 hardcoded<br/>questions)"]
    end

    Router --> Proxy
    Proxy --> Router
    Router <--> Context
    Context <--> Engine
    Context <--> Storage
    Context --> Logger
    Router -->|POST credentials| AuthAPI
    AuthAPI -->|insert / select| STable
    AuthAPI -->|set signed cookie| Router
    Logger -->|POST /api/events<br/>keepalive: true| EAPI
    Router -->|GET /api/questions| QAPI
    QAPI -->|if connected| QTable
    QAPI -->|if no rows<br/>or error| Seed
    EAPI -->|reads session cookie| AuthAPI
    EAPI -->|if connected<br/>insert event| ETable
    EAPI -->|if no DATABASE_URL<br/>HTTP 200, stored=false| Client
    
    classDef built fill:#1a472a,color:#d0f4d7
    classDef shell fill:#472a1a,color:#f4d0d0
    classDef data fill:#1a2a47,color:#d0e4f4
    
    class Client,Server,Gate built
    class Seed fallback
    class QTable,ETable,STable data
```

---

## Verified implementation details

### Routes (5 total)

| Route | File | Purpose | State |
|-------|------|---------|-------|
| `/` | `app/page.tsx` | Dashboard; shows session totals (net, potential, accuracy, rounds, continues), the signed-in student's name (fetched from `/api/auth/me`) and a logout control, and links to game-setup. Gated by `proxy.ts` — unauthenticated visitors are redirected to `/login`. | Manually exercised against a live database and login |
| `/game-setup` | `app/game-setup/page.tsx` | Chooses mode (rapid/normal) and lever (adaptive/time), sets fixedDifficulty for time mode. Gated by `proxy.ts` — unauthenticated visitors are redirected to `/login`. | Built, not exercised end to end |
| `/quiz` | `app/quiz/page.tsx` | Renders questions and collects answers, manages the round loop. Gated by `proxy.ts`. | Built, not exercised end to end |
| `/results` | `app/results/page.tsx` | Displays round summary and offers "Keep Going → Next Round" (persist lever, continue) or "Back to Dashboard". Gated by `proxy.ts`. | Built, not exercised end to end |
| `/login` | `app/login/page.tsx` | Email/password form posting to `POST /api/auth/login`; on success calls `resetSession()` and redirects to `/`. A signed-in visitor who navigates here is redirected to `/` instead. | Manually exercised against a live database |
| `/signup` | `app/signup/page.tsx` | Full registration form (name, email, phone, password, dob, gender, education, learning goals) plus a required research-consent checkbox, posting to `POST /api/auth/signup`; on success calls `resetSession()` and redirects to `/`. Password-mismatch errors now render beneath the retype-password field; whole-submission errors (duplicate email, server error) still render at the top. A signed-in visitor who navigates here is redirected to `/` instead. | Manually exercised against a live database |

As of a same-day correction made after the first end-to-end test on 28 Jul 2026, `proxy.ts` denies
every route by default. The only paths reachable without a valid session are `/login`, `/signup`,
the auth API (`/api/auth/login`, `/api/auth/signup`), and Next.js internals (`/_next/static`,
`/_next/image`, `/favicon.ico`). Everything else — `/`, `/game-setup`, `/quiz`, `/results`,
`/api/events`, `/api/questions` — requires a session. Unauthenticated requests to a page redirect to
`/login`; unauthenticated requests to any other API route return a 401 JSON response instead of a
redirect. This replaces the earlier version of the gate, which covered only `/quiz`, `/game-setup`,
and `/results` and left the dashboard reachable while signed out.

This correction was prompted by the first live end-to-end test: with `/` open, a student could play
a full round anonymously, writing events with a null `student_id`. Logging in afterwards correctly
started a clean session and discarded that anonymous local score, which looked like scores being
silently lost. Gating `/` removes the anonymous-play path rather than trying to merge it into an
account after the fact — see `data-layer.md` for why merging was rejected.

### Game engine (`lib/game/engine.ts`) — pure, testable, reusable

**Scoring:**
- Correct answer: +20 net, +20 potential.
- Wrong answer: −10 net, 0 potential.

**Difficulty (adaptive mode only):**
- `nextDifficulty(current, correct)`: correct → +1 level, wrong → −1 level, clamped to 1–5.
- Time mode uses a fixed difficulty (default level 3) for the entire round.

**Time (time mode only):**
- `timeForStreak(consecutiveCorrect)`: starts at 10s for the first question, subtracts 2s per consecutive correct answer, floored at 5s. A timeout is committed as a wrong answer and costs −10 points.

**Round length:**
- `roundLength(mode)`: rapid = 10 questions, normal = 20 questions.

The engine is pure and therefore testable, but **there are no tests**. The repository has no test framework, no test script in `package.json`, and no test files. Verification to date is `npm run build` plus manual play.

### State management (`lib/game/game-context.tsx`)

A React context provider holds session-level state:

- `sessionId`: a random UUID or fallback timestamp-based ID, generated once on first load.
- `config`: the lever choice (adaptive/time) and mode (rapid/normal), set on `/game-setup` and persisted until the session ends.
- `session`: running totals across all rounds: net, potential, roundsPlayed, continues, correct, wrong, answered.
- `lastRound`: summary of the most recent round (net, potential, correct, wrong, answered, peakDifficulty, bestTimeMs, lever, mode).

**Persistence:** Backed by `sessionStorage` under the key `alg.session.v1`. State survives route navigation within the same tab. **Not verified:** behavior on page refresh. State is cleared when the tab closes.

**Event emission:** `context.emit(event)` appends the sessionId and posts the event asynchronously via `logEvent()`.

### Question supply (`app/api/questions/route.ts`)

GET `/api/questions` returns a JSON object `{ source: 'db' | 'seed', questions: Question[] }`.

**With database:** Queries the `questions` table (id, difficulty, prompt, options, answer). Difficulty is clamped to 1–5.

**Without database:** Falls back to `QUESTIONS` from `lib/game/questions.ts`, a 20-question hardcoded seed bank tagged by difficulty, themed on Digital Transformation / business terminology.

**Question selection** (`lib/game/questions.ts`, `pickQuestion(pool, difficulty, usedIds)`): Returns a random unused question at the target difficulty. If none exists, widens the difficulty radius (±1, then ±2, etc.). If still none, returns any unused question. If the pool is exhausted, returns null (the UI is responsible for handling "no more questions").

### Event logging

**Client side** (`lib/log/logEvent.ts`):
- Five event types: `session_start`, `round_start`, `question_answered`, `round_continue`, `round_stop`.
- Fire-and-forget: `logEvent()` issues an async fetch with `keepalive: true`, so events posted during navigation survive the page transition.
- In dev, echoes to console.
- No retry or queuing; dropped events are not recovered.

**Server side** (`app/api/events/route.ts`):
- POST `/api/events` accepts a JSON event object.
- If `DATABASE_URL` is set: inserts into the `events` table and returns `{ ok: true, stored: true }`.
- If `DATABASE_URL` is not set: returns `{ ok: true, stored: false }` (silent no-op, the app continues).

### The persistence loop ("Keep Going")

Results screen offers two buttons: "Keep Going → Next Round" and "Back to Dashboard".

- **Keep Going:** calls `registerContinue()` to increment the `continues` counter, then navigates straight to `/quiz`, **skipping `/game-setup`**. The lever and mode choices carry over from the previous round.
- **Back to Dashboard:** navigates to `/`. It does **not** reset the session — cumulative totals and the lever/mode config survive, so the student can start another round from the dashboard and it still counts toward the same session.

This is the mechanism for measuring voluntary persistence (the `continues` counter and `round_continue` events).

### Database client (`lib/db/client.ts`)

A singleton that wraps the Neon serverless Postgres client:

```typescript
export function getSql(): NeonQueryFunction | null
```

Returns the client if `DATABASE_URL` is set, otherwise null. All downstream code that uses `getSql()` checks for null and degrades gracefully (questions fall back to seed, events no-op).

### Authentication (`lib/auth/`, `app/api/auth/*`, `proxy.ts`) — added 28 Jul 2026

Email and password auth, built with no new dependencies — `node:crypto` only.

**Password storage** (`lib/auth/password.ts`): scrypt with a 16-byte random salt per password,
stored as `"saltHex:hashHex"`. Verification derives at a fixed 64-byte key length and rejects
malformed stored hashes before deriving, then compares with `timingSafeEqual` — never `===`.

**Session cookie** (`lib/auth/session.ts`): stateless, no server-side session store. The payload
`{ id, exp }` is base64url-encoded and HMAC-SHA256 signed with `SESSION_SECRET` (required from the
environment; the module throws rather than sign or verify without it), producing a
`payload.signature` token. Cookie flags: httpOnly, `sameSite: lax`, `secure` in production, 30-day
`maxAge`. `readSession()` verifies the signature with `timingSafeEqual` and checks expiry, and
returns `null` on any malformed input rather than throwing.

**Routes:**
- `POST /api/auth/signup` — validates name, email format, an 8-character minimum password, and a
  required consent boolean; generates an opaque student id (`s_` + 12 random bytes, never the
  email), hashes the password, inserts into `students` with `consented_at = now()`, and signs a
  session cookie into the response. A duplicate email (case-insensitive) returns 409.
- `POST /api/auth/login` — looks up by lowercased email, verifies against a dummy hash when no
  account is found (so a nonexistent account takes the same scrypt cost as a wrong password),
  returns the identical generic error either way, and signs a session cookie on success.
- `POST /api/auth/logout` — clears the cookie (`maxAge: 0`). No auth check needed to log out.
- `GET /api/auth/me` — returns the signed-in student's id and name only, 401 if not signed in.

**Route gate** (`proxy.ts`): this is Next 16's renamed `middleware.ts` successor — proxy always
runs on the Node.js runtime, which is what lets it use `node:crypto`-based cookie verification (via
`lib/auth/session.ts`) directly, unlike edge middleware. As of a same-day correction on 28 Jul 2026,
it denies every route by default: only `/login`, `/signup`, the auth API, and Next.js internals are
public. A page request with no valid session (`readSession()` returns null) redirects to `/login`;
an API request with no valid session returns a 401 JSON body instead of redirecting. A signed-in
visitor to `/login` or `/signup` is redirected to `/`.

**The point of it:** `app/api/events/route.ts` reads the session via `getCurrentStudent()`
(`lib/auth/current-student.ts`, which wraps `next/headers`'s `cookies()`) and writes `student_id`
from it — never from the POST body, since a client-supplied id would be forgeable and would
silently corrupt the research dataset. If the students row the cookie points at has disappeared
(FK violation, Postgres error `23503`), the insert retries once with `student_id = null` so the
event itself is never dropped, only its attribution.

**Identity/session coupling:** `resetSession()` (`lib/game/game-context.tsx`) is called on every
login, signup, and logout — it mints a fresh `session_id`, clears `sessionStorage['alg.session.v1']`,
and emits a new `session_start`. Without this, a shared classroom laptop could let one
`session_id` (and its `round`/`continues` counters) carry across two different students.

---

## What is deliberately deferred vs. what is missing

### Deliberately deferred (architectural holes waiting for Phase 2+)

These are features whose absence is planned; they are mentioned in CLAUDE.md or known from the pivot:

- **AI quest designer:** The AI layer, adapter pattern, and quest + reasoning schema are designed in the 27 Jul docs but not implemented. The supervisor may restore this in a future phase.
- **Teacher dashboard:** Needed for the human-in-the-loop approval loop. Designed but not built.
- **Per-student personalization:** No student profiler, no strength inference, no AI-designed difficulty ramps or reward levels. Phase 2 feature.
- **MCQ generation as a server-side job:** Generation itself is **built** — `scripts/generate-questions.mjs` reads a PDF with `pdf-parse`, sends an excerpt to Gemini, and upserts the resulting MCQs into the `questions` table (see `data-layer.md` for the full path). What is deferred is running it as an async job: today it is a manual command a human runs locally, with no upload UI, no scheduling, and no per-session pre-generation.
- **Large PDF chunking:** The generator sends only the first ~12,000 characters of a document. Chunking a full book across multiple calls is designed but not implemented.
- **Competition arm:** Mentioned in the 27 Jul docs as a Phase 2 feature; not built.
- **CAT / adaptive testing:** Mentioned as a future upgrade; the current difficulty logic is simple ±1 ramping.
- **HEXAD player-type inference:** Designed in the 27 Jul docs; not implemented.
- **Auth extras:** No password reset flow, no email verification, no OAuth/SSO. The login form's "Remember me" checkbox and "Forgot password?" link, and the signup form's "Terms of Service" checkbox, are still cosmetic — none of them are wired to anything server-side.

### Completely missing (not part of the current scope)

- **Multi-student management:** No cohort concept, no roster, no way to partition students or aggregate results beyond a `group by student_id` query.
- **Data export or analytics dashboard:** No UI to inspect the events table or generate reports.
- **Age bracket tracking:** The seed bank does not capture age. The events table has no age_bracket column in the current schema (this was a 27 Jul feature that did not survive the pivot).
- **Skill taxonomy:** No topic tags, no way to target questions by subject.
- **Spaced repetition or review queue:** Missed questions do not resurface; they are simply deducted from the available pool.

---

## What has and has not been verified

### Verified by code inspection

- Engine logic (scoreDelta, nextDifficulty, timeForStreak, roundLength) matches the spec and is testable.
- Context state persists to sessionStorage with key `alg.session.v1` and survives route navigation.
- Questions API returns `{ source: 'db' }` or `{ source: 'seed' }` depending on connection.
- Events API accepts POST requests and inserts to Neon when connected, attributing `student_id` from the session cookie via `getCurrentStudent()`, and retries with a null `student_id` on an FK violation.
- Auth routes (signup, login, logout, me) match the design described above: password hashing with scrypt, timing-safe comparison, a dummy-hash check on login so an unknown email doesn't respond measurably faster, and a signed, httpOnly session cookie.
- `resetSession()` is called from the login, signup, and logout handlers, and mints a fresh `session_id`.
- Five routes exist as described; login and signup are reachable both from in-page links and via the `proxy.ts` redirect.
- The persistence loop ("Keep Going") increments continues and skips game-setup, carrying the lever choice forward.
- The code was reviewed and type-checked, and `npm run build` passes.

### Verified by live HTTP requests against a running server

This is a stronger claim than code inspection or manual browser use — these were confirmed with
direct HTTP requests, not just by reading the code or clicking through a browser:

- `proxy.ts` denies every route by default. `/login`, `/signup`, the auth API, and Next.js internals
  are reachable without a session; every other route is not.
- An unauthenticated page request redirects to `/login`; an unauthenticated API request
  (`/api/events`, `/api/questions`) returns a 401 JSON body rather than a redirect.
- A signed-in visitor to `/login` or `/signup` is redirected to `/`.

### Verified manually against a live database (browser + real signup/login, no automated test)

- Signup and login have each been exercised at least once against a real database: an account was
  created, the session cookie was set, and the resulting session reached the dashboard.

### Not verified (no test evidence or manual test data)

- The full auth flow beyond the single manual pass above — repeated logins, logout, expiry, and the
  full breadth of validation error paths have not been exercised, and none of this is covered by an
  automated test.
- Whether the FK-violation retry path in `/api/events` (Gap 7 in `data-layer.md`) has ever actually triggered, or is verified only by reading the error-handling code.
- Behavior on page refresh (does sessionStorage hydrate correctly, or is state lost?).
- Whether a timeout in time mode is correctly committed as a wrong answer and costs −10 points (quiz UI logic is complex; this would require tracing through a quiz playthrough).
- Whether the keepalive flag on logEvent actually ensures events survive navigation (browser support is good but timing-dependent).
- Whether difficulty widening in pickQuestion works as intended when the exact difficulty runs out of unused questions.
- Whether the seed bank is reached when Neon is disconnected (code path exists, but untested against a real database failure).
- Whether the session persists correctly across a long round (state updates are batched; potential race conditions not ruled out).

---

## Database schema (current)

Three tables exist in Neon (see `docs/architecture/data-layer.md` for full schema):

**questions**
- id, difficulty, prompt, options (JSON), answer (index)

**students** (added 28 Jul 2026, `db/001_add_students.sql`)
- id (opaque, not email), email (unique, case-insensitive), password_hash, name, phone, dob, gender, education, learning_goals, consented_at, created_at

**events**
- session_id, student_id (FK to students, nullable), event_type, mode, lever, round, question_id, is_correct, points_delta, negative_applied, net_after, created_at, ...

---

## Stack and deployment

- **Runtime:** Next.js 16 on Vercel Hobby (cost: free tier).
- **Database:** Neon serverless Postgres (cost: free tier during dev; small paid tier during pilot).
- **Frontend:** React 19, Tailwind CSS v4.
- **Styling:** Aurora Glass theme (animated gradient mesh, frosted glass, celebratory animations). See `app/layout.tsx` and component files.
- **State:** sessionStorage (browser) + React context (in-memory).
- **Auth:** Email/password, `node:crypto` scrypt hashing, signed session cookie, `proxy.ts` route gate (deny-by-default as of a same-day correction). Added 28 Jul 2026; signup, login, and the gate have each been exercised at least once against a live database and, for the gate, with live HTTP requests — the rest of the auth surface has not been tested.

---

## References and related documents

- `docs/architecture/data-layer.md`: Database schema details (current).
- `docs/architecture/agent-orchestration.md`: How subagents coordinate to build this codebase (current).
- `CLAUDE.md`: Project rules and constraints (current).
- `HANDOFF.md`: Full project history and decisions up to 28 Jul.
- `2026-07-27_architecture-and-model-comparison.md`: **Superseded.** Describes the quest-design vision that was replaced.
- `roadmap-and-flow.md`: **Superseded.** Describes the Phase 1 → Phase 2 trigger and the reward experiment that was removed.
