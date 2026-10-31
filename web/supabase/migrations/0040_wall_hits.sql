-- Paywall telemetry (Oct 30 2026): one row each time a visitor SEES an upgrade wall ("view", once per wall per browser session) or CLICKS toward
-- pricing ("click"), so you can see which wall earns money. Written only by the server (app/api/wall/route.js, service role); nobody can read or write
-- it from the browser. No IP address or device id is stored: `user_id` is set only when the visitor is signed in (so a later upgrade can be matched),
-- `tier` is what they were on at the time. Read it with scripts/wall-report.mjs.
-- Run once in the Supabase SQL editor.

create table if not exists public.wall_hits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('view', 'click')),
  wall text not null,
  page text not null,
  tier text not null,
  user_id uuid references auth.users (id) on delete set null
);

create index if not exists wall_hits_wall_type_idx on public.wall_hits (wall, type, created_at desc);
create index if not exists wall_hits_user_idx on public.wall_hits (user_id) where user_id is not null;

-- RLS on with no policies = closed to everyone except the service role.
alter table public.wall_hits enable row level security;
