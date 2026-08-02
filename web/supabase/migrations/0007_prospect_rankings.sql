-- WR/QB prospect rankings & comparisons. Scoped by draft_class (the NFL
-- draft year the class belongs to) rather than season/week — shows
-- whichever draft_class has the most recent rows, split by position.
-- This is a Stargazer (free-tier) feature per the pricing copy, so unlike
-- the other /tools/* pages it is NOT tier-gated on the page side.
create table public.prospect_rankings (
  id uuid primary key default gen_random_uuid(),
  draft_class integer not null default extract(year from now())::integer,
  rank integer not null,
  player_name text not null,
  position text not null check (position in ('WR', 'QB')),
  school text,
  comp text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.prospect_rankings enable row level security;

create policy "Anyone can read prospect rankings"
  on public.prospect_rankings for select
  using (true);

create index prospect_rankings_class_position_idx
  on public.prospect_rankings (draft_class, position, rank);
