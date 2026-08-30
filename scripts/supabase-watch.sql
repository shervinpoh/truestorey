-- Block watch: who has asked for updates on which block.
--
-- RLS ON, NO POLICIES, exactly like the events table. That means the anon key
-- can do nothing at all here and only the service role can read or write. This
-- table holds an email address against a home address, which is the most
-- sensitive pairing on the site — a leak is "here is where this person lives".
--
-- Consent is recorded as EVIDENCE, not as a boolean. consent_copy is the exact
-- wording the person was shown and consent_version the string from
-- lib/consent.js, so a row can always answer "what did they actually agree to"
-- rather than "someone ticked something once". PDPA s14(2): a consent that
-- cannot be produced is a consent that was never obtained.
--
-- No phone column, deliberately. Consent has been email-only since
-- 24 Aug 2026 and a column that exists gets filled.

create table if not exists block_watch (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  href          text not null,               -- /hdb/<town>/<block-street>
  label         text not null,               -- as shown to the reader
  -- The watermark. See lib/watch.js for why it is a month AND a count and not
  -- either one alone: hdb.json is a rolling window, and HDB registers late.
  mark_month    text,
  mark_n        integer not null default 0,
  consent_copy    text not null,
  consent_version text not null,
  consent_at    timestamptz not null default now(),
  -- Proof of intent, not proof of identity: a subscription is only live once
  -- the address has answered. Stops anyone signing up a stranger's inbox.
  confirmed_at  timestamptz,
  confirm_token text not null,
  unsub_token   text not null,
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- One watch per address per block. A second submission updates rather than
-- duplicating, so a keen reader cannot mail-bomb themselves.
--
-- ⚠ THE INDEX MUST BE ON THE PLAIN COLUMNS, NOT ON lower(email).
-- This was `(lower(email), href)` and every upsert failed with "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification".
-- PostgREST's on_conflict=email,href generates ON CONFLICT (email, href), and
-- Postgres will not match that against a functional index. The bug only
-- appeared on a write; the digest reads, so a read-only check passed.
--
-- The case-folding it was there for is now enforced by the database instead of
-- assumed from the route: the check constraint below makes a non-lowercase
-- address impossible, so a plain unique index is genuinely unique per person.
-- App-level normalisation and a DB-level constraint that disagree is the
-- two-implementations failure this repo keeps writing tests about.
alter table block_watch drop constraint if exists block_watch_email_lower;
alter table block_watch add constraint block_watch_email_lower check (email = lower(email));
drop index if exists block_watch_email_href;
create unique index if not exists block_watch_email_href on block_watch (email, href);
create index if not exists block_watch_href on block_watch (href);
create index if not exists block_watch_unsub on block_watch (unsub_token);
create index if not exists block_watch_confirm on block_watch (confirm_token);

alter table block_watch enable row level security;
