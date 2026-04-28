-- PraskForce1 — Resolution Capture Schema
--
-- Three tables form the substrate for the eventual learning model:
--   workflow_runs   — one row per wired-workflow execution
--   workflow_steps  — atomic step-level capture for every run
--   task_events     — lifecycle log for every task (created/dispatched/resolved/reopened)
--
-- The point of these tables is NOT analytics. It is the substrate for
-- the learning model that will eventually replace some copy-prompt
-- categories with wired ones. Three things matter:
--
--   1. Every workflow run logs every step. Even successful ones.
--      Without success data we cannot tell when a "fix" broke
--      something else.
--   2. Every task resolution is captured with channel + outcome.
--      This is what the meeting-notes parser's few-shot examples
--      come from.
--   3. expected/observed on failed steps must be human-readable.
--      "Element #search-btn not found" is useless. The runner is
--      responsible for writing useful messages.
--
-- Apply with: psql … -f supabase/schema-resolution.sql
-- Idempotent: uses `if not exists` so re-running is safe.

-- Step-level capture for any wired workflow (Puppeteer or otherwise)
create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_key text not null,           -- e.g. 'permit_scan_miami_beach'
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text not null,                 -- running | success | partial | failed
  trigger text,                         -- 'manual' | 'scheduled' | 'chained'
  summary jsonb                         -- counts, IDs created, etc.
);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references workflow_runs(id) on delete cascade,
  step_key text not null,               -- e.g. 'login', 'search_permits', 'extract_row'
  step_index int not null,
  status text not null,                 -- success | failed | skipped
  critical boolean default true,        -- if true, failure halts the run
  attempted_at timestamptz default now(),
  duration_ms int,
  expected text,                        -- what we expected to see
  observed text,                        -- what we actually saw
  screenshot_path text,                 -- only on failure
  error_message text,
  resolution_note text                  -- filled in by user when they fix it
);

-- Lifecycle log for tasks (separate from the eventual learning model).
-- Every wired action and every task lifecycle event lands here. The
-- meeting-notes parser later reads from this table to build few-shot
-- examples — even one resolution improves the next parse.
create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  event_type text not null,             -- 'created' | 'dispatched' | 'resolved' | 'reopened'
  event_at timestamptz default now(),
  channel text,                         -- 'wired' | 'copy_prompt' | 'manual'
  outcome text,                         -- 'completed' | 'no_action' | 'deferred' | 'failed'
  notes text,
  metadata jsonb
);

create index if not exists idx_workflow_runs_key_started on workflow_runs (workflow_key, started_at desc);
create index if not exists idx_workflow_steps_run_index on workflow_steps (run_id, step_index);
create index if not exists idx_task_events_task_event on task_events (task_id, event_at desc);
