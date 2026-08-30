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
create unique index if not exists block_watch_email_href on block_watch (lower(email), href);
create index if not exists block_watch_href on block_watch (href);
create index if not exists block_watch_unsub on block_watch (unsub_token);
create index if not exists block_watch_confirm on block_watch (confirm_token);

alter table block_watch enable row level security;
