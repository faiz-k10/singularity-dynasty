-- Dynasty draft board: round-by-round startup/rookie board. Not a weekly
-- artifact like redraft/best-ball — published once per season and edited
-- in place via the Table Editor, so this just shows whatever season has
-- the most recent rows for a given board_type.
create table public.draft_board (
  id uuid primary key default gen_random_uuid(),
  season integer not null default extract(year from now())::integer,
  board_type text not null default 'startup' check (board_type in ('startup', 'rookie')),
  round integer not null,
  pick integer not null,
  player_name text not null,
  position text not null,
  team text,
  is_stack boolean not null default false,
  stack_note text,
  created_at timestamptz not null default now()
);

alter table public.draft_board enable row level security;

create policy "Anyone can read the draft board"
  on public.draft_board for select
  using (true);

create index draft_board_season_type_idx
  on public.draft_board (season, board_type, round, pick);
