-- Migration 010: widen content_items_retired_reason_check.
--
-- NOT YET APPLIED. Report this SQL; a human runs it against Neon project
-- ancient-brook-62806105.
--
-- Additive/redefinition only: no column dropped or narrowed, no row
-- touched, no UPDATE in this file. This DROPs and re-ADDs the single named
-- CHECK constraint content_items_retired_reason_check with a longer IN-list
-- -- Postgres has no `alter constraint`, so widening an allowlist is always
-- a drop-and-re-add of the same constraint, not a data-destructive
-- operation. Every currently-stored value ('chart-title-term', on all 7
-- retired rows as of this writing) stays valid under the wider list, so the
-- ADD cannot fail on existing data.
--
-- WHY RETIREMENT EXISTS AT ALL (recap from db/009)
--
-- content_items rows cannot be hard-deleted once bad: 6 of the first 7
-- retired rows already had events.content_item_id pointing at them, and
-- events is the append-only DSR research dataset for the paper -- a DELETE
-- would either be blocked by the FK or, if cascaded, destroy research data.
-- Retirement is the soft-withdraw instead: the row stays, carries WHY
-- (retired_reason) and WHEN (retired_at) it was pulled, and item-selection
-- queries exclude it via content_items_live_idx (db/009). This migration
-- does not change that mechanism -- it only grows the set of reasons a
-- future UPDATE is allowed to use.
--
-- WHY THE ALLOWLIST STAYS AN ALLOWLIST, NOT FREE TEXT
--
-- retired_reason is constrained, not free text, so `group by retired_reason`
-- stays a clean, analyzable count for the paper's methods section (e.g. "43
-- items regenerated as superseded, N under-determined, M trivia") instead of
-- degrading into a diary of one-off notes that has to be re-parsed by hand
-- every time someone asks how many items were pulled and why.
--
-- WHAT'S BEING ADDED, AND WHY EACH ONE
--
-- 'superseded'       -- the row was replaced by a regenerated item for the
--                        same concept. Expected to be the common case once
--                        the rebuilt two-stage generator's cohort lands and
--                        the 43 live term_definition rows are worked through.
--
-- 'under-determined' -- several options answer the clue equally well, so the
--                        item has no single correct answer. Measured
--                        example: "Google's Market Share" with distractors
--                        "Bing's / Yahoo's / Baidu's Market Share" -- the
--                        clue names a quantity every option shares, so all
--                        four options are equally defensible answers. This
--                        is a defect in the item's construction, not in the
--                        underlying concept.
--
-- 'trivia'            -- answerable without the source material. USE
--                        SPARINGLY, AND ONLY ON HUMAN JUDGEMENT, NEVER FROM
--                        AN AUTOMATED THRESHOLD. The ungrounded arm of the
--                        item-gap screen measures how *famous* a concept
--                        is, not whether the item is defective -- "Agile
--                        Manifesto" and "User Story" both score 1.00
--                        ungrounded because a general-purpose model has
--                        read every Agile blog on the internet, and they
--                        are perfectly good items for this course. A high
--                        ungrounded score is a prompt to look at an item by
--                        eye, not a rule to retire it automatically.
--
-- Not added here: anything not named above. The allowlist reflects only
-- what the regenerated-cohort screen is known to need today; the next
-- reason still gets its own db/0NN migration, following this same pattern.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'content_items_retired_reason_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      drop constraint content_items_retired_reason_check;
  end if;

  alter table content_items
    add constraint content_items_retired_reason_check
    check (
      retired_reason is null
      or retired_reason in (
        'chart-title-term',
        'superseded',
        'under-determined',
        'trivia'
      )
    );
end $$;

-- Verify after running (read-only, safe to run anytime):
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'content_items_retired_reason_check';
--     -- expect the four-value IN-list above
--
--   select retired_reason, count(*)
--   from content_items
--   where retired_at is not null
--   group by retired_reason;
--     -- expect unchanged from pre-migration: 7 rows, all 'chart-title-term'
