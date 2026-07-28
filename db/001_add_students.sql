-- Migration 001: add `students` table and link `events.student_id` to it.
--
-- Convention established here (db/ previously held only schema.sql): numbered
-- migration files, zero-padded to 3 digits, `NNN_short_name.sql`. Each migration
-- must be additive (see CLAUDE.md rule 1) and its net effect must also be
-- reflected in db/schema.sql so that file stays the single source of truth for
-- "what does the schema look like now".
--
-- Apply with:  psql "$DATABASE_URL" -f db/001_add_students.sql
-- (or paste into the Neon SQL editor)
--
-- Safety check performed before writing this migration: db/schema.sql defines
-- `events.student_id` as nullable with no rows populating it yet (confirmed
-- against docs/architecture/data-layer.md, which states student_id is "Currently
-- always null" because login/signup are still front-end mockups with no API
-- call). Postgres foreign keys do not evaluate NULL values against the
-- referenced table, so adding `references students(id)` to an all-NULL column
-- is a no-op constraint-check-wise: it can only ever reject a NEW non-null
-- student_id that doesn't match a students.id, never fail on existing data.
-- This migration is therefore safe to apply against the live table as-is.

create table if not exists students (
  id             text primary key,          -- opaque identifier, e.g. 's_' || encoded random. NOT the email.
  email          text not null,             -- app normalizes (lowercases) before insert; see unique index below
  password_hash  text not null,             -- scrypt output, format "salt:hash" as hex
  name           text,
  phone          text,
  dob            date,                      -- age covariate for the research
  gender         text,
  education      text,
  learning_goals text,
  consented_at   timestamptz,               -- null means consent not given; never defaulted
  created_at     timestamptz default now()
);

-- Case-insensitive uniqueness enforced at the DB layer via an expression index
-- on lower(email), rather than a plain `unique` constraint on the raw column.
-- The contract for this migration specifies `email text not null unique` and
-- states the app lowercases before insert; that invariant should hold in
-- practice. This index is a belt-and-braces backstop: if an application bug
-- ever writes an unlowercased value, the DB still refuses two accounts that
-- differ only by case, rather than silently admitting a duplicate that would
-- corrupt per-student joins in the research dataset. This is additive/stricter
-- than a plain unique constraint would be, not a weaker substitute for it — a
-- plain `unique` on `email` would NOT catch 'A@x.com' vs 'a@x.com' colliding,
-- this does.
create unique index if not exists students_email_lower_idx on students (lower(email));

-- Link the event log to students. events.student_id was already nullable and
-- unpopulated (see safety note above), so this add-constraint is additive and
-- non-destructive: no existing row can violate it.
-- Postgres has no `add constraint if not exists`, so guard it explicitly and
-- keep this file re-runnable like every other statement here. Without this,
-- applying the migration twice fails partway with "constraint already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_student_id_fkey'
  ) then
    alter table events
      add constraint events_student_id_fkey
      foreign key (student_id) references students(id);
  end if;
end $$;

create index if not exists events_student_idx on events (student_id);

-- Gap #5 from docs/architecture/data-layer.md: round-scoped aggregation
-- queries (per-session, per-round analysis) currently have no supporting
-- index. Added here since this migration already touches `events`.
create index if not exists events_session_round_idx on events (session_id, round);
