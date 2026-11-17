-- Fluent schema. Run in the Supabase SQL editor or with `supabase db push`.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message jsonb not null,           -- an AI SDK ModelMessage (provider independent)
  display text,                     -- what the user typed, without injected page context
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, id);

-- Connector secrets are only ever read by the server (service role). No client policies.
create table if not exists public.connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'airtable')),
  secret_enc text not null,         -- AES-256-GCM encrypted refresh token / personal access token
  meta jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  kind text not null,
  summary text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','failed')),
  result jsonb,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.connections enable row level security;
alter table public.pending_actions enable row level security;

create policy "own conversations" on public.conversations for select using (auth.uid() = user_id);
create policy "own messages" on public.messages for select using (auth.uid() = user_id);
create policy "own actions" on public.pending_actions for select using (auth.uid() = user_id);
-- connections: intentionally no policies. Only the server's service role can touch it.
