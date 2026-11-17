-- Notification-first model: notifications (the inbox), deals (cached from the user's source of truth),
-- jobs (activity log), and per-user settings.

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source_of_truth text check (source_of_truth in ('sheets', 'airtable')),
  gmail_email text,
  gmail_history_id text,
  gmail_watch_expires_at timestamptz,
  last_sync_at timestamptz,
  last_import_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text,                       -- e.g. airtable:rec123, sheet:<id>:7, fluent:<thread id>
  brand text not null,
  category text,                         -- product category, used for exclusivity checks
  fee numeric,
  currency text not null default 'USD',
  deliverables text,
  usage_rights text,
  usage_rights_end date,
  exclusivity_category text,
  exclusivity_until date,
  post_start date,
  post_end date,
  payment_terms text,
  payment_due date,
  paid_at date,
  status text not null default 'active' check (status in ('offer', 'active', 'paid', 'declined')),
  thread_id text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists deals_source_key_idx on public.deals (user_id, source_key);
create index if not exists deals_user_idx on public.deals (user_id, status);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  category text not null check (category in ('opportunity', 'attention', 'money', 'info')),
  type text not null,                    -- new_offer, offer_flagged, payment_overdue, usage_ending, ask_source_of_truth, ...
  title text not null,
  body text not null default '',
  urgency text not null default 'normal' check (urgency in ('normal', 'urgent')),
  status text not null default 'open' check (status in ('open', 'running', 'done', 'dismissed')),
  flags jsonb not null default '[]',     -- [{title, detail}]
  terms jsonb not null default '[]',     -- [{label, value, quote?}]
  steps jsonb not null default '[]',     -- [{label, state}]
  sources jsonb not null default '[]',   -- [string]
  proposed jsonb not null default '{}',  -- {template, primaryLabel, actions: PlannedAction[], options?}
  thread jsonb not null default '[]',    -- contextual chat [{role, text}]
  thread_id text,
  deal_id uuid references public.deals(id) on delete set null,
  error text,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on public.notifications (user_id, status, created_at desc);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  steps jsonb not null default '[]',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_notification_idx on public.jobs (notification_id, started_at desc);

alter table public.settings enable row level security;
alter table public.deals enable row level security;
alter table public.notifications enable row level security;
alter table public.jobs enable row level security;
create policy "own settings" on public.settings for select using (auth.uid() = user_id);
create policy "own deals" on public.deals for select using (auth.uid() = user_id);
create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "own jobs" on public.jobs for select using (auth.uid() = user_id);
-- All writes go through the server's service role.
