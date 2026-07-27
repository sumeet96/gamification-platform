-- Schema for the adaptive learning game (Neon Postgres).
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql   (or paste into the Neon SQL editor)

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

-- Per-interaction event log — the research dataset (per-question grain + round/session markers).
create table if not exists events (
  id                bigserial primary key,
  session_id        text not null,
  student_id        text,                             -- future: from auth (login/signup)
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

create index if not exists events_session_idx on events (session_id);
create index if not exists events_type_idx    on events (event_type);
