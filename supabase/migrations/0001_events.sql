-- Engagement / point-transaction event log.
-- Written now, dormant until a Supabase project exists. Field-for-field this
-- MUST match GameEvent in src/lib/logEvent.ts and the data-model in the
-- architecture doc, so the demo and the doc don't drift apart.

create table if not exists public.events (
  id               bigint generated always as identity primary key,
  session_id       text        not null,
  age_bracket      text        not null,          -- '22-29' | '30-39' | '40+'
  stage            text,                           -- 'diagnostic' | 'practice'
  topic            text,
  question_id      text,
  is_correct       boolean,
  condition        text,                           -- 'fixed' | 'variable' (hidden manipulation)
  strength_at_time real,                           -- MEASURED topic strength in [0,1]
  base_reward      integer,
  awarded_reward   integer,
  event_type       text        not null,          -- see EventType in logEvent.ts
  created_at       timestamptz not null default now()
);

-- Analytics helpers for the within-subject analysis (fixed vs variable, by age,
-- and voluntary persistence in the practice stage).
create index if not exists events_session_idx   on public.events (session_id);
create index if not exists events_condition_idx  on public.events (condition);
create index if not exists events_age_idx        on public.events (age_bracket);
create index if not exists events_stage_idx      on public.events (stage);
