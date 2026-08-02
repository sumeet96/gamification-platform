-- Migration 009: item retirement for `content_items`.
--
-- APPLIED to Neon project ancient-brook-62806105 on 3 Aug 2026, DDL and the
-- retirement UPDATE together. Verified after: 67 content_items (unchanged),
-- 7 retired all with reason 'chart-title-term', 43 live term_definition rows,
-- 162 events (unchanged -- an UPDATE on content_items writes no events row),
-- and simulated_p/difficulty/empirical_p still null on every term row, since
-- the calibration write is deliberately still pending.
--
-- Additive only: two new nullable columns, two CHECK constraints, one partial
-- index. No column is dropped, renamed, or narrowed; no row is deleted.
--
-- WHY THIS EXISTS
--
-- Six of the pilot's 67 content_items rows are chart captions lifted off
-- slides ("Netflix Subscribers Statistics 2025", "Mattel Japan Market
-- Share", ...) rather than learnable concepts -- a term/definition pair with
-- no real definition behind it. A hard DELETE is not an option: the events
-- table (the DSR research dataset, append-only) already references six of
-- the seven via content_item_id, and a delete would either be blocked by the
-- FK or, if cascaded, destroy research data. Retirement is a soft-withdraw:
-- the row stays, carries WHY and WHEN it was pulled, and item-selection
-- queries exclude it from what a student can be served next.
--
-- `retired_at` / `retired_reason` are a matched pair by design -- a reason
-- with no timestamp, or a timestamp with no reason, is nonsense state and is
-- rejected by content_items_retired_consistency_check below.
--
-- `retired_reason` is a small allowlist, not free text: this keeps the
-- column analyzable in SQL (`group by retired_reason`) for the paper's
-- methods section, rather than becoming a diary of one-off free-text notes.
-- Only 'chart-title-term' is added now, for exactly the 7 rows this
-- migration retires. The quality screen currently being built will likely
-- need 'trivia' and 'under-determined' -- those are NOT added here so this
-- migration reflects only what is retired today. Postgres has no
-- `alter constraint`, so widening the allowlist later means DROP + re-ADD
-- the same named CHECK constraint with the longer IN-list -- that is a
-- constraint redefinition, not a data-destructive operation (no column,
-- row, or existing value is touched), and should ship as
-- db/010_widen_retirement_reasons.sql (or similar) when that screen lands.

alter table content_items
  -- When this item was withdrawn from play. NULL means live/servable.
  add column if not exists retired_at timestamptz,

  -- Why it was withdrawn. NULL exactly when retired_at is NULL -- see the
  -- consistency check below. Constrained to a small, growable allowlist,
  -- never free text (see rationale above).
  add column if not exists retired_reason text;

-- Postgres has no `add constraint if not exists`, so guard explicitly and
-- keep this file re-runnable, matching db/001, db/002, db/004, db/005, db/006.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_retired_consistency_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_retired_consistency_check
      check ((retired_at is null) = (retired_reason is null));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_retired_reason_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_retired_reason_check
      check (retired_reason is null or retired_reason in ('chart-title-term'));
  end if;
end $$;

-- "Live items only" is about to be on every item-selection query (the quiz's
-- content_items fetch in app/api/questions/route.ts, choose-the-right-word's
-- in app/api/word/question/route.ts, match's in app/api/match/board/route.ts)
-- -- exactly the read pattern db/006's content_items_playable_difficulty_idx
-- comment anticipated for `difficulty`. A partial index on the live subset is
-- the right shape for the same reason db/005's content_items_unsimulated_idx
-- and db/006's playable index are partial: retired rows are a small, mostly
-- static minority (7 of 67 today), so a partial index stays small and every
-- selection query's `where ... and retired_at is null` is answered by an
-- index whose every row already qualifies, rather than one that has to carry
-- and then filter out the retired rows on every lookup. `kind` leads because
-- every selection query filters on kind ('mcq' or 'term_definition') before
-- anything else; `subject` follows because the quiz and match both filter on
-- it too (choose-the-right-word does not, but a (kind, subject) index still
-- serves a kind-only lookup via the leading-column prefix, so one index
-- covers all three routes instead of needing a second kind-only index).
create index if not exists content_items_live_idx
  on content_items (kind, subject)
  where retired_at is null;

-- ---------------------------------------------------------------------------
-- RETIREMENT. Exactly 7 ids, explicit IN-list -- never a broader predicate
-- like "topic like '%Market Share%'", which risks pulling in a row that only
-- superficially resembles the other six. Re-runnable: re-applying it would
-- refresh retired_at on rows already retired and match nothing new.
-- ---------------------------------------------------------------------------

update content_items
set retired_at = now(), retired_reason = 'chart-title-term'
where id in (
  '05c87da145b351b7f994c4552bf990bb', -- Netflix Subscribers Statistics 2025
  '5b4b5a3d9b573b57d7298a24d695e14d', -- Mattel Japan Market Share
  '76b17e84f79f64e797122f5e6257258f', -- Leading Toy Brands Japan
  '8c6e4690e047d5469d2154804520e806', -- Leading Toy Brands China
  'a989c7235258f2d4306239118ed14dfd', -- Leading Toy Markets 2024
  'c412ec9bf0ae5fd5905116b8562a3007', -- Leading Toy Brands USA
  'f8d017280a2e3be95052137bba502a56'  -- Google's Market Share
);

-- Verify after running the UPDATE (read-only, safe to run anytime):
--   select count(*) from content_items;                          -- expect 67 (unchanged)
--   select count(*) from content_items where retired_at is not null; -- expect 7
--   select count(*) from events;                                 -- expect unchanged from
--                                                                  -- its pre-migration value
--                                                                  -- (162 at the time this
--                                                                  -- file was authored) --
--                                                                  -- an UPDATE on
--                                                                  -- content_items writes no
--                                                                  -- events row.
