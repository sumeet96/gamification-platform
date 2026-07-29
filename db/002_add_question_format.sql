-- Migration 002: add `format` column to `questions`.
--
-- Rationale (see CLAUDE.md / task brief): the quiz renderer will switch on
-- this column. Every existing row is plain text and no alternate renderer
-- ships yet, but adding the column now is ~10 lines vs. a migration plus a
-- render-path rewrite later. Mathematics support is otherwise deferred.
--
-- Apply by pasting this file into the Neon web SQL editor.
-- (psql is not installed on the dev machine -- see docs/CURRENT_STATE.md.)
--
-- Additive only: adds a column with a default (backfills existing rows to
-- 'plain', a no-op semantically since that's what they already are) and adds
-- a CHECK constraint. No column is dropped, renamed, or narrowed, and no
-- existing row's meaning changes. A CHECK constraint is used instead of a
-- Postgres ENUM type per the task brief, since 'markdown'/'latex' may not be
-- the final list and enums are painful to extend later.

alter table questions
  add column if not exists format text not null default 'plain';

-- Postgres has no `add constraint if not exists`, so guard it explicitly and
-- keep this file re-runnable like db/001_add_students.sql does for its FK.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'questions_format_check'
      and conrelid = 'questions'::regclass
  ) then
    alter table questions
      add constraint questions_format_check
      check (format in ('plain', 'latex', 'markdown'));
  end if;
end $$;
