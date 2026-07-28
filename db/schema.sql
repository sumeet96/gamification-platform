-- Schema for the adaptive learning game (Neon Postgres).
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql   (or paste into the Neon SQL editor)
--
-- This file is the canonical "current shape" snapshot. Changes ship as numbered
-- migrations under db/ (see db/001_add_students.sql for the first one) and are
-- folded into this file so it stays true without needing to replay history.

-- Questions generated from source material (a book PDF). Falls back to the seed
-- bank in lib/game/questions.ts when this table is empty.
create table if not exists questions (
  id          text primary key,
  source      text,                                   -- e.g. the PDF / book name
  topic       text,
  difficulty  int  not null check (difficulty between 1 and 5),
  prompt      text not null,
  options     jsonb not null,                         -- string[]
  answer      int  not null,                          -- index into options
  created_at  timestamptz default now()
);

-- Authenticated students (added in db/001_add_students.sql). Opaque `id` keeps
-- email out of the event log entirely, so the research dataset carries no
-- direct identifier.
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

-- Case-insensitive uniqueness backstop — see db/001_add_students.sql for why
-- this is an expression index rather than a plain `unique` on the column.
create unique index if not exists students_email_lower_idx on students (lower(email));

-- Per-interaction event log — the research dataset (per-question grain + round/session markers).
create table if not exists events (
  id                bigserial primary key,
  session_id        text not null,
  student_id        text references students(id),     -- from auth (login/signup); nullable, still populated per-request
  event_type        text not null,                    -- session_start | round_start | question_answered | round_continue | round_stop
  game_type         text,                             -- 'quiz' (future: crossword, word-search, ...)
  mode              text,                             -- rapid | normal
  lever             text,                             -- adaptive | time
  round             int,
  question_id       text,
  difficulty_level  int,
  time_limit        int,                              -- seconds allowed (time mode)
  time_taken_ms     int,
  is_correct        boolean,
  points_delta      int,                              -- net delta for this answer (+20 / -10)
  negative_applied  boolean,
  net_after         int,
  created_at        timestamptz default now()
);

create index if not exists events_session_idx        on events (session_id);
create index if not exists events_type_idx            on events (event_type);
create index if not exists events_student_idx         on events (student_id);
create index if not exists events_session_round_idx   on events (session_id, round);
