-- PraskForce1 — Task Tree & Lineage System (migration)
--
-- ADDITIVE ONLY. Run this on top of schema.sql + schema-intelligence.sql +
-- schema-learning.sql. It extends the existing `tasks` table with lineage
-- columns, adds a `task_origins` registry, and creates views that
-- reconstruct full trees and aggregate outcomes.
--
-- Notes on naming conventions:
--
-- The existing `tasks` table uses `type` as the category column (QUOTE,
-- FOLLOW_UP, EMAIL, etc). The spec calls this `category`. To avoid
-- breaking every caller we keep `type` as the canonical column and
-- expose `type AS category` in the views below. The spec's `title`
-- field is new — we add it as a nullable column. Existing rows will
-- have `title = NULL` and the UI falls back to `description` for
-- display, same as today.
--
-- Origin types: 'meeting_notes' | 'agent_scan' | 'manual' | 'referral'
--               | 'permit_hit'  | 'social_signal'
-- Resolution:   'open'          | 'won'        | 'lost'   | 'stale'
--               | 'merged'      | 'deferred'

-- ── tasks: lineage columns ────────────────────────────────────────────

alter table tasks add column if not exists parent_task_id uuid references tasks(id);
alter table tasks add column if not exists origin_id uuid;
-- origin_id is NOT NULL in the spec but we can't enforce that on a
-- legacy table — existing rows have no origin. The ingestion path
-- backfills a synthetic origin row for legacy tasks. New tasks created
-- by createTaskWithLineage() will always have origin_id set.
alter table tasks add column if not exists origin_type text default 'manual';
alter table tasks add column if not exists resolution text default 'open';
alter table tasks add column if not exists resolved_at timestamptz;
alter table tasks add column if not exists resolved_note text;
alter table tasks add column if not exists depth integer default 0;
alter table tasks add column if not exists property_id uuid;
alter table tasks add column if not exists account_id uuid;
alter table tasks add column if not exists pipeline_deal_id uuid;
alter table tasks add column if not exists title text;
-- Display title. Falls back to description when null.

create index if not exists idx_tasks_parent on tasks(parent_task_id);
create index if not exists idx_tasks_origin on tasks(origin_id);
create index if not exists idx_tasks_resolution on tasks(resolution);
create index if not exists idx_tasks_property on tasks(property_id);
create index if not exists idx_tasks_account on tasks(account_id);
create index if not exists idx_tasks_pipeline_deal on tasks(pipeline_deal_id);

-- ── task_origins: what kicked off each tree ──────────────────────────

create table if not exists task_origins (
  id uuid primary key default gen_random_uuid(),
  origin_type text not null,
  title text not null,
  raw_content text,              -- full meeting notes, agent output, etc.
  source_agent text,             -- 'SCAN-PERMITS-001' etc, when applicable
  property_id uuid,
  account_id uuid,
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);
create index if not exists idx_task_origins_type on task_origins(origin_type);
create index if not exists idx_task_origins_property on task_origins(property_id);
create index if not exists idx_task_origins_account on task_origins(account_id);

-- Add the FK from tasks.origin_id now that task_origins exists.
-- Wrapped in a DO block because ALTER TABLE ADD CONSTRAINT has no
-- IF NOT EXISTS on all Postgres versions.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_origin_id_fkey'
      and conrelid = 'tasks'::regclass
  ) then
    alter table tasks add constraint tasks_origin_id_fkey
      foreign key (origin_id) references task_origins(id);
  end if;
end $$;

-- ── Recursive tree view: reconstruct every task's lineage ────────────

create or replace view task_tree as
with recursive tree as (
  -- Root nodes
  select
    t.id,
    t.parent_task_id,
    t.origin_id,
    t.origin_type,
    t.type                    as category,
    t.title,
    t.description,
    t.status,
    t.resolution,
    t.resolved_at,
    t.resolved_note,
    t.depth,
    t.property_id,
    t.account_id,
    t.pipeline_deal_id,
    t.created_at,
    t.id                      as root_task_id,
    array[t.id]               as path
  from tasks t
  where t.parent_task_id is null

  union all

  -- Children (recurse)
  select
    c.id,
    c.parent_task_id,
    c.origin_id,
    c.origin_type,
    c.type                    as category,
    c.title,
    c.description,
    c.status,
    c.resolution,
    c.resolved_at,
    c.resolved_note,
    c.depth,
    c.property_id,
    c.account_id,
    c.pipeline_deal_id,
    c.created_at,
    tree.root_task_id,
    tree.path || c.id
  from tasks c
  join tree on c.parent_task_id = tree.id
)
select * from tree;

-- ── Tree summary: one row per origin with aggregate outcome ──────────

create or replace view task_tree_summary as
select
  o.id                       as origin_id,
  o.origin_type,
  o.title                    as origin_title,
  o.property_id,
  o.account_id,
  count(t.id)                as total_tasks,
  coalesce(max(t.depth), 0)  as max_depth,
  count(case when t.resolution = 'open'     then 1 end) as open_tasks,
  count(case when t.resolution = 'won'      then 1 end) as won_tasks,
  count(case when t.resolution = 'lost'     then 1 end) as lost_tasks,
  count(case when t.resolution = 'stale'    then 1 end) as stale_tasks,
  count(case when t.resolution = 'merged'   then 1 end) as merged_tasks,
  count(case when t.resolution = 'deferred' then 1 end) as deferred_tasks,
  min(t.created_at)          as first_task_at,
  max(t.resolved_at)         as last_resolved_at,
  extract(epoch from (max(t.resolved_at) - min(t.created_at))) / 86400
                             as lifespan_days,
  case when count(case when t.resolution = 'open' then 1 end) = 0
       then true else false end                         as is_terminal,
  case
    when count(case when t.resolution = 'won' then 1 end) > 0
      then 'won'
    when count(case when t.resolution = 'open' then 1 end) = 0
     and count(case when t.resolution = 'lost' then 1 end) > 0
      then 'lost'
    when count(case when t.resolution = 'open' then 1 end) = 0
      then 'closed'
    else 'active'
  end                         as tree_outcome
from task_origins o
left join tasks t on t.origin_id = o.id
group by o.id, o.origin_type, o.title, o.property_id, o.account_id;

-- ── Pattern detection: category × depth × resolution × outcome ────────

create or replace view task_resolution_patterns as
select
  t.type                                                   as category,
  t.depth,
  t.resolution,
  ts.tree_outcome,
  count(*)                                                 as task_count,
  avg(extract(epoch from (t.resolved_at - t.created_at)) / 86400)
                                                           as avg_days_to_resolve
from tasks t
join task_tree_summary ts on t.origin_id = ts.origin_id
where t.resolution != 'open'
  and t.resolved_at is not null
group by t.type, t.depth, t.resolution, ts.tree_outcome;

-- ── Per-account rollup for the Accounts page ──────────────────────────

create or replace view account_tree_rollup as
select
  ts.account_id,
  count(*)                                                 as total_trees,
  count(case when ts.tree_outcome = 'won'  then 1 end)     as trees_won,
  count(case when ts.tree_outcome = 'lost' then 1 end)     as trees_lost,
  count(case when ts.is_terminal = false   then 1 end)     as active_trees,
  sum(ts.total_tasks)                                       as total_tasks,
  sum(ts.open_tasks)                                        as open_tasks,
  avg(case when ts.tree_outcome = 'won'
           then ts.lifespan_days end)                      as avg_won_lifespan_days,
  avg(case when ts.tree_outcome = 'lost'
           then ts.lifespan_days end)                      as avg_lost_lifespan_days,
  max(ts.last_resolved_at)                                 as most_recent_resolution
from task_tree_summary ts
where ts.account_id is not null
group by ts.account_id;

-- ── Per-pipeline-deal rollup for the Pipeline page ────────────────────

create or replace view pipeline_deal_tree_health as
select
  t.pipeline_deal_id                                        as deal_id,
  count(*)                                                  as total_tasks,
  count(case when t.resolution = 'open' then 1 end)         as open_tasks,
  max(t.updated_at)                                         as last_activity_at,
  -- "stale" if the most recent activity is >7 days ago
  case
    when count(case when t.resolution = 'open' then 1 end) = 0 then 'closed'
    when max(t.updated_at) < now() - interval '7 days'      then 'stale'
    -- "at_risk" if any open QUOTE or FOLLOW_UP task is >3 days old
    when exists (
      select 1 from tasks t2
      where t2.pipeline_deal_id = t.pipeline_deal_id
        and t2.resolution = 'open'
        and t2.type in ('QUOTE', 'QUOTE_ADJUSTMENT', 'FOLLOW_UP')
        and t2.created_at < now() - interval '3 days'
    ) then 'at_risk'
    else 'progressing'
  end                                                        as health
from tasks t
where t.pipeline_deal_id is not null
group by t.pipeline_deal_id;
