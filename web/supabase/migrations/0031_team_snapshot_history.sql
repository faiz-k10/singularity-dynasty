-- Historized copy of saved_teams -- every save appends a row here in
-- addition to updating the "current" row in saved_teams. saved_teams
-- stays the fast read every existing page already uses (current roster
-- only); this table is the substrate for anything that needs to compare
-- "then" vs. "now": roster-decision tracking, season achievements, or
-- any future feature that needs history rather than just current state.
-- Append-only by design (insert + select policies only, no update/
-- delete) -- nothing should ever rewrite a past snapshot.
--
-- Nothing reads this table yet in this bare-bones pass; it's written
-- alongside every saveTeam() call starting now so history exists to read
-- once a feature needs it, instead of only starting to accumulate the
-- day someone gets around to building that feature.

create table public.team_snapshot_history (
  id uuid primary key default gen_random_uuid(),
  saved_team_id uuid not null references public.saved_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  players jsonb not null,
  settings jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index team_snapshot_history_team_idx
  on public.team_snapshot_history (saved_team_id, captured_at desc);

alter table public.team_snapshot_history enable row level security;

create policy "Users can view their own snapshot history"
  on public.team_snapshot_history for select
  using (auth.uid() = user_id);
create policy "Users can insert their own snapshot history"
  on public.team_snapshot_history for insert
  with check (auth.uid() = user_id);
