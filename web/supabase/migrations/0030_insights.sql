-- Generic, malleable personalization-results store. This is the shared
-- substrate for every "insight" the site computes about a user or one of
-- their saved teams (GM Archetype, season-record badges, and whatever
-- gets added later -- decision-alignment scores, achievements, etc.).
-- A brand new personalized feature should need ONE new insight_key and a
-- compute() function in web/lib/insights/ -- never a new migration and
-- never a new table. That's the whole point of this schema.
--
-- Split into two tables by scope (user-level vs. per-saved-team) rather
-- than one polymorphic table with a nullable saved_team_id, because each
-- needs a plain (non-partial) unique constraint that Supabase's
-- `.upsert(..., { onConflict })` can target directly -- a nullable FK
-- would need a partial unique index, and Postgres only matches an
-- ON CONFLICT clause against a partial index if the same WHERE predicate
-- is repeated in the conflict clause, which the Supabase JS client has
-- no way to express.

create table public.user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_key text not null,
  value jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (user_id, insight_key)
);

create table public.team_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_team_id uuid not null references public.saved_teams(id) on delete cascade,
  insight_key text not null,
  value jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (saved_team_id, insight_key)
);

alter table public.user_insights enable row level security;
alter table public.team_insights enable row level security;

create policy "Users can view their own insights"
  on public.user_insights for select
  using (auth.uid() = user_id);
create policy "Users can insert their own insights"
  on public.user_insights for insert
  with check (auth.uid() = user_id);
create policy "Users can update their own insights"
  on public.user_insights for update
  using (auth.uid() = user_id);
create policy "Users can delete their own insights"
  on public.user_insights for delete
  using (auth.uid() = user_id);

create policy "Users can view their own team insights"
  on public.team_insights for select
  using (auth.uid() = user_id);
create policy "Users can insert their own team insights"
  on public.team_insights for insert
  with check (auth.uid() = user_id);
create policy "Users can update their own team insights"
  on public.team_insights for update
  using (auth.uid() = user_id);
create policy "Users can delete their own team insights"
  on public.team_insights for delete
  using (auth.uid() = user_id);
