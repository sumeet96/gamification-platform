-- Migration 007: atomic board-submit dedupe + free-text placement answers +
-- correcting a misleading comment left by db/004.
--
-- All three changes are additive: no column or row is dropped, renamed, or
-- rewritten. Apply by pasting this file into the Neon web SQL editor (psql is
-- not installed on the dev machine -- see docs/CURRENT_STATE.md).

-- 1. Atomic dedupe for match-the-following board submission.
--
-- app/api/match/submit/route.ts previously deduped a board submission by
-- SELECTing for an existing `board_complete` row whose `question_id` holds
-- the board token's nonce, then inserting if none was found. On the Neon HTTP
-- driver there is no transaction wrapping that check-then-insert, so N
-- parallel POSTs carrying the same valid token all pass the SELECT before any
-- INSERT lands -- all N score, producing N x 120 points and 7N junk rows.
--
-- The fix is to make the insert itself the lock: a unique index the second
-- concurrent insert will violate.
--
-- The `where` clause is mandatory. `question_id` is a legacy free-text marker
-- column: app/api/answer/route.ts already writes the literal string
-- 'seed-fallback' into it on many `question_answered` rows when there is no
-- DB-backed question bank, and preflight on the live dataset (1 Aug 2026)
-- shows ordinary question ids (q1..q20) repeated up to 6x across sessions on
-- `question_answered` rows already. A non-partial unique index on
-- `question_id` would fail to build today and would break the quiz's
-- seed-fallback path going forward. Restricting the index to
-- event_type = 'board_complete' rows only avoids both problems -- within that
-- event_type, question_id is repurposed to hold the board's nonce, which is
-- exactly the value that must be unique.
--
-- Preflight also confirmed (1 Aug 2026, Neon project ancient-brook-62806105):
-- exactly 1 board_complete row exists in the live dataset today and no two
-- board_complete rows share a question_id, so this index builds clean.
--
-- Not run CONCURRENTLY: events has 109 rows total as of this migration, so a
-- brief lock during index build is not a concern; CONCURRENTLY also cannot
-- run inside a transaction block and this file is applied as a single paste,
-- so a plain build is simpler and equally safe at this size.
create unique index if not exists events_board_nonce_uidx
  on events (question_id)
  where event_type = 'board_complete';

-- 2. Free-text placement/answer column.
--
-- `selected_option` is an int (an MCQ option index). Match-the-following
-- writes selected_option = null on every per-pair question_answered row
-- because a match placement is a term string, not an option index -- so the
-- per-pair dataset today records only right/wrong for match, and which wrong
-- term a student placed (the misconception signal) is lost. Nullable text
-- column, additive, never written by the MCQ quiz path.
alter table events add column if not exists submitted_text text;

-- 3. Correcting db/004's `boards_completed` comment.
--
-- db/004_add_event_metrics.sql describes boards_completed as "boards
-- completed so far" -- i.e. a count-before-this-one. That prose is
-- SUPERSEDED and wrong: the shipped code (app/games/match/page.tsx,
-- app/api/match/submit/route.ts) writes the 1-indexed ordinal of the board
-- being completed by *this* event -- values come out 1, 2, 3, ... An analyst
-- who trusts db/004's comment will be off by one in exactly the
-- lever-fired-vs-never-fired analysis this column exists for. No column
-- change needed -- db/004 is already applied and is not being altered; this
-- is a documentation-only correction, also reflected in db/schema.sql.
