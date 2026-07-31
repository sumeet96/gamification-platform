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
  format      text not null default 'plain'
                check (format in ('plain', 'latex', 'markdown')),
                                                        -- added in db/002_add_question_format.sql;
                                                        -- the renderer switches on this
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

-- The following events columns were added in db/004_add_event_metrics.sql, all
-- nullable and additive. question_id (above) is unchanged; content_item_id
-- coexists as the forward path to content_items.
--   selected_option    int   -- which option the student picked (misconception analysis)
--   content_item_id    text  -- forward path to content_items(id)
--   adapt_granularity  text  -- item | board -- whether the lever could fire at this grain
--   boards_completed   int   -- the 1-indexed ordinal of the board being completed by THIS
--                                event (1, 2, 3, ...), written by app/games/match/page.tsx and
--                                app/api/match/submit/route.ts. db/004's original comment
--                                ("boards completed so far", i.e. a count-before) is WRONG and
--                                superseded by this line and by db/007_add_board_dedupe.sql --
--                                an analyst using the old prose would be off by one in exactly
--                                the lever-fired-vs-never-fired analysis this column exists for.
--   cognitive_level    text  -- denormalized from content_items, for accuracy-by-level without a join
alter table events
  add column if not exists selected_option int,
  add column if not exists content_item_id text,
  add column if not exists adapt_granularity text,
  add column if not exists boards_completed int,
  add column if not exists cognitive_level text;

-- db/007_add_board_dedupe.sql: free-text answer, for games whose response is
-- not an MCQ option index. Holds the free-text answer a student actually gave
-- when `selected_option` (an int) cannot represent it -- match-the-following
-- placements today; fill-in-the-blanks and choose-the-right-word later.
-- Nullable, additive, never written by the MCQ quiz path.
alter table events add column if not exists submitted_text text;

-- db/007_add_board_dedupe.sql: makes match-the-following board-submit dedupe
-- atomic. The board_complete row's `question_id` column is repurposed to hold
-- the board token's nonce (see app/api/match/submit/route.ts); this unique
-- partial index makes the INSERT itself the concurrency lock, closing a race
-- where N parallel POSTs carrying the same valid token could all pass a
-- check-then-insert dedupe on the Neon HTTP driver (no transaction) and all
-- score. The `where` clause is mandatory: `question_id` also holds the
-- literal string 'seed-fallback' on many question_answered rows
-- (app/api/answer/route.ts) and ordinary repeated question ids across
-- sessions, so a non-partial unique index on this column would fail to build
-- and would break the quiz's seed-fallback path.
create unique index if not exists events_board_nonce_uidx
  on events (question_id)
  where event_type = 'board_complete';

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

-- Documents uploaded for content generation (db/003_add_content_items.sql).
-- Multi-tenant/subject-scoped from day one (PROJECT_MAP §1.5), even though the
-- upload UI itself is deferred past the pilot.
create table if not exists sources (
  id           text primary key,
  subject      text not null,
  title        text not null,
  filename     text,
  checksum     text,
  page_count   int,
  uploaded_by  text,
  status       text not null default 'pending',   -- pending | processing | ready | failed
  created_at   timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sources_status_check'
      and conrelid = 'sources'::regclass
  ) then
    alter table sources
      add constraint sources_status_check
      check (status in ('pending', 'processing', 'ready', 'failed'));
  end if;
end $$;

-- The normalized content-primitive layer every game reads and every generator
-- writes (db/003_add_content_items.sql, PROJECT_MAP §3 K-1). Two kinds for the
-- pilot roster: mcq (quiz) and term_definition (match, fill, choose, Wordle).
--
-- `empirical_p` and `cognitive_level` are deliberately separate columns.
-- `cognitive_level` is a generation control (what kind of thinking the item
-- demands), not a difficulty ordering. `empirical_p` (observed facility,
-- backed by `p_responses`) is the ONLY difficulty that exists in this system.
-- Collapsing the two is the mistake that produced the non-discriminating
-- difficulty scale on `questions` -- do not merge them later.
create table if not exists content_items (
  id               text primary key,
  source_id        text not null references sources(id),
  subject          text not null,
  topic            text,
  page             int,
  kind             text not null,                         -- mcq | term_definition
  cognitive_level  text,                                   -- recall | apply | discriminate | deduce | transfer
  recipe           text,                                   -- groups items generated the same way, for pooled facility calibration
  empirical_p      real,                                    -- observed facility; null until response data arrives
  p_responses      int not null default 0,
  generator_model  text,
  created_at       timestamptz default now(),

  -- mcq-only, nullable
  stem             text,
  options          jsonb,
  answer           int,

  -- term_definition-only, nullable
  term             text,
  clue             text,
  example_sentence text,
  variants         jsonb not null default '[]'::jsonb,
  distractors      jsonb not null default '[]'::jsonb
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_kind_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_kind_check
      check (kind in ('mcq', 'term_definition'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_cognitive_level_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_cognitive_level_check
      check (cognitive_level is null or cognitive_level in ('recall', 'apply', 'discriminate', 'deduce', 'transfer'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_mcq_complete_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_mcq_complete_check
      check (
        kind <> 'mcq'
        or (stem is not null and options is not null and answer is not null)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_term_definition_complete_check'
      and conrelid = 'content_items'::regclass
  ) then
    alter table content_items
      add constraint content_items_term_definition_complete_check
      check (
        kind <> 'term_definition'
        or (term is not null and clue is not null)
      );
  end if;
end $$;

create index if not exists content_items_subject_kind_idx on content_items (subject, kind);
create index if not exists content_items_source_idx       on content_items (source_id);
create index if not exists content_items_topic_idx        on content_items (topic);
