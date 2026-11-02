-- Errors the site hits, so they're visible in /admin and can raise the hourly alert (Nov 1 2026). Written only by the server
-- with the service role (instrumentation.js for server errors, /api/client-error for crashes in a visitor's browser); RLS on
-- with no policies, so no visitor can read or write it. Holds the route and path (no query string), the message (500
-- characters max) and Next's digest -- never request bodies, cookies or anything typed by a visitor.
-- Run once in the Supabase SQL editor.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'client')),
  route text,
  path text,
  message text,
  digest text
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;
