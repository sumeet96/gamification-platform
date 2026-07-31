-- Migration 005: add simulated difficulty and source provenance to `content_items`.
--
-- Package K/R1 follow-on (docs/PROJECT_MAP.md §1.6). Additive columns only, all
-- nullable -- no existing row's meaning changes and no column is dropped,
-- renamed, or narrowed.
--
-- Apply by pasting this file into the Neon web SQL editor.
-- (psql is not installed on the dev machine -- see docs/CURRENT_STATE.md.)
--
-- WHY THESE COLUMNS EXIST
--
-- There is no student cohort to pre-test against, so item difficulty is seeded
-- by LLM student simulation: models attempt the item at stated ability levels
-- and the failure rate is the estimate. Method and evidence:
--   docs/literature/item-difficulty-without-students.md
--   docs/experiments/2026-07-31_grounded-difficulty-simulation.md
--
-- Two findings from 31 Jul 2026 shape this schema:
--
--  1. A simulated student must be given the source text the item came from,
--     with the ability tier controlling how much of it they see. Ungrounded,
--     the measurement is "how much does this question depend on the deck",
--     not "how hard is it". Hence `source_excerpt` -- the generator must store
--     the text it actually used, not a page pointer.
--
--  2. The VALUES ARE SIMULATOR-SPECIFIC. Correlation with the old asserted 1-5
--     labels was -0.63 under llama3.2 and -0.09 under gpt-3.5-turbo-0125 on the
--     same 15 items, and the two simulators agreed with each other only at
--     rho = 0.23. A bare number is therefore meaningless. `simulator_model` and
--     `simulator_method` are NOT metadata -- without them `simulated_p` cannot
--     be interpreted or reproduced, and re-seeding the bank with a different
--     model would silently mix two incompatible scales.

alter table content_items
  -- Simulated facility: fraction of simulated students who answered correctly.
  -- 0 = every simulated student failed, 1 = all succeeded.
  --
  -- MUST NEVER be written to `empirical_p`. `empirical_p` is reserved for
  -- OBSERVED human facility. Simulated must not masquerade as observed, the
  -- same way `cognitive_level` must not masquerade as difficulty (see the
  -- note in db/003_add_content_items.sql). Validating one against the other
  -- once real responses arrive is a stated research contribution; merging the
  -- columns destroys the ability to do it.
  add column if not exists simulated_p real,

  -- How many simulated students `simulated_p` rests on. At n=4 the estimate
  -- over-flagged unanswerable-without-source items by 4x; n>=30 is the working
  -- minimum. Mirrors `p_responses` for the observed side.
  add column if not exists simulated_n int,

  -- Which model produced `simulated_p`, e.g. 'llama3.2'. Pin the exact snapshot
  -- for hosted models ('gpt-3.5-turbo-0125', never the floating alias) -- a
  -- simulator that changes underneath the bank shifts calibration silently.
  add column if not exists simulator_model text,

  -- How the simulation was run. Changes the value materially on identical
  -- items and models: on the validation set, mean facility ran 0.45 ungrounded,
  -- 0.85 grounded-full and 0.71 grounded-retention, and only grounded-retention
  -- produced an ability gradient at all. 'grounded-retention' is the method;
  -- the others are recorded so failed or exploratory runs stay distinguishable
  -- rather than being silently comparable.
  add column if not exists simulator_method text,

  -- The source text actually used to write this item, and the same text handed
  -- to the simulated student. Serves two independent needs: difficulty
  -- simulation cannot run without it, and it is the evidence span for checking
  -- that an answer is genuinely supported by the material rather than that a
  -- page happened to be in the prompt window.
  --
  -- KNOWN LIMIT: plain text loses POSITION. Every label on a 2x2 matrix slide
  -- is recovered but not where anything sits on it, and the one matrix item in
  -- the validation set scored 33/30/33 across all three grounding conditions --
  -- grounding could not help it. Items generated from charts, matrices and
  -- diagrams cannot be difficulty-calibrated by text simulation.
  add column if not exists source_excerpt text;

-- Postgres has no `add constraint if not exists`, so guard explicitly and keep
-- this file re-runnable, matching db/001, db/002 and db/004.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_simulated_p_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_simulated_p_check
      check (simulated_p is null or (simulated_p >= 0 and simulated_p <= 1));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_simulator_method_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_simulator_method_check
      check (simulator_method is null or simulator_method in ('ungrounded', 'grounded-full', 'grounded-retention'));
  end if;
end $$;

-- A simulated value without its provenance cannot be interpreted or reproduced,
-- so require all three together. Enforced at the table rather than in the
-- writer: the seeding job is a script, and a partial write here would poison the
-- item bank in a way no later query could detect.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_simulated_provenance_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_simulated_provenance_check
      check (
        simulated_p is null
        or (simulated_n is not null and simulator_model is not null and simulator_method is not null)
      );
  end if;
end $$;

-- Finding candidates to seed: rows that have source text but no estimate yet.
create index if not exists content_items_unsimulated_idx
  on content_items (subject)
  where simulated_p is null and source_excerpt is not null;
