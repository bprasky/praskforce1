-- PraskForce1 — Supabase Schema
-- Run this in Supabase SQL Editor to create all tables

create table properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  city text,
  zip text,
  area text,
  municipality text,
  folio text unique,
  sale_price numeric,
  sale_date date,
  year_built integer,
  bedrooms integer,
  bathrooms numeric,
  living_sqft integer,
  lot_sqft integer,
  waterfront boolean default false,
  waterfront_feet integer,
  mls_number text,
  property_type text,
  listing_notes text,
  priority text default 'medium' check (priority in ('highest','high','medium','low','skip')),
  arca_rep text,
  status text default 'new' check (status in ('new','researching','contacted','active','closed','skip')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table owners (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  entity_name text not null,
  entity_type text check (entity_type in ('llc','trust','individual','estate','unknown')),
  sunbiz_doc_number text,
  sunbiz_filing_date date,
  sunbiz_status text,
  principal_address text,
  registered_agent text,
  registered_agent_address text,
  manager_members jsonb,
  background_notes text,
  is_developer boolean default false,
  is_repeat_buyer boolean default false,
  other_properties jsonb,
  created_at timestamptz default now()
);

create table permits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  permit_number text,
  permit_type text,
  permit_status text,
  date_filed date,
  date_issued date,
  valuation numeric,
  scope_description text,
  applicant_name text,
  contractor_name text,
  contractor_license text,
  architect_name text,
  architect_license text,
  engineer_name text,
  arca_tier integer check (arca_tier between 1 and 3),
  portal_source text,
  raw_data jsonb,
  created_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  role text,
  email text,
  phone text,
  linkedin_url text,
  notes text,
  in_arca_crm boolean default false,
  arca_relationship text,
  created_at timestamptz default now()
);

create table property_contacts (
  property_id uuid references properties(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  relationship text,
  primary key (property_id, contact_id, relationship)
);

create table lead_scores (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade unique,
  price_score integer default 0,
  permit_score integer default 0,
  entity_score integer default 0,
  relationship_score integer default 0,
  timing_score integer default 0,
  total_score integer generated always as (
    price_score + permit_score + entity_score + relationship_score + timing_score
  ) stored,
  scored_at timestamptz default now()
);

create table scan_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  portal text,
  scan_type text,
  result_summary text,
  found_new_data boolean default false,
  scanned_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  type text,
  description text,
  contact text,
  property text,
  materials text,
  deadline text,
  priority text default 'medium',
  status text default 'pending',
  crm_data jsonb,
  meeting_id text,
  playbook text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  contact text,
  property text,
  notes text,
  task_count integer default 0,
  created_at timestamptz default now()
);

create table outreach (
  id uuid primary key default gen_random_uuid(),
  property_id uuid,
  property_address text,
  contact_name text,
  type text,
  status text default 'drafted',
  subject text,
  body text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_properties_priority on properties(priority);
create index idx_properties_status on properties(status);
create index idx_properties_municipality on properties(municipality);
create index idx_permits_property on permits(property_id);
create index idx_permits_arca_tier on permits(arca_tier);
create index idx_owners_property on owners(property_id);
create index idx_lead_scores_total on lead_scores(total_score desc);
create index idx_scan_log_property on scan_log(property_id);
create index idx_tasks_status on tasks(status);

-- Updated_at trigger
create or replace function update_modified_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger properties_updated
  before update on properties
  for each row execute function update_modified_column();

create trigger tasks_updated
  before update on tasks
  for each row execute function update_modified_column();

-- Hot leads view
create view hot_leads as
  select
    p.id, p.address, p.area, p.municipality, p.sale_price, p.sale_date,
    p.property_type, p.priority, p.status, p.arca_rep,
    o.entity_name as owner, o.entity_type, o.is_developer,
    ls.total_score, ls.permit_score,
    (select count(*) from permits pm where pm.property_id = p.id and pm.arca_tier <= 2) as active_permits,
    (select string_agg(pm.permit_type || ' (' || pm.permit_status || ')', ', ')
     from permits pm where pm.property_id = p.id and pm.arca_tier <= 2) as permit_summary
  from properties p
  left join owners o on o.property_id = p.id
  left join lead_scores ls on ls.property_id = p.id
  where p.status != 'skip'
  order by ls.total_score desc nulls last, p.sale_price desc;
