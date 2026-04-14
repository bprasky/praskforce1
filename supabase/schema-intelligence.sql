-- PraskForce1 — Intelligence Layer Schema
-- Stores agent runs, per-step events, and extracted quotes.
-- Apply with: psql ... -f schema-intelligence.sql  (or paste into Supabase SQL editor)
-- Idempotent: safe to re-run.

-- ── Agent runs ──
create table if not exists agent_runs (
  id              text primary key,
  task_id         text not null,
  status          text not null default 'pending',  -- pending | running | success | error
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  duration_ms     integer,
  error_message   text,
  result_summary  jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists agent_runs_task_id_idx    on agent_runs(task_id);
create index if not exists agent_runs_status_idx     on agent_runs(status);
create index if not exists agent_runs_started_at_idx on agent_runs(started_at desc);

-- ── Per-step log events for a run ──
create table if not exists agent_run_events (
  id          bigserial primary key,
  run_id      text not null references agent_runs(id) on delete cascade,
  ts          timestamptz not null default now(),
  level       text not null default 'info',         -- info | warn | error | success
  step        text,                                 -- e.g. "login", "navigate.quotes", "extract.dom"
  message     text not null,
  data        jsonb
);

create index if not exists agent_run_events_run_id_idx on agent_run_events(run_id, ts);

-- ── Extracted quotes (StoneProfits) ──
create table if not exists quotes (
  id              bigserial primary key,
  run_id          text references agent_runs(id) on delete set null,
  source          text not null default 'stoneprofits',
  quote_number    text,
  quote_date      date,
  customer        text,
  contact         text,
  project         text,
  materials       jsonb,
  total           numeric,
  status          text,
  salesperson     text,
  raw             jsonb,
  extracted_at    timestamptz not null default now(),
  unique(source, quote_number)
);

create index if not exists quotes_quote_number_idx on quotes(quote_number);
create index if not exists quotes_customer_idx     on quotes(customer);
create index if not exists quotes_status_idx       on quotes(status);
