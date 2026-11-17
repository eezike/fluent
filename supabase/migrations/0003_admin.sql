-- Admin portal: roles, controls, run log, prompt versions, evals, audit log.
-- Every table is service-role only (RLS on, no policies). The browser never reads these directly.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- Global switches: pause_sending, pause_agent, dry_run_all, auto_pause_errors, promote_gate, model_prices.
create table if not exists public.system_flags (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Per-user pause (set from the admin portal).
alter table public.settings add column if not exists paused boolean not null default false;
alter table public.settings add column if not exists paused_note text;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('classify', 'draft', 'ask', 'refine')),
  source text not null default 'live' check (source in ('live', 'eval', 'reprocess')),
  prompt_key text,
  prompt_version int,                    -- null = the default that ships in code
  model text,
  input jsonb,
  output jsonb,
  error text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index if not exists agent_runs_created_idx on public.agent_runs (created_at desc);
create index if not exists agent_runs_kind_idx on public.agent_runs (kind, created_at desc);

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version int not null,
  body text not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (key, version)
);

-- Which version is live, and who gets the candidate.
create table if not exists public.prompt_rollout (
  key text primary key,
  active_version int,                    -- null = default in code
  candidate_version int,
  mode text not null default 'off' check (mode in ('off', 'admins', 'percent')),
  percent int not null default 0 check (percent between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.eval_suites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  type text not null check (type in ('extraction', 'plan', 'safety')),
  created_at timestamptz not null default now()
);

create table if not exists public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.eval_suites(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('classify', 'plan')),
  input jsonb not null,
  checks jsonb not null default '[]',
  source_run_id uuid references public.agent_runs(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists eval_cases_suite_idx on public.eval_cases (suite_id);

create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid references public.eval_suites(id) on delete set null,   -- null = all suites
  prompts jsonb not null default '{}',   -- { promptKey: version | "default" | "active" }
  model text,
  repeats int not null default 1,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  total int not null default 0,
  done int not null default 0,
  passed int not null default 0,
  flaky int not null default 0,
  cost_usd numeric,
  error text,
  created_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists eval_runs_started_idx on public.eval_runs (started_at desc);

create table if not exists public.eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.eval_runs(id) on delete cascade,
  case_id uuid references public.eval_cases(id) on delete set null,
  case_name text not null,
  repeat int not null default 0,
  pass boolean not null,
  checks jsonb not null default '[]',    -- [{ field, type, expected, actual, pass }]
  output jsonb,
  error text,
  latency_ms int,
  cost_usd numeric
);
create index if not exists eval_results_run_idx on public.eval_results (run_id);

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor uuid,
  actor_email text,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);

alter table public.admins enable row level security;
alter table public.system_flags enable row level security;
alter table public.agent_runs enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.prompt_rollout enable row level security;
alter table public.eval_suites enable row level security;
alter table public.eval_cases enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_results enable row level security;
alter table public.admin_audit enable row level security;

-- Make yourself the first admin (run once in the SQL editor, with your own email):
--   insert into public.admins (user_id, email) select id, email from auth.users where email = 'you@example.com';
