-- The Night Sky (Nov 2026): each member's sky -- stars, constellations, the core, their catalogue, sets, Beat the Model picks and reward claims --
-- as one JSON document per member (lib/nightSky.js defines it). Only the server reads and writes it (lib/nightSkyStore.js, with the service
-- role), because every roll of the dice happens there: there is NO policy for signed-in users, so nobody can edit their own sky through the
-- API. Run once in the Supabase SQL editor.

create table if not exists public.night_sky (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint night_sky_size_limit check (pg_column_size(state) < 500000)
);

alter table public.night_sky enable row level security;
-- (deliberately no policies: the public and signed-in keys can neither read nor write this table)
