# Current state — 28 Jul 2026

## Where we are

The game (dashboard → game-setup → quiz → results) is built and runs locally. Email+password
authentication was wired today so `events.student_id` is finally populated — before this, every
logged event was anonymous and no per-student analysis was possible. All auth code is committed,
reviewed, type-checked, and builds clean. **It has never been run against a live database or in a
browser.** An agent orchestration setup (`.claude/agents/`, `/checkpoint`, `/resume`) was also built
and committed, and all project docs were brought in line with the 27 Jul pivot, which they had never
reflected.

The interrupted task is Neon setup. `SESSION_SECRET` is in `.env.local`, but **there is no Neon
project yet** — `DATABASE_URL` is unset, so no schema exists anywhere. Until a database is connected,
signup returns a clean `500 database not configured` and no events are persisted (the game itself
still plays, on the seed bank, with events going to the browser console).

## Working tree

Branch `main`, clean — nothing uncommitted, nothing stashed. Not pushed to any remote.

```
b569cc5  Wire email+password auth so events carry a real student_id
df8fe57  Add agent orchestration; bring docs in line with the 28 Jul rebuild
e0b3fd9  Rebuild as adaptive learning game (Next16/React19/TW4) + Neon data layer
```

`.env.local` holds `DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL` (gitignored,
correct). Note: `.env.local.example` was accidentally destroyed earlier by being *moved* rather than
copied to `.env.local`; it has been restored and now documents `SESSION_SECRET`.

## In progress right now

**Creating the Neon project and connecting it.** No database exists yet. Steps: sign up at neon.tech
(free tier, no card), create a project in AWS `ap-south-1` (Mumbai — nearest region, and latency
matters during a live classroom), open Connection Details, toggle **Pooled connection**, copy that
string into `DATABASE_URL=` in `.env.local`.

Then, on a **brand-new empty database, run `db/schema.sql`, NOT the migration.** `schema.sql` is the
full canonical schema and already contains `students`, `events` with its foreign key, and every
index. `db/001_add_students.sql` is only for upgrading a database that predates the `students`
table — its `alter table events` would fail on an empty database because `events` does not exist yet.

`psql` is NOT installed on this machine, so use the Neon web SQL editor: paste the file contents in
and Run. Both files are re-runnable.

Verify it landed:

```sql
select
  (select count(*) from information_schema.tables where table_name = 'students') as students_table,
  (select count(*) from pg_constraint where conname = 'events_student_id_fkey') as fk,
  (select count(*) from pg_indexes where tablename = 'events'
     and indexname in ('events_student_idx','events_session_round_idx')) as new_indexes;
```

Expected result: `1, 1, 2`.

If the user would rather not use the web editor, the agreed fallback is to write a small migration
runner using `@neondatabase/serverless` (already a dependency — no new package needed). It was
offered and not yet accepted.

## Decisions made this session

- **Orchestrator + subagent model adopted** — two prior sessions died of context exhaustion. Main
  session holds the plan and delegates; agents live in `.claude/agents/`.
- **`scribe` moved haiku → sonnet** — haiku scribes fabricated three claims across three documents
  (a page-refresh behaviour, a claim the engine was unit- and property-tested when no test framework
  exists, and two entries calling MCQ generation unbuilt when `scripts/generate-questions.mjs`
  implements it). Docs derived from code need reasoning, not transcription.
- **Codex CLI upgraded 0.65.0 → 0.145.0 and switched to API-key auth** — `gpt-5.1-codex-mini` was
  retired by OpenAI (API 404). Auth is now an API key with prepaid credits, no subscription.
- **`codex-review` defaults to `gpt-5.6-terra`; Sol only when the user asks by name** — the agent is
  explicitly forbidden from escalating on its own judgement about how important a diff looks. This
  supersedes CLAUDE.md's old "mini model, $10/mo cap" rule.
- **Auth: email+password, zero new dependencies** — `node:crypto` scrypt for hashing, HMAC-SHA256
  signed stateless cookie for sessions. `package.json` is unchanged.
- **`students.id` is opaque, not the email** — so no direct identifier ever reaches the event log and
  the dataset can be analysed without touching PII.
- **`student_id` is read from the session cookie, never the request body** — a client-supplied id
  would be forgeable and would corrupt the dataset undetectably. The body may carry
  `client_student_id`, but only as a cross-tab mismatch signal that can null out attribution; it can
  never set it.
- **Demographics are persisted** (`dob` for the age covariate) with a required, server-enforced
  consent checkbox recorded as `consented_at`.

## Open questions / blocked on

- **Nothing has been tested end to end.** Blocked on the migration being applied. This is the single
  most valuable next step — it is the only thing that would actually prove the auth works.
- **A cosmetic terms-of-service checkbox sits next to the real research-consent checkbox** on the
  signup form, and nothing server-side reads it. For a consent form that is a problem an ethics
  reviewer would notice. Decision needed: delete it or make it mean something.
- **`scripts/generate-questions.mjs` defaults to `gemini-2.0-flash`** — an old model to be
  standardising on. Should be revisited before the real question bank is generated.
- **Shared-device protocol for the pilot.** Code now resets the session on login/signup/logout, but a
  student who walks away without logging out still leaves the next person's events attributed to
  them. This is a classroom-protocol matter, not a code one.
- **Cross-tab `BroadcastChannel` reset** is the stronger fix for the two-tab identity problem; only
  the server-side mismatch guard is built. Deliberately deferred, not forgotten.

## Next 3 actions

1. **Apply the migration.** Paste `db/001_add_students.sql` into the Neon SQL editor and run it, then
   run the verification query above and confirm `1, 1, 2`.
2. **End-to-end test.** `npm run dev`, sign up as a test student, play one round, then check every
   row carries a non-null `student_id`:
   ```sql
   select event_type, student_id, session_id, round, is_correct, points_delta
   from events order by created_at desc limit 10;
   ```
3. **Decide the consent-form fix** (delete the cosmetic ToS checkbox or wire it), and consider
   pushing `main` — two commits exist locally and nothing has been pushed to a remote.

## Do not redo

- **Do not re-verify `data-layer.md`'s claims against the code** — every claim was checked line by
  line against `lib/db/client.ts`, both API routes, `logEvent.ts`, the seed bank and the generator.
  It was clean.
- **Do not re-review the auth code from scratch.** Two full Opus review passes were done. Six defects
  were found and fixed; the last pass returned "safe to commit" with three LOW residuals, two of
  which were then fixed. The identity path was additionally verified by hand.
- **Do not try `gpt-5.1-codex-mini`, `gpt-5.1-codex`, or `gpt-5.1-codex-max`** — all retired, the API
  returns 404. Only the `gpt-5.6-*` family works.
- **Do not use `psql`** — it is not installed on this machine.
- **Do not add bcrypt, argon2, or an auth library.** The zero-dependency `node:crypto` approach is
  built, reviewed and working; `package.json` is deliberately unchanged.
- **Do not trust the `codex-review` arm as independent confirmation on its own.** On the auth diff it
  returned no findings while the Opus reviewer found a HIGH; its value is still unproven.
