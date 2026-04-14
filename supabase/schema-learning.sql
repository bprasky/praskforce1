-- PraskForce1 — Task Resolution Learning System Schema
--
-- Run this AFTER schema.sql in the Supabase SQL Editor. These tables form
-- the learning layer that sits on top of the existing `tasks` table. The
-- idea: every resolved task is a training example. Over time the system
-- should be able to propose resolutions on new tasks by matching them to
-- similar historical cases.
--
-- Storage pattern: these tables mirror the localStorage shape used by
-- /src/lib/task-learning.js so callers can work against either backend.

-- ── task_resolutions ─────────────────────────────────────────────────────────
-- One row per resolved task. This is THE training data table — every row
-- here is a concrete example of "what happened, what worked, why." The
-- similarity matcher ranks these to generate proposals for new tasks.

create table if not exists task_resolutions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,                          -- loose FK; localStorage IDs are strings
  created_at timestamptz default now(),

  -- Resolution data
  resolution_type text not null,                  -- 'confirmed' | 'corrected' | 'explained' | 'skipped'
  resolution_action text not null,                -- what was actually done (free text)
  resolution_channel text,                        -- email | phone | whatsapp | instagram_dm | linkedin | in_person | showroom | sample_box | system_action
  resolution_outcome text,                        -- meeting_booked | quote_requested | info_gathered | no_response | declined | deferred | escalated
  resolution_notes text,                          -- why this was the right move — the training signal

  -- Context at resolution time (frozen snapshot — patterns must hold even
  -- if the underlying property/owner/permit data later changes)
  context_snapshot jsonb not null default '{}'::jsonb,

  -- System proposal state (if one was made and shown to the user)
  proposed_action text,
  proposed_accepted boolean,
  correction_delta text,                          -- what changed and why, when corrected

  -- Denormalized pattern-matching keys for fast lookups
  task_category text not null,
  price_tier text,                                -- '$3-8M' | '$8-12M' | '$12M+'
  neighborhood text,
  owner_type text,                                -- llc_domestic | llc_delaware | llc_offshore | trust | individual | unknown
  contact_role text,                              -- owner | attorney | architect | designer | builder | agent | property_manager
  days_since_trigger int,
  outreach_attempt_number int,
  deal_stage text                                 -- pre_outreach | outreach | engaged | quoting | follow_through | closed
);

create index if not exists idx_resolutions_category on task_resolutions(task_category);
create index if not exists idx_resolutions_pattern
  on task_resolutions(task_category, price_tier, owner_type, contact_role);
create index if not exists idx_resolutions_outcome on task_resolutions(resolution_outcome);
create index if not exists idx_resolutions_created on task_resolutions(created_at desc);

-- ── task_proposals ───────────────────────────────────────────────────────────
-- A system-generated proposal presented to the user before they act on a
-- task. Proposals live independently of resolutions because a task can
-- receive a proposal that is later rejected — both facts are training data.

create table if not exists task_proposals (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  created_at timestamptz default now(),

  proposed_action text not null,
  proposed_channel text,
  confidence float not null,                      -- 0.0 .. 1.0
  reasoning text not null,

  matched_resolution_ids uuid[],                  -- which historical resolutions informed this
  match_criteria jsonb,                           -- dimensions that matched and their weights

  status text default 'pending',                  -- pending | accepted | corrected | rejected
  feedback text                                   -- Brad's correction / explanation if not accepted
);

create index if not exists idx_proposals_task on task_proposals(task_id);
create index if not exists idx_proposals_status on task_proposals(status);

-- ── resolution_patterns ──────────────────────────────────────────────────────
-- Aggregated rollups of resolutions, keyed by pattern signature. Rebuilt
-- periodically (cron or on-demand). Used to answer "for tasks like X, what
-- channel wins?" in constant time without rescanning the full resolution
-- table. The materialized shape also lets the UI show generalized patterns
-- rather than individual rows.

create table if not exists resolution_patterns (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz default now(),

  task_category text not null,
  price_tier text,
  owner_type text,
  contact_role text,
  deal_stage text,
  outreach_attempt_low int,                       -- range replacement for int4range
  outreach_attempt_high int,

  sample_size int not null,
  winning_channel text,
  winning_action_summary text,
  avg_days_to_outcome float,
  success_rate float,
  failure_modes text[],

  resolution_ids uuid[]
);

create index if not exists idx_patterns_signature
  on resolution_patterns(task_category, price_tier, owner_type, contact_role);

-- ── task_chats ───────────────────────────────────────────────────────────────
-- Per-task collaborative chat threads. When Brad wants to explain a
-- resolution in natural language ("called the architect, he's out until
-- the 20th, push this back"), the chat captures the raw conversation so
-- the learning system has the full why, not just the structured fields.

create table if not exists task_chats (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  created_at timestamptz default now(),
  role text not null,                             -- user | assistant
  content text not null,
  extracted_data jsonb                            -- resolution fields / follow-up tasks extracted from this turn
);

create index if not exists idx_chats_task on task_chats(task_id, created_at);

-- ── learning_metrics ─────────────────────────────────────────────────────────
-- Adoption-curve metrics. The key chart is acceptance_rate over time — it
-- should trend up. If it plateaus or drops the patterns need review.

create table if not exists learning_metrics (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,

  total_tasks int,
  tasks_with_proposals int,
  proposals_accepted int,
  proposals_corrected int,
  proposals_rejected int,
  tasks_without_proposals int,

  acceptance_rate float,
  correction_rate float,
  coverage_rate float,

  avg_confidence float,
  avg_resolution_time_hours float
);

create index if not exists idx_metrics_period on learning_metrics(period_start desc);
