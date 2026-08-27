-- Saved teams imported from external platforms (Sleeper first; Yahoo/ESPN
-- later per CLAUDE.md's roadmap). One row per team a user has saved,
-- storing a snapshot of the roster at save time (players jsonb) rather than
-- live-querying the platform on every page view -- refreshed by re-saving.
create table public.saved_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'sleeper' check (platform in ('sleeper')),
  platform_username text not null,
  platform_league_id text not null,
  platform_roster_id text,
  league_name text,
  team_name text,
  players jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, platform_league_id)
);

alter table public.saved_teams enable row level security;

create policy "Users can view their own saved teams"
  on public.saved_teams for select
  using (auth.uid() = user_id);

create policy "Users can insert their own saved teams"
  on public.saved_teams for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own saved teams"
  on public.saved_teams for update
  using (auth.uid() = user_id);

create policy "Users can delete their own saved teams"
  on public.saved_teams for delete
  using (auth.uid() = user_id);

create trigger on_saved_teams_updated
  before update on public.saved_teams
  for each row execute function public.handle_updated_at();
