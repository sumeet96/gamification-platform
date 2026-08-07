-- Migration 011: schema for package A5, the Connections game.
--
-- NOT YET APPLIED. Written by db-engineer, additive only, re-runnable. A human
-- must paste this into the Neon web SQL editor (psql is not installed on the
-- dev machine -- see docs/CURRENT_STATE.md).
--
-- Preflight run 6 Aug 2026 against Neon project ancient-brook-62806105,
-- server_version 18.4 (df16b3c) -- comfortably >= 15, so NULLS NOT DISTINCT
-- (Postgres 15+) is available for the new partial unique index below, same
-- as db/008 relied on.
--
--   select count(*) from content_items;                          --> 180
--   select subject, count(*) from content_items
--     where kind='term_definition' and retired_at is null
--     group by subject;
--     --> Digital Transformation: 113, International Management: 9
--     (confirms docs/NEXT_SESSION_BUILD_BRIEF.md's "113 live DT term rows")
--   select count(*) from events;                                  --> 308
--   select count(*) from events where event_type = 'guess_submitted';
--     --> 0 (no rows exist yet for the new idempotency index to conflict with)
--   no table named connection_% exists yet
--
-- *** DOCUMENTED CONTRADICTION SETTLED (asked for explicitly in this task) ***
-- db/schema.sql (pre-this-migration) carried a comment saying db/008's
-- events_answer_commit_uidx was "NOT YET APPLIED -- blocked on 11 duplicate
-- choose-word rows". That comment was stale. `select indexname, indexdef from
-- pg_indexes where tablename = 'events'` shows BOTH events_board_nonce_uidx
-- (db/007) and events_answer_commit_uidx (db/008) exist live today, and
-- db/008's own header already said APPLIED 1 Aug 2026 -- CLAUDE.md's account
-- (A3 shipped relying on it, verified via a 12-way concurrency salvo) is the
-- correct one. Re-running db/008's blocking preflight query today (grouping
-- question_answered rows by session_id, round, content_item_id, student_id,
-- boards_completed, game_type having count(*) > 1) returns ZERO rows -- the
-- index is live and enforcing, so there is nothing left to block. This
-- migration corrects db/schema.sql's stale comment in the same edit that
-- folds in the tables below (see db/schema.sql around the events_answer_
-- commit_uidx block), which is a documentation-only fix -- no DDL, no data
-- touched by that correction.
--
-- events columns as of this preflight (for the "genuinely additive" check
-- below): id, session_id, student_id, event_type, game_type, mode, lever,
-- round, question_id, difficulty_level, time_limit, time_taken_ms,
-- is_correct, points_delta, negative_applied, net_after, created_at,
-- selected_option, content_item_id, adapt_granularity, boards_completed,
-- cognitive_level, submitted_text. None of board_id, guess_hash,
-- mistakes_made, groups_solved, deselect_count, shuffle_count, is_forced,
-- terminal_reason, shuffle_seed, one_away, group_ordinal exist yet -- all
-- eleven below are genuinely new.
--
-- *** AMENDED IN PLACE, same day, before this file was ever applied to Neon
-- *** (asked for explicitly: fix here, not a follow-up db/012).
-- The first draft of this migration shipped no columns for the shuffle seed,
-- the per-guess one-away flag, or which group ordinal a group_solved row
-- resolved -- app/api/connections/{board,submit}/route.ts packed all three
-- into submitted_text as an ad-hoc JSON/plain blob instead, which the
-- research dataset would have had to string-parse rather than select. Caught
-- in review before this file was applied. See the three new add-column
-- lines below (shuffle_seed, one_away, group_ordinal) and their WHY
-- comments for the fix; the route code was updated in the same pass to
-- write the real columns instead of the blob.
--
-- *** docs/NEXT_SESSION_BUILD_BRIEF.md CORRECTIONS (two) ***
-- §5's table lists `board_token` as a column on `connection_boards`. That is
-- wrong and is NOT implemented below. A board token is a per-serve,
-- unguessable nonce minted by lib/auth/board-token.ts and returned once in
-- the /api/connections/board response payload -- exactly the value match
-- already writes into events.question_id on its board_complete row. Persisting
-- a token on the connection_boards ROW would make it a static, reused secret:
-- every student served that board would get the same nonce, which defeats
-- the whole point of a single-use dedupe token and would let a second student
-- replay the first student's board_complete submission. Nothing in this file
-- creates a board_token column; the nonce lives only in-flight and in the one
-- events row it authorizes, matching db/007's design exactly.
--
-- Second correction: §3 and §7 of the brief both point at
-- `lib/games/board-token.ts`. That path does not exist -- the module is at
-- `lib/auth/board-token.ts`, used correctly above and throughout this file.

-- ---------------------------------------------------------------------------
-- 1. connection_groups -- one taxonomic group of 4 terms (a "yellow/green/
--    blue/purple" row on the finished board).
-- ---------------------------------------------------------------------------
create table if not exists connection_groups (
  id             text primary key,
  subject        text not null,
  label          text not null,               -- the category name revealed on solve, e.g. "Stages of Design Thinking"
  created_at     timestamptz default now(),

  -- Retire, never delete -- events may already reference a board built from
  -- this group by the time a defect is found, and events is the append-only
  -- research dataset (same reasoning as db/009 on content_items). NULL
  -- retired_at means live/usable in a newly authored board. A matched pair
  -- with retired_reason, same shape as db/009's content_items check.
  retired_at     timestamptz,
  retired_reason text
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'connection_groups_retired_consistency_check'
      and conrelid = 'connection_groups'::regclass
  ) then
    alter table connection_groups
      add constraint connection_groups_retired_consistency_check
      check ((retired_at is null) = (retired_reason is null));
  end if;
end $$;

-- Allowlist, not free text, so `group by retired_reason` stays analyzable
-- for the paper's methods section (db/009/db/010's rationale, unchanged
-- here). Three reasons, each reflecting something this build can actually
-- produce -- no speculative fourth value:
--   'ambiguous'      -- the group's own membership admits more than one
--                        defensible label, independent of the rest of the
--                        board (docs/NEXT_SESSION_BUILD_BRIEF.md §5's
--                        "this board seems ambiguous" affordance is
--                        board-grained, logged as board_reported_ambiguous
--                        below -- but a human reviewing a report may localize
--                        the defect to one group, which this reason records).
--   'superseded'     -- replaced by a re-authored group for the same
--                        category (mirrors content_items' 'superseded').
--   'member-retired' -- one of the group's four content_items rows was
--                        itself retired (db/009/010), so the group can no
--                        longer be served even though nothing about the
--                        grouping logic was wrong.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'connection_groups_retired_reason_check'
      and conrelid = 'connection_groups'::regclass
  ) then
    alter table connection_groups
      add constraint connection_groups_retired_reason_check
      check (retired_reason is null or retired_reason in ('ambiguous', 'superseded', 'member-retired'));
  end if;
end $$;

-- Least-recently-served board selection and the one-subject-per-board rule
-- both need "which groups/boards are live in subject X", same shape as
-- db/009's content_items_live_idx. Partial on the live subset since retired
-- rows are expected to stay a small, mostly static minority.
create index if not exists connection_groups_live_idx
  on connection_groups (subject)
  where retired_at is null;

-- ---------------------------------------------------------------------------
-- 2. connection_group_members -- the 4 content_items rows inside one group.
-- ---------------------------------------------------------------------------
create table if not exists connection_group_members (
  group_id        text not null references connection_groups(id),
  content_item_id text not null references content_items(id),
  ordinal         int  not null check (ordinal between 0 and 3),

  primary key (group_id, ordinal),
  unique (group_id, content_item_id)   -- a tile cannot repeat inside its own group
);

-- Reverse lookup: "which group(s) is this content_item a member of" -- needed
-- to cascade a content_items retirement (db/009/010) into the
-- 'member-retired' connection_groups reason above, and for any analysis that
-- starts from an item rather than a board.
create index if not exists connection_group_members_item_idx
  on connection_group_members (content_item_id);

-- Cardinality note -- READ BEFORE TRUSTING THIS TABLE'S SHAPE.
-- "Exactly 4 members per group" cannot be expressed declaratively in
-- Postgres without a trigger or a deferred constraint, and this project does
-- not use triggers (CLAUDE.md, standing convention). The two constraints
-- above enforce only the checkable HALF: ordinal in [0,3] plus uniqueness
-- bounds a group at AT MOST 4 rows, never at least 4 and never exactly 4.
-- "Exactly 4" is an AUTHORING-TIME invariant, checked by the board-authoring
-- script and its tests, not by the database. Verification query (empty
-- result = healthy, run any time, read-only):
--
--   select group_id, count(*) as member_count
--   from connection_group_members
--   group by group_id
--   having count(*) <> 4;

-- ---------------------------------------------------------------------------
-- 3. connection_boards -- a served unit: 4 groups, 16 tiles total.
-- ---------------------------------------------------------------------------
create table if not exists connection_boards (
  id             text primary key,
  subject        text not null,

  -- Deliberately nullable and unwritten in this build (docs/
  -- NEXT_SESSION_BUILD_BRIEF.md §6: "ship without ... difficulty", CONFIRMED
  -- by the user 6 Aug 2026). Kept as a column, not omitted, so switching a
  -- difficulty lever on later for Connections is a data change (populate
  -- this column, add a tiebreak in board selection) rather than a migration.
  -- As of this preflight NO term_definition row in content_items has a
  -- difficulty value either -- all 113 live DT rows are null -- so there is
  -- nothing to derive a board-level value from yet even if the lever were
  -- switched on today. A CHECK matching questions.difficulty's convention
  -- (1..5) is added now so a future write is validated from day one instead
  -- of needing its own migration.
  difficulty     int check (difficulty is null or difficulty between 1 and 5),

  created_at     timestamptz default now(),

  -- Retire, never delete -- same reasoning as connection_groups above and
  -- db/009 on content_items.
  retired_at     timestamptz,
  retired_reason text
);

-- No board_token column here -- see the header comment. The nonce is minted
-- per serve by lib/auth/board-token.ts and returned in the response payload
-- only; it is never persisted on this row.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'connection_boards_retired_consistency_check'
      and conrelid = 'connection_boards'::regclass
  ) then
    alter table connection_boards
      add constraint connection_boards_retired_consistency_check
      check ((retired_at is null) = (retired_reason is null));
  end if;
end $$;

-- Same three reasons as connection_groups, symmetric meaning one level up:
--   'ambiguous'      -- a human confirmed the board (not just one group) has
--                        more than one valid full partition, e.g. after
--                        reviewing a spike in board_reported_ambiguous events
--                        (§5 of the brief: "above ~5% of boards, the
--                        authoring is wrong" is the trigger to look, not an
--                        automated retirement rule -- same human-judgement-
--                        only posture as content_items' 'trivia' reason).
--   'superseded'     -- replaced by a re-authored board.
--   'member-retired' -- one of the board's 4 groups was retired, so the
--                        board can no longer be served intact even though
--                        nothing about this board's own construction was
--                        wrong.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'connection_boards_retired_reason_check'
      and conrelid = 'connection_boards'::regclass
  ) then
    alter table connection_boards
      add constraint connection_boards_retired_reason_check
      check (retired_reason is null or retired_reason in ('ambiguous', 'superseded', 'member-retired'));
  end if;
end $$;

create index if not exists connection_boards_live_idx
  on connection_boards (subject)
  where retired_at is null;

-- ---------------------------------------------------------------------------
-- 4. connection_board_groups -- the 4 groups on one board.
-- ---------------------------------------------------------------------------
create table if not exists connection_board_groups (
  board_id  text not null references connection_boards(id),
  group_id  text not null references connection_groups(id),
  ordinal   int  not null check (ordinal between 0 and 3),

  primary key (board_id, ordinal),
  unique (board_id, group_id)   -- a group cannot appear twice on the same board
);

create index if not exists connection_board_groups_group_idx
  on connection_board_groups (group_id);

-- Cardinality note, same shape as connection_group_members above.
-- "Exactly 4 groups per board" is bounded at MOST 4 by the constraints
-- above, not exactly 4 -- that is an authoring-time invariant, not a DB one.
-- Verification query (empty result = healthy):
--
--   select board_id, count(*) as group_count
--   from connection_board_groups
--   group by board_id
--   having count(*) <> 4;
--
-- Second invariant this table cannot express: "no tile appears in two groups
-- of the same board" -- i.e. across a board's 4 groups, the 16 (group,
-- content_item) pairs must involve 16 distinct content_items. This spans
-- connection_board_groups and connection_group_members together, which is
-- exactly the kind of cross-table invariant Postgres CHECK constraints
-- cannot reach at all (a CHECK sees only its own row). Authoring-time only,
-- enforced by the board-authoring script and its tests. Verification query
-- (empty result = healthy):
--
--   select bg.board_id, gm.content_item_id, count(distinct bg.group_id) as group_count
--   from connection_board_groups bg
--   join connection_group_members gm on gm.group_id = bg.group_id
--   group by bg.board_id, gm.content_item_id
--   having count(distinct bg.group_id) > 1;

-- ---------------------------------------------------------------------------
-- 5. events columns -- additive, all nullable, never backfilled. The events
--    table is the append-only research dataset (CLAUDE.md); a new column
--    here changes nothing about any existing row's meaning.
-- ---------------------------------------------------------------------------
alter table events
  -- Which connections board this event belongs to. Plain text, NOT a foreign
  -- key -- see the FK evaluation below, this was asked for explicitly.
  add column if not exists board_id text,

  -- Shuffle seed used to derive this serve's tile order (lib/games/
  -- connections.ts's shuffleBoardTiles/mulberry32). Written once, on
  -- board_served, and nowhere else -- this column plus mulberry32
  -- reproduces exactly the layout the student saw from the log, without
  -- string-parsing anything out of submitted_text.
  --
  -- TYPE DECISION: bigint, not int. board/route.ts derives the seed as
  -- `createHash('sha256').update(nonce).digest().readUInt32BE(0)` -- a full
  -- UNSIGNED 32-bit value, range 0..4294967295. Postgres `integer` is
  -- SIGNED 32-bit, max 2147483647 -- roughly half of all possible digests
  -- (any whose leading bit is 1) would overflow it, forcing a bit
  -- reinterpretation on write (and again on read, to get back to the
  -- unsigned value mulberry32 expects) just to keep "select shuffle_seed,
  -- feed it to mulberry32" a one-line operation. bigint is signed 64-bit and
  -- holds the full unsigned 32-bit range natively -- no cast, no sign
  -- games -- and every value in that range is comfortably inside
  -- Number.MAX_SAFE_INTEGER, so the JS driver round-trips it exactly.
  add column if not exists shuffle_seed bigint,

  -- sha256 of the four guessed tile ids, sorted ascending, for guess
  -- idempotency (see the partial unique index below). Written only on
  -- guess_submitted rows.
  add column if not exists guess_hash text,

  -- Near-miss flag: true when a guess shares exactly 3 of its 4 tiles with
  -- some group (lib/games/connections.ts's evaluateGuess, `oneAway`).
  -- Written on guess_submitted only -- null on every other event_type, and
  -- never written at all for a malformed guess (those are rejected before
  -- any row is inserted -- see connections.ts's header). This is the
  -- per-guess near-miss behavioural measure §7 of the brief names
  -- explicitly; as a first-class column it supports
  -- `avg(one_away::int) ... group by board_id` directly instead of
  -- requiring a JSON-parsing analysis pass over submitted_text.
  add column if not exists one_away boolean,

  -- Board-grained AGGREGATES, written once on board_complete. §7 of the
  -- brief is explicit that tile taps, deselects, shuffles and timer ticks
  -- are NOT logged as their own event rows -- that would be three orders of
  -- magnitude more volume for the same behavioural signal a handful of
  -- integers already capture. DO NOT "improve" this later into per-tap event
  -- rows without re-reading that tradeoff; the estimated pilot total under
  -- the aggregate design is under 50k rows.
  add column if not exists mistakes_made int,
  add column if not exists groups_solved int,
  add column if not exists deselect_count int,
  add column if not exists shuffle_count int,

  -- True on the group_solved event for the arithmetically-determined fourth
  -- group (once 3 groups are solved the 4th has no remaining decision). It
  -- still pays normally -- see lib/games/registry.ts's PartitionBoardPoints
  -- comment -- this flag exists only so that group can be excluded from
  -- decision-quality analysis (e.g. accuracy-per-guess) without touching the
  -- economics.
  add column if not exists is_forced boolean,

  -- Which of the board's 4 groups (connection_board_groups.ordinal, 0..3)
  -- this group_solved row resolved. Written on group_solved only, null
  -- everywhere else. Group SOLVE ORDER is already recoverable without this
  -- column -- group_solved rows are timestamped and session/round-scoped,
  -- so ordering by created_at within one board serve gives the sequence --
  -- what this column adds is which authored SLOT that was, e.g. whether the
  -- position-0-authored group is reliably solved first or last across
  -- students, which solve order alone cannot say. This is the board-design
  -- feedback signal asked for explicitly.
  add column if not exists group_ordinal int,

  -- Why a board ended. Written on board_complete only.
  add column if not exists terminal_reason text;

-- terminal_reason allowlist -- EXACTLY ('solved','budget','abandoned').
-- 'timeout' IS DELIBERATELY NOT INCLUDED. There is no clock in this build
-- (docs/NEXT_SESSION_BUILD_BRIEF.md §6, confirmed by the user 6 Aug 2026:
-- ship Connections with lever: 'none', no BOARD_TIME_BASE, no UI clock). The
-- user's stated position as of 6 Aug is that a future time/difficulty lever
-- for a partition game may not even be a clock -- tile count, mistake
-- budget, and one-away feedback are all live candidates. Adding 'timeout'
-- now would bake a mechanic-shape assumption into the schema before it has
-- been chosen. Widening this allowlist later is a DROP + re-ADD of this
-- named CHECK, per db/010's pattern -- not a destructive change, no column
-- or row touched.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_terminal_reason_check'
      and conrelid = 'events'::regclass
  ) then
    alter table events
      add constraint events_terminal_reason_check
      check (terminal_reason is null or terminal_reason in ('solved', 'budget', 'abandoned'));
  end if;
end $$;

-- group_ordinal CHECK, same shape as connection_group_members.ordinal and
-- connection_board_groups.ordinal above -- null (every non-group_solved row)
-- or 0..3, never anything else.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_group_ordinal_check'
      and conrelid = 'events'::regclass
  ) then
    alter table events
      add constraint events_group_ordinal_check
      check (group_ordinal is null or group_ordinal between 0 and 3);
  end if;
end $$;

-- Filter/join index: any per-board analysis (all events for one board, or a
-- join from connection_boards back to its events) starts from this column.
-- Partial on non-null since only Connections writes it -- every other game's
-- rows would otherwise carry a wasted NULL entry in a full index.
create index if not exists events_board_id_idx
  on events (board_id)
  where board_id is not null;

-- Guess idempotency + the 12-way-concurrent-salvo defence, in one
-- constraint, same shape as db/007 (board_complete) and db/008
-- (question_answered): the INSERT is the lock, because there is no
-- transaction wrapping a check-then-insert on the Neon HTTP driver. A repeat
-- POST of an already-tried four-tile combination is rejected by this index
-- (returns 409, read back the already-stored result) rather than re-scored --
-- exactly db/008's "resubmitting an already-tried combination is rejected,
-- not re-scored" rule, at guess grain instead of answer grain.
--
-- WHY THE KEY IS (question_id, guess_hash), NOT (session_id, board_id,
-- guess_hash) -- CAUGHT IN REVIEW, this was the first draft's real defect.
--
-- Board selection is least-recently-served, and that is deliberate: it
-- REORDERS boards but never EXCLUDES one from a session's future draws (the
-- fix for A1's 8-board lockout, where whole-history exclusion permanently
-- locked a student out of match after 8 boards). With only a handful of
-- hand-authored Connections boards and the "keep going -> next round"
-- persistence loop, a single session WILL re-encounter the same board_id
-- more than once, and a student replaying it will very plausibly submit the
-- same correct four-tile grouping again. Under (session_id, board_id,
-- guess_hash) that second attempt is a real, distinct decision -- made on a
-- fresh serve of the board -- that the index would silently reject as a
-- duplicate, corrupting exactly the per-guess measure this index exists to
-- protect.
--
-- The fix is not to add `round` or `boards_completed` to the key: both are
-- client-supplied in the request body (see match's submit route), so both
-- are forgeable, and a client that varies either value on repeat submits
-- would defeat the idempotency/salvo defence this index is also providing.
--
-- The correct discriminator is the board token NONCE, minted fresh on every
-- serve by lib/auth/board-token.ts and threaded through the submit path.
-- It is server-authoritative (signed, not client-supplied, so it cannot be
-- varied to double-score) and it is per-serve (so two serves of the same
-- board_id to the same or different sessions carry two different nonces,
-- correctly distinguishing "replay of an old serve" from "same board, new
-- serve"). Connections writes that nonce into `question_id` on
-- guess_submitted rows -- the same column-repurposing match already uses on
-- board_complete. Because the nonce already implies both the session (a
-- token is issued to one student for one serve) and the board (it is minted
-- per board serve), session_id and board_id add nothing to the key and are
-- dropped from it; board_id stays as a plain column, still the right
-- filter/join column for per-board analysis, and events_board_id_idx above
-- is unchanged.
--
-- COLLISION CHECK against db/007's events_board_nonce_uidx: that index is
-- `on events (question_id) where event_type = 'board_complete'`. The index
-- below is partial on `event_type = 'guess_submitted'`. The two partial
-- predicates are mutually exclusive on event_type (a row cannot be both
-- board_complete and guess_submitted), so no row is ever evaluated against
-- both indexes' uniqueness at once -- same reasoning db/008 used to confirm
-- no collision with db/007, restated here for the guess-grain index.
--
-- NULLS NOT DISTINCT is required for the same reason db/008 needed it:
-- there should never be a NULL question_id or guess_hash on a real
-- guess_submitted row, but NULLS NOT DISTINCT costs nothing here and removes
-- the possibility of a malformed row's NULLs silently failing to dedupe.
--
-- CAN THIS INDEX BUILD ON LIVE DATA? Yes, cleanly, unconditionally, under
-- the actual key being shipped here -- (question_id, guess_hash) where
-- event_type = 'guess_submitted'. Preflight above shows
-- `select count(*) from events where event_type = 'guess_submitted'` is 0 --
-- the event_type does not exist in the table yet, so there is nothing for
-- the index to find duplicated regardless of which columns are in the key.
-- No blocker, no dedupe SQL needed, no "NOT YET APPLIED" caveat like db/008
-- originally carried.
--
-- Further replay-style holes checked and ruled out: (1) a guess resubmitted
-- with the SAME nonce but a DIFFERENT tile combination is a different
-- guess_hash, so it is a distinct key and is correctly allowed, not merged
-- into the first guess's row; (2) a guess on a board the student never
-- finished (abandoned mid-round) and later replayed via a fresh serve gets a
-- fresh nonce, so it is correctly treated as a new attempt, not blocked by
-- the earlier abandoned session's rows.
create unique index if not exists events_guess_submitted_uidx
  on events (question_id, guess_hash)
  nulls not distinct
  where event_type = 'guess_submitted';

-- board_complete dedupe needs NO new index. Connections' board_complete will
-- write the board token's nonce into `question_id`, exactly as match does
-- (see db/007's events_board_nonce_uidx, `on events (question_id) where
-- event_type = 'board_complete'`) -- that index is not scoped to game_type
-- and already covers every game whose board_complete row repurposes
-- question_id for a nonce, Connections included. Adding a second,
-- differently-named index over the same (column, partial-predicate) shape
-- would be redundant, not additive.

-- ---------------------------------------------------------------------------
-- FK EVALUATION for events.board_id -- asked for explicitly, decided: NO FK.
-- ---------------------------------------------------------------------------
-- Would a `references connection_boards(id)` on events.board_id be SAFE?
-- Yes, mechanically. Postgres foreign keys never evaluate NULL values (see
-- db/001's identical reasoning for events.student_id), and board_id is a
-- brand-new column that only Connections writes -- every other game's row
-- leaves it NULL, so an FK here could never reject an existing or a future
-- non-Connections row. Nothing about "constrain other games' rows" rules it
-- out on the data.
--
-- Recommendation is NO FK anyway, for consistency with this table's existing
-- convention rather than a data-safety concern: `content_item_id` (db/004)
-- is described in schema.sql as "the forward path to content_items(id)" and
-- has never been given a references clause, across seven migrations since,
-- despite being exactly analogous (a forward-pointing id column on the
-- append-only log). events is a deliberately heterogeneous log where
-- different games' rows can point into different id spaces (the quiz's
-- seed-fallback path writes literal strings
-- like 'seed-fallback' or q1..q20 into `question_id`, which live in neither
-- content_items nor any table at all) -- the standing pattern in this schema
-- is to keep the log decoupled from strict referential integrity on its
-- forward-pointing columns and let retirement (soft-withdraw, never delete)
-- carry the "does this id still resolve" guarantee instead. Matching that
-- precedent means one fewer inconsistency for the next migration to explain,
-- and it costs nothing today since Connections has no seed-fallback path of
-- its own that would need the same escape hatch. If a future reviewer
-- prefers strict FK-everywhere, this is the one line to add
-- (`references connection_boards(id)`) and it is safe to add later, since
-- adding a FK to an already-NULL-only column cannot fail on existing data --
-- same reasoning db/001 used for events.student_id.

-- ---------------------------------------------------------------------------
-- End-to-end verification, read-only, safe to run any time after applying:
-- ---------------------------------------------------------------------------
--   select count(*) from connection_groups;        -- expect 0 until boards are authored
--   select count(*) from connection_group_members;  -- expect 0
--   select count(*) from connection_boards;          -- expect 0
--   select count(*) from connection_board_groups;    -- expect 0
--   select indexname from pg_indexes where tablename like 'connection%';
--   select conname from pg_constraint
--     where conrelid::regclass::text like 'connection%'
--        or conname like 'events_terminal_reason_check'
--        or conname like 'events_group_ordinal_check'
--        or conname like 'events_guess_submitted_uidx';
--   select column_name from information_schema.columns
--     where table_name = 'events'
--       and column_name in ('board_id','guess_hash','mistakes_made',
--         'groups_solved','deselect_count','shuffle_count','is_forced',
--         'terminal_reason','shuffle_seed','one_away','group_ordinal');
--     -- expect all 11
