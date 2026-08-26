-- Truestorey · articles
--
-- Run once in the Supabase SQL editor.
--
-- Two columns are not in the original blueprint and both are deliberate:
--   status      the webhook writes 'draft', always. Nothing reaches the site
--               until a person publishes it. See app/api/webhook/article.
--   source_urls what the pipeline read. Rule 9 — the archive links to primary
--               sources and never reproduces them, and an article with no
--               sources recorded cannot be checked later.

create type article_category as enum ('deep_dive', 'note', 'policy', 'editorial');
create type article_status  as enum ('draft', 'published', 'archived');

create table if not exists public.articles (
  id                                uuid primary key default gen_random_uuid(),
  title                             text not null,
  slug                              text not null unique,
  category                          article_category not null default 'note',
  excerpt                           text,
  content_html                      text not null,
  header_image_url                  text,
  unsplash_photographer_name        text,
  unsplash_photographer_profile_url text,
  unsplash_download_location        text,
  tags                              text[] not null default '{}',
  source_urls                       text[] not null default '{}',
  status                            article_status not null default 'draft',
  created_at                        timestamptz not null default now(),
  published_at                      timestamptz
);

create index if not exists articles_slug_idx      on public.articles (slug);
create index if not exists articles_published_idx on public.articles (status, published_at desc);

-- Row-level security. The anon key may read PUBLISHED rows and nothing else;
-- drafts are invisible to it entirely. Writing is the service role's alone,
-- which is why that key never leaves the server.
alter table public.articles enable row level security;

drop policy if exists "published articles are public" on public.articles;
create policy "published articles are public"
  on public.articles for select
  using (status = 'published');

-- No insert, update or delete policy exists on purpose. Without one, only the
-- service role can write, and the service role bypasses RLS by design.

-- A published article must have a date. Enforced here rather than trusted to
-- every code path that might set the status.
alter table public.articles drop constraint if exists articles_published_needs_date;
alter table public.articles add constraint articles_published_needs_date
  check (status <> 'published' or published_at is not null);
