-- Migration 003: add `sources` and `content_items` tables.
--
-- Package K-1 (docs/PROJECT_MAP.md §3). The normalized content-primitive layer:
-- one ingestion pass over an uploaded document (`sources`) produces typed rows
-- in `content_items` that every game reads and every generator writes. Two
-- kinds only for the pilot roster: `mcq` (quiz) and `term_definition` (match,
-- fill-in-the-blanks, choose-the-right-word, Wordle). `passage` is deliberately
-- not included -- no pilot game consumes it (PROJECT_MAP §3 K-1).
--
-- Additive only: this migration creates two new tables. It does not alter,
-- rename, or drop `questions`, `students`, or `events`.
--
-- Apply by pasting this file into the Neon web SQL editor.
-- (psql is not installed on the dev machine -- see docs/CURRENT_STATE.md.)

-- One row per uploaded document. Multi-tenant/subject-scoped from day one per
-- PROJECT_MAP §1.5, even though the upload UI itself is deferred past the pilot.
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

-- The normalized content-primitive layer. Sparse, typed columns rather than a
-- `payload jsonb` blob -- a research constraint (PROJECT_MAP §3 K-1): the
-- dataset must stay queryable in plain SQL.
--
-- IMPORTANT -- `empirical_p` and `cognitive_level` are deliberately separate
-- columns and must stay that way. `cognitive_level` is a generation control
-- (what kind of thinking the item demands -- recall/apply/discriminate/
-- deduce/transfer); it is NOT a difficulty ordering. `empirical_p` (observed
-- facility, backed by `p_responses`) is the ONLY difficulty that exists in
-- this system. Collapsing the two into one scale is exactly the mistake that
-- produced the current non-discriminating difficulty scale on `questions`
-- (PROJECT_MAP §1.6, §3 K-1). Do not merge them in a future migration.
create table if not exists content_items (
  id               text primary key,
  source_id        text not null references sources(id),
  subject          text not null,
  topic            text,                                 -- drives the strength/weakness map (§1.7)
  page             int,
  kind             text not null,                         -- mcq | term_definition
  cognitive_level  text,                                   -- recall | apply | discriminate | deduce | transfer; generation control, not difficulty (see note above)
  recipe           text,                                   -- groups items generated the same way, for pooled facility calibration (§2.6)
  empirical_p      real,                                    -- observed facility; null until response data arrives. The only difficulty that exists.
  p_responses      int not null default 0,                  -- how many responses empirical_p rests on
  generator_model  text,                                    -- which model wrote it; needed for the paper
  created_at       timestamptz default now(),

  -- mcq-only, nullable
  stem             text,
  options          jsonb,                                   -- string[]
  answer           int,                                     -- index into options

  -- term_definition-only, nullable
  term             text,
  clue             text,                                    -- crossword clue, match target, Wordle hint
  example_sentence text,                                    -- sentence containing the term; what fill-in-the-blanks blanks out. Nullable -- without it that game skips the item.
  variants         jsonb not null default '[]'::jsonb,       -- other acceptable answers (abbreviations, plurals); cannot be derived
  distractors      jsonb not null default '[]'::jsonb        -- near-miss terms for choose-the-right-word / match-the-following; cannot be derived
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

-- Per-kind completeness. A row of the OTHER kind passes trivially because the
-- `kind <> ...` disjunct short-circuits the check.
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
