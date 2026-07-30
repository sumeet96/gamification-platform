-- Migration 004: add per-question research columns to `events`.
--
-- Package K-3 (docs/PROJECT_MAP.md §3, §1.7). Additive columns only, all
-- nullable -- no existing row's meaning changes and no column is dropped,
-- renamed, or narrowed. `question_id` is left exactly as-is; `content_item_id`
-- coexists alongside it as the forward path to the new content_items layer
-- (db/003_add_content_items.sql).
--
-- Apply by pasting this file into the Neon web SQL editor.
-- (psql is not installed on the dev machine -- see docs/CURRENT_STATE.md.)

alter table events
  -- Which option the student actually picked, not just whether it was right.
  -- Currently discarded on every answer (PROJECT_MAP §1.7, §2.8). Unlocks
  -- misconception analysis: if 70% of a cohort picks distractor C, that is a
  -- specific, nameable wrong belief the professor can teach against.
  add column if not exists selected_option int,

  -- Forward path to the normalized content_items layer (db/003), so future
  -- events can be joined to recipe/cognitive_level/empirical_p without a
  -- lookup through `questions`. Does not replace question_id.
  add column if not exists content_item_id text,

  -- Whether the lever fired at item grain or board grain for this event
  -- (PROJECT_MAP §1: some games' lever can only move between whole boards,
  -- e.g. match-the-following; others move between items, e.g. quiz).
  add column if not exists adapt_granularity text,

  -- Boards completed so far this round/session. Lets analysis distinguish
  -- "the lever never fired" (granularity=board, boards_completed static) from
  -- "the lever fired and did nothing" (boards_completed advancing, no change
  -- in difficulty/time_limit) -- PROJECT_MAP §3 K-3.
  add column if not exists boards_completed int,

  -- Denormalized cognitive_level (recall|apply|discriminate|deduce|transfer)
  -- from the content_items row this event answers, so accuracy can be broken
  -- down by cognitive level without a join (PROJECT_MAP §1.7).
  add column if not exists cognitive_level text;

-- Postgres has no `add constraint if not exists`, so guard it explicitly and
-- keep this file re-runnable, matching db/001 and db/002.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_adapt_granularity_check'
      and conrelid = 'events'::regclass
  ) then
    alter table events
      add constraint events_adapt_granularity_check
      check (adapt_granularity is null or adapt_granularity in ('item', 'board'));
  end if;
end $$;
