-- To do list, onboarding state, feedback events, and reprocess jobs. Service-role only.

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  note text,
  due_date date,
  source text not null default 'user' check (source in ('user', 'agent')),
  status text not null default 'open' check (status in ('open', 'suggested', 'done', 'dismissed')),
  dedupe_key text,
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists todos_dedupe_idx on public.todos (user_id, dedupe_key) where dedupe_key is not null;
create index if not exists todos_user_idx on public.todos (user_id, status);

alter table public.settings add column if not exists onboarded_at timestamptz;
alter table public.settings add column if not exists checklist_dismissed boolean not null default false;
alter table public.settings add column if not exists last_push_at timestamptz;
-- Everyone who already has settings has already been using the app: skip onboarding for them.
update public.settings set onboarded_at = now() where onboarded_at is null;

create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  notification_id uuid,
  notif_type text,
  event text not null check (event in ('approved', 'dismissed', 'snoozed', 'refined')),
  edited boolean not null default false,
  detail jsonb,
  run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback_events (created_at desc);

-- Re-reading past emails with a different prompt, without touching anyone's notifications.
create table if not exists public.reprocess_jobs (
  id uuid primary key default gen_random_uuid(),
  prompt jsonb not null,                 -- { pick: "default" | "active" | <version> } or { text: "..." }
  model text,
  days int not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  total int not null default 0,
  done int not null default 0,
  changed int not null default 0,
  error text,
  created_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists public.reprocess_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.reprocess_jobs(id) on delete cascade,
  source_run_id uuid,
  before jsonb,
  after jsonb,
  changed_fields text[] not null default '{}',
  error text
);
create index if not exists reprocess_results_job_idx on public.reprocess_results (job_id);

alter table public.todos enable row level security;
alter table public.feedback_events enable row level security;
alter table public.reprocess_jobs enable row level security;
alter table public.reprocess_results enable row level security;
