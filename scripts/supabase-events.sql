-- Truestorey · events
--
-- Run once in the Supabase SQL editor, alongside supabase-schema.sql.
--
-- WHY THIS TABLE EXISTS AT ALL
-- ----------------------------
-- /api/track used to append to data/events.jsonl. That is correct on a
-- long-running Node server and wrong on serverless, where the filesystem is
-- ephemeral: the route returns 204, the write succeeds, the container is
-- recycled, and every event is gone. It looks perfectly healthy while losing
-- everything, which is the worst failure available.
--
-- WHAT MAY BE STORED HERE
-- -----------------------
-- The privacy contract lives in lib/analytics.js and it has not changed by
-- moving sinks. No cookies, no IP — not even hashed — no user agent, no free
-- text from the lead form. `s` is a random per-tab id from sessionStorage that
-- dies with the tab and cannot be tied to a person. Nothing here is a PDPA
-- data subject record, which is what lets the site open with no cookie banner.
--
-- sanitise() in lib/analytics.js is the boundary. If a field is ever added
-- there, ask first whether it identifies someone. Adding one that does turns
-- this table into personal data and the site into one that needs a consent
-- notice.

create table if not exists public.events (
  id    bigserial   primary key,
  t     timestamptz not null default now(),
  e     text        not null,
  s     text        not null,
  -- The per-event whitelisted fields — p, d, r, q, n, href, kind, consent —
  -- vary by event type. Kept as jsonb so the column set does not have to
  -- change every time an event is added to lib/analytics.js.
  props jsonb       not null default '{}'::jsonb
);

create index if not exists events_t_idx on public.events (t desc);
create index if not exists events_e_idx on public.events (e, t desc);
create index if not exists events_s_idx on public.events (s);

-- Row-level security with NO POLICIES AT ALL. That is deliberate and it is not
-- an oversight: with RLS on and no policy, the publishable key can neither read
-- nor write, and only the service role gets through — it bypasses RLS by
-- design. Analytics must never be publicly readable, and the anon key ships to
-- every browser.
alter table public.events enable row level security;
