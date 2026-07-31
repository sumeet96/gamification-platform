-- Migration 006: add a 1-5 `difficulty` column to `content_items`, so the
-- adaptive-difficulty lever has something to select on once the quiz reads
-- from content_items instead of `questions` (package Q1).
--
-- Apply by pasting this file into the Neon web SQL editor (psql is not
-- installed on the dev machine -- see docs/CURRENT_STATE.md).
--
-- WHY THIS COLUMN EXISTS, AND WHAT IT IS NOT
--
-- `questions.difficulty` is an asserted 1-5 int that `pickQuestion`
-- (lib/game/questions.ts) selects on. `content_items` has no equivalent --
-- `cognitive_level` is a generation control, not a hardness ordering, and
-- `empirical_p` / `simulated_p` are continuous facility scores (0..1), not a
-- rank the existing lever plumbing understands. This column bridges the two
-- without touching pickQuestion, the lever constants, or the badge UI.
--
-- `difficulty` here is a DERIVED, BINNED value -- never an asserted one:
--   - It MUST be computed from `simulated_p` (and later `empirical_p` once
--     real response data exists), never written from a generator's own
--     opinion of how hard an item is. `scripts/generate-questions.mjs`
--     already asks the generator to self-report a difficulty and already
--     discards it -- this column does not resurrect that number.
--   - It is NULL until a simulation (or later, empirical) pass runs and bins
--     the result. NULL means "not yet calibrated": the adaptive lever cannot
--     rank that item and it must not be treated as difficulty 0 or as a
--     default middle value.
--   - Binning is by QUINTILE over the observed `simulated_p` distribution of
--     one simulation run, not fixed thresholds (docs/experiments/
--     2026-07-31_grounded-difficulty-simulation.md). Fixed thresholds
--     collapse into one or two bands whenever the simulator turns out
--     uniformly strong or weak on the material -- quintiles always spread
--     the run's own items across all five bins.
--   - Difficulty values are SIMULATOR-SPECIFIC: two simulators agreed with
--     each other only at rho = 0.23 on identical items (db/005, same
--     experiment note). Re-binning from a different simulator changes what
--     every existing value in this column means, so the whole column must be
--     recomputed together in one pass keyed to one `simulator_model` /
--     `simulator_method` pair -- never patched row by row from mixed
--     simulator runs. A future writer must overwrite the full column in a
--     single statement, not merge in a subset.

alter table content_items
  add column if not exists difficulty int;

-- Postgres has no `add constraint if not exists`, so guard explicitly and
-- keep this file re-runnable, matching db/001, db/002, db/004 and db/005.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_difficulty_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_difficulty_check
      check (difficulty is null or difficulty between 1 and 5);
  end if;
end $$;

-- Supports the quiz's selection path. `pickQuestion` (lib/game/questions.ts)
-- does NOT push the difficulty search into SQL: it takes an already-fetched
-- pool array and, in JS, filters to the exact target difficulty first, then
-- widens outward by radius 1..4 among still-unused items, falling back to
-- any unused item if nothing matches. So the query behind that pool is a
-- single fetch of "everything playable for this subject", not a per-radius
-- SQL lookup -- the index needs to make that one fetch cheap and pre-sorted,
-- not encode the radius logic itself.
--
-- The pool that fetch must return is: kind = 'mcq', scoped by subject,
-- restricted to items the lever can actually rank. A NULL difficulty is
-- exactly the "not yet calibrated" case called out above, so it is excluded
-- from this index the same way db/005's content_items_unsimulated_idx keeps
-- the "not yet simulated" set separate -- an uncalibrated item has no
-- difficulty for pickQuestion's radius search to widen towards, and should
-- be surfaced through the simulation-queue path instead, not the play path.
create index if not exists content_items_playable_difficulty_idx
  on content_items (subject, kind, difficulty)
  where difficulty is not null;
