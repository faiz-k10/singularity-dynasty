-- Newsletter/blog post links shown in the landing page's "Recent Drops" feed.
-- Rows are added by hand via the Supabase Table Editor — no code changes
-- needed to publish a new post.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null default '#',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Public (including signed-out visitors) can read posts; only the project
-- owner via the Supabase dashboard can write, since no insert/update/delete
-- policy is granted here.
create policy "Anyone can read posts"
  on public.posts for select
  using (true);
