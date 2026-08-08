-- Migration 013: board/grid persistence schema for package A6, the crossword
-- game (`GAME_REGISTRY`'s sixth tile, `enabled: false` -- lib/games/registry.ts).
--
-- NOT YET APPLIED. Written by db-engineer, additive only, re-runnable. A human
-- must paste this into the Neon web SQL editor. THIS FILE WAS NOT RUN AGAINST
-- NEON -- read-only preflight only, per explicit instruction.
--
-- Number 013, not 012 -- db/012 is reserved (docs/CURRENT_STATE.md) for an
-- unrelated, already-scoped fix (a mistake-budget concurrency race in
-- Connections' submit route) that has not been written yet. Confirmed
-- db/012_*.sql does not exist in the repo before writing this file.
--
-- Preflight run 7 Aug 2026 against Neon project ancient-brook-62806105,
-- server_version 18.4 (be2730e).
--
--   select count(*) from content_items;                          --> 192
--   select subject, count(*) from content_items
--     where kind='term_definition' and retired_at is null
--     group by subject;
--     --> Digital Transformation: 125, International Management: 9
--   select tablename from pg_tables where tablename like 'crossword_%';
--     --> (empty) -- no crossword_% table exists yet
--
-- RE-PREFLIGHT, same day, before amending this file to add crossword_entries.clue
-- (this migration was never applied between the two runs, so re-confirming it is
-- still safe to edit in place rather than needing a new numbered migration):
--   select tablename from pg_tables where tablename like 'crossword_%';
--     --> (empty) -- still no crossword_% table exists; safe to amend in place.
--   select count(*) from events;                                  --> 425
--   select column_name from information_schema.columns
--     where table_name = 'events'
--       and column_name in ('checks_used','entries_correct','entries_wrong',
--         'entries_not_attempted');
--     --> (empty) -- none of db/014's four new events columns exist yet either.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'events_terminal_reason_check';
--     --> CHECK ((terminal_reason IS NULL) OR (terminal_reason = ANY
--         (ARRAY['solved','budget','abandoned']))) -- 'solved' and 'abandoned'
--         (crossword's only two terminal_reason values, see db/014) are already
--         permitted; no widening needed for crossword.
--   select column_name from information_schema.columns
--     where table_name = 'events' and column_name in ('content_item_id','is_correct');
--     --> both present (content_item_id since db/004, is_correct since the
--         original events table) -- db/014 reuses both for check_spent rows,
--         no new columns needed for that event type.
--
-- NULLS NOT DISTINCT (PG 15+) check: not needed by this migration. Unlike
-- db/011's guess-idempotency index, there is no per-serve nonce/idempotency
-- index here -- this migration is board/grid AUTHORING persistence only, no
-- events columns (see below), so nothing in this file needs that feature.
-- Noted explicitly rather than silently omitted, as asked.
--
-- ---------------------------------------------------------------------------
-- SCOPE, asked for explicitly: board/grid persistence ONLY.
-- ---------------------------------------------------------------------------
-- No events columns are added by this migration. Two independent reasons,
-- both from lib/games/registry.ts's GridPoints docstring and the crossword
-- registry entry's comments:
--   (1) scoring economics for crossword are UNDESIGNED -- game4-rfc-
--       prompt.md section 5 asked explicitly whether partial completion,
--       hints, revision and negative-EV guessing should be covered, and the
--       RFC picked Connections before any model answered it for crossword.
--   (2) the lever mechanic is undesigned -- crossword declares `lever:
--       'both'` but deliberately does not consume resolveLever() yet; a
--       crossword-shaped clock/difficulty source is a fully open problem
--       (§5.2/§5.3).
-- Guessing at event column shapes for either would repeat, in a worse form,
-- the exact mistake db/011's header describes catching in review (packing
-- unshaped data into submitted_text instead of real columns) -- worse here
-- because the shape itself is not decided, not just the encoding. Interaction
-- logging for crossword is future work, gated on both design passes landing.
--
-- ---------------------------------------------------------------------------
-- SHAPE, asked for explicitly: flatter than Connections.
-- ---------------------------------------------------------------------------
-- Connections has board -> group -> member (content_item), because a group is
-- a real intermediate unit (4 tiles share one revealed category label,
-- ordinal 0..3 on the board). A crossword grid has no such intermediate --
-- each placed entry maps 1:1 to exactly one content_items row (the term whose
-- fragment was chosen for that entry, game4-rfc-prompt.md §4.2's fragment-
-- entry method). So this migration skips the connection_groups /
-- connection_group_members two-table split entirely: board -> entry
-- (content_item), one table for the placement facts.

-- ---------------------------------------------------------------------------
-- 1. crossword_boards -- a served unit: a fixed grid of placed entries,
--    authored offline by the placement algorithm (scripts/spike-crossword-
--    density.mjs's greedy criss-cross placer, or its eventual authoring
--    successor), analogous to connection_boards being a fixed set of 4
--    groups.
-- ---------------------------------------------------------------------------
create table if not exists crossword_boards (
  id             text primary key,
  subject        text not null,

  -- The deck a board was built from. Same grain content_items.source_id
  -- already uses -- scripts/spike-crossword-density.mjs's live measurement
  -- found source_id, not subject, is the real board unit (9-33 terms per
  -- deck measured against the live bank on 7 Aug 2026), because a board
  -- spanning multiple decks would mix unrelated lecture material into one
  -- grid the same way a Connections board never spans two subjects.
  --
  -- CORRECTED IN REVIEW, before this file was ever applied: the first draft
  -- left this as plain text, reasoning by analogy to events.board_id (no
  -- FK). That analogy doesn't hold -- db/011's no-FK decision is specific to
  -- `events`, a deliberately heterogeneous append-only log where forward-
  -- pointing columns are conventionally unconstrained. crossword_boards is
  -- board-AUTHORING data, homogeneous by construction, exactly the same
  -- table class as connection_group_members.content_item_id (db/011), which
  -- already IS a real FK. content_items.source_id itself is also a real FK
  -- to sources(id) (db/schema.sql) -- the very column this one is meant to
  -- match the grain of. A real FK here is the consistent choice and it
  -- closes off "board authored against a source that doesn't exist" at
  -- write time. Retirement stays soft-delete (no `sources` retirement
  -- convention exists yet to worry about cascading into), so this is a
  -- plain, safe FK exactly like crossword_entries.content_item_id below.
  source_id      text not null references sources(id),

  -- The grid's bounding box. Informs the mobile pan-and-zoom viewport later
  -- (games-and-content-findings.md's "even the smallest measured single-deck
  -- board is ~16px/cell at 390px" finding, 7 Aug 2026) -- a client rendering
  -- a board needs these two numbers before it can compute cell size or the
  -- pan/zoom transform, without re-deriving them from every entry's x/y/
  -- length/direction on every render.
  width          int not null check (width > 0),
  height         int not null check (height > 0),

  created_at     timestamptz default now(),

  -- Retire, never delete -- same reasoning as connection_boards (db/011) and
  -- content_items (db/009): a defect may be found after a board has already
  -- been served and logged against (once crossword event logging exists),
  -- and events is the append-only research dataset. NULL retired_at means
  -- live/servable.
  retired_at     timestamptz,
  retired_reason text
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crossword_boards_retired_consistency_check'
      and conrelid = 'crossword_boards'::regclass
  ) then
    alter table crossword_boards
      add constraint crossword_boards_retired_consistency_check
      check ((retired_at is null) = (retired_reason is null));
  end if;
end $$;

-- Allowlist, not free text -- same reasoning as db/009/db/010/db/011. This is
-- NOT a copy of connection_boards' three reasons: 'ambiguous' does not
-- obviously transfer -- a Connections board is ambiguous when more than one
-- valid 4x4 partition exists, a partition-membership defect. A crossword
-- board has no partition to be ambiguous about; its board-grained failure
-- modes are structurally different. Chosen from what THIS build can actually
-- produce:
--   'fragment-collision'  -- game4-rfc-prompt.md §4.3: a fragment (e.g. CAGE)
--                             is claimed by more than one term, and the board
--                             was authored with the wrong term's clue
--                             attached to the placed entry -- a resolved-
--                             wrong collision, not the mere existence of a
--                             collision (which is expected and routine, per
--                             the RFC's own table).
--   'member-retired'      -- one of the board's placed entries points at a
--                             content_items row that was itself retired
--                             (db/009/db/010), so the board can no longer be
--                             served intact even though nothing about this
--                             board's own placement was wrong. Mirrors
--                             connection_boards' identical reason exactly --
--                             this one DOES transfer, since "an entry's
--                             source term disappeared out from under it" is
--                             board-shape-independent.
--   'superseded'          -- replaced by a re-authored board for the same
--                             source_id, e.g. after the placement algorithm
--                             or the fragment-extraction rules change.
-- 'ambiguous' deliberately excluded -- see above; add it later (a DROP + re-
-- ADD of this named CHECK, not destructive) if a crossword-specific ambiguity
-- failure mode is ever identified.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crossword_boards_retired_reason_check'
      and conrelid = 'crossword_boards'::regclass
  ) then
    alter table crossword_boards
      add constraint crossword_boards_retired_reason_check
      check (retired_reason is null or retired_reason in ('fragment-collision', 'member-retired', 'superseded'));
  end if;
end $$;

-- Live-rows index for board selection, mirrors connection_boards_live_idx
-- (db/011) exactly: least-recently-served selection needs "which boards are
-- live in subject X", partial on the live subset since retired rows are
-- expected to stay a small, mostly static minority.
create index if not exists crossword_boards_live_idx
  on crossword_boards (subject)
  where retired_at is null;

-- ---------------------------------------------------------------------------
-- 2. crossword_entries -- the placed words on one board. Flatter than
--    connection_group_members: no group layer, entry -> content_item is
--    direct (game4-rfc-prompt.md §4.2's fragment-entry method -- one grid
--    entry per chosen term/fragment pair).
-- ---------------------------------------------------------------------------
create table if not exists crossword_entries (
  board_id        text not null references crossword_boards(id),

  -- Forward path to content_items(id) -- how this entry's TERM and
  -- provenance are recovered (NOT its clue -- see `clue` below, which is
  -- this entry's own column, not derived from content_items). Exactly like
  -- connection_group_members.content_item_id. This IS a real FK (unlike
  -- events' forward-pointing columns -- see the FK EVALUATION section on why
  -- events itself stays unconstrained): this table is board-authoring data,
  -- not the heterogeneous append-only log, and connection_group_members
  -- already sets the precedent of a real FK here.
  content_item_id text not null references content_items(id),

  -- AMENDED IN PLACE, same day, before this file was ever applied to Neon
  -- (safe -- re-preflighted above, still unapplied): the first draft of this
  -- table had no clue-text column at all, an oversight found in planning for
  -- package A6's board-authoring/routes/page work. A crossword clue is NOT
  -- the same thing as content_items.clue. content_items.clue (db/003) is a
  -- full definitional sentence for the whole TERM ("~85-180 chars", game4-
  -- rfc-prompt.md §4.1); this column is a fragment-specific contextualizing
  -- device for the one placed ENTRY -- e.g. "the C in CAGE Distance
  -- Framework" for a constituent-expansion entry, or "the first step in Lean
  -- Startup's cycle" for a fragment entry -- per game4-rfc-prompt.md §4.2
  -- ("Consequence: a crossword clue is a *contextualizing device*, not a
  -- standalone definition. It gets two channels an MCQ clue does not --
  -- enumeration (cell count) and framing scaffolds"), which is SETTLED, not
  -- an open question. Minted by the authoring script (scripts/author-
  -- crossword-boards.mjs), one clue per entry, never reused verbatim from
  -- content_items.clue -- a full term-level definitional sentence would
  -- often give away crossing entries or simply not fit the "the C in ..."
  -- framing register the game needs. `not null`: every served entry must
  -- have a clue to render at all -- there is no fallback to content_items.
  -- clue (a different register) and no blank-clue entry is playable.
  clue            text not null,

  -- The actual grid string, e.g. "EMPATHY" -- NOT always equal to
  -- content_items.term (game4-rfc-prompt.md §4.2: a grid entry is any
  -- content word from a term, with the clue carrying the rest, or one part
  -- of a constituent-expanded framework). Stored uppercase by authoring-time
  -- convention (matches the placement algorithm's output in scripts/spike-
  -- crossword-density.mjs) but not enforced by a CHECK here -- case
  -- normalization is a rendering/authoring concern, not a grid-validity one.
  fragment        text not null,

  -- Grid coordinates of the entry's first cell (top-left / start-of-word),
  -- same convention scripts/spike-crossword-density.mjs's placer already
  -- uses (x, y, dir), so an authoring script's output maps onto these
  -- columns without translation.
  x               int not null,
  y               int not null,

  direction       text not null check (direction in ('H', 'V')),

  -- Stable ordering/display -- across/down numbering later. Also doubles as
  -- this table's primary key component, same role connection_group_members'
  -- and connection_board_groups' ordinal columns play (db/011), though
  -- unlike those this ordinal is NOT bounded to 0..3 -- a board can have as
  -- many entries as the placer fits (live spikes measured up to ~30 placed
  -- entries on a single-deck board), so no fixed-range CHECK is applied.
  ordinal         int not null,

  primary key (board_id, ordinal),
  unique (board_id, content_item_id)   -- a term cannot supply two entries on the same board
);

-- Reverse lookup: "which board(s) is this content_item placed on" -- needed
-- to cascade a content_items retirement (db/009/db/010) into the
-- 'member-retired' crossword_boards reason above, mirrors
-- connection_group_members_item_idx (db/011) exactly.
create index if not exists crossword_entries_item_idx
  on crossword_entries (content_item_id);

-- ---------------------------------------------------------------------------
-- Authoring-time-only invariants -- READ BEFORE TRUSTING THIS TABLE'S SHAPE.
-- Same posture as db/011's cardinality notes: these are properties the
-- placement algorithm and its tests must guarantee at authoring time, not
-- properties this schema can declaratively enforce, because Postgres CHECK
-- constraints see only their own row and this project does not use triggers.
-- ---------------------------------------------------------------------------
--
-- (1) NO TWO ENTRIES ON THE SAME BOARD MAY OCCUPY THE SAME (x,y) WITH
--     CONFLICTING LETTERS. This is the actual crossing-validity rule a
--     criss-cross placer exists to satisfy -- two entries are allowed to
--     share a cell only if they agree on the letter there (that agreement
--     IS the crossing). It is somewhat checkable in SQL in principle, but
--     doing so declaratively needs a stored/generated per-cell expansion
--     (one row per (board_id, x, y, letter) derived from each entry's
--     fragment/x/y/direction) that this schema deliberately does not carry
--     -- crossword_entries stores the entry's start coordinate and length-
--     implying fragment, not an expanded cell table, so there is no column
--     set a CHECK could reach across two entries' rows even at expansion
--     time (CHECK still cannot see a second row). Enforced instead by the
--     placement algorithm itself (canPlace() in scripts/spike-crossword-
--     density.mjs already rejects a conflicting letter at a shared cell
--     before placement) and that algorithm's tests. Read-only verification
--     query a human can run after authoring a board (empty result =
--     healthy; expands both directions in SQL since there is no stored cell
--     table):
--
--   -- CORRECTED after the first real run against live Neon (scripts/author-crossword-
--   -- boards.mjs's first --commit, 8 Aug 2026): the original version of this query
--   -- never selected x/y/direction into "cells" at all, so the self-join against a
--   -- second copy of crossword_entries existed only to source them -- and once
--   -- sourced that way, the unqualified board_id/ordinal/content_item_id in the
--   -- SELECT list became ambiguous between the two aliases. Fixed by selecting
--   -- x/y/direction into "cells" directly, which removes the need for the join
--   -- entirely -- simpler than the original design, not just corrected.
--   with cells as (
--     select
--       board_id, ordinal, content_item_id, x, y, direction,
--       generate_series(0, length(fragment) - 1) as i,
--       fragment
--     from crossword_entries
--   ), expanded as (
--     select
--       board_id, ordinal, content_item_id,
--       case when direction = 'H' then x + i else x end as cx,
--       case when direction = 'H' then y else y + i end as cy,
--       substr(fragment, i + 1, 1) as letter
--     from cells
--   )
--   select board_id, cx, cy, count(distinct letter) as conflicting_letters
--   from expanded
--   group by board_id, cx, cy
--   having count(distinct letter) > 1;
--
-- (2) EVERY ENTRY'S FRAGMENT MUST ACTUALLY BE EXTRACTABLE FROM ITS LINKED
--     content_items.term -- i.e. fragment's letters must be a content word
--     (or constituent-expansion part) of the term this entry claims
--     provenance from, per game4-rfc-prompt.md §4.2's fragment-entry method.
--     Also authoring-time only, not a DB constraint -- validating "is this
--     substring/word-set actually derived from that term" is a string-
--     extraction rule (the same fragmentsOf() logic in scripts/spike-
--     crossword-density.mjs), not something a CHECK can express relative to
--     another column's free text in a general way (constituent expansion in
--     particular introduces words -- e.g. "EMPATHISE" for a Design Thinking
--     stage -- that are not literal substrings of the parent term at all).
--     Read-only verification query a human can run (returns candidate rows
--     to manually eyeball -- a fragment that is NOT a case-insensitive
--     substring of its term is suspicious but constituent-expansion entries
--     are expected false positives here, so this is a review aid, not a
--     pass/fail gate):
--
--   select ce.board_id, ce.ordinal, ce.fragment, ci.term
--   from crossword_entries ce
--   join content_items ci on ci.id = ce.content_item_id
--   where position(upper(ce.fragment) in upper(ci.term)) = 0;

-- ---------------------------------------------------------------------------
-- FK EVALUATION for crossword_entries.content_item_id -- matching db/011's
-- format, decided: YES, real FK (this is the opposite conclusion from
-- events.board_id, deliberately, for a stated reason).
-- ---------------------------------------------------------------------------
-- db/011 decided NO FK on events.board_id because events is a deliberately
-- heterogeneous append-only log where forward-pointing columns (content_
-- item_id since db/004, board_id since db/011) are left unconstrained by
-- convention, and different games' rows point into different or no id
-- spaces at all (the quiz's seed-fallback literal strings). None of that
-- applies here: crossword_entries is board-AUTHORING data, homogeneous by
-- construction (every row is a crossword entry, full stop), analogous to
-- connection_group_members.content_item_id, which already IS a real FK
-- (db/011). Matching that precedent is the consistent choice, and a real FK
-- additionally buys a guarantee this table wants: an entry can never
-- reference a content_items row that does not exist, closing off one class
-- of authoring bug at write time instead of needing a verification query for
-- it. (Retirement is still soft-delete -- db/009/db/010 -- so a RETIRED but
-- not deleted content_items row keeps satisfying this FK; that is exactly
-- why 'member-retired' is a crossword_boards retirement reason rather than a
-- constraint violation.)

-- ---------------------------------------------------------------------------
-- End-to-end verification, read-only, safe to run any time after applying:
-- ---------------------------------------------------------------------------
--   select count(*) from crossword_boards;   -- expect 0 until boards are authored
--   select count(*) from crossword_entries;  -- expect 0
--   select indexname from pg_indexes where tablename like 'crossword%';
--   select conname from pg_constraint where conrelid::regclass::text like 'crossword%';
--   select column_name from information_schema.columns
--     where table_name = 'events'
--       and column_name like '%crossword%';
--     -- expect ZERO rows -- this migration adds no events columns
