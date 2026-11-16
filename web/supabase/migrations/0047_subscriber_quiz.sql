-- The newsletter now signs people up through the Dynasty Manager quiz (Nov 16 2026): first and last name, the archetype the
-- quiz gave them and their answers. All optional, so the plain email sign-up keeps working. Run once in the Supabase SQL editor.
alter table public.subscribers
  add column if not exists first_name text check (first_name is null or char_length(first_name) <= 40),
  add column if not exists last_name text check (last_name is null or char_length(last_name) <= 40),
  add column if not exists archetype text check (archetype is null or char_length(archetype) <= 40),
  add column if not exists quiz jsonb check (quiz is null or pg_column_size(quiz) <= 2000);
