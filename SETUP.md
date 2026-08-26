# What Shervin has to run

The bridge Claude works over has no network and cannot install packages, so
everything below has to happen in Terminal. Nothing here is urgent — the site
runs today without any of it.

## 1 · No npm install is needed

Deliberate. All three AI engines and Supabase are called over plain `fetch`
against ordinary HTTPS endpoints, so the dependency list is still:

```
next  react  react-dom
```

No `@supabase/supabase-js`, no `ai`, no `@ai-sdk/react`, no `@google/genai`.
They would have added four packages and a version treadmill for streaming and
a query builder this codebase can do in about eighty lines.

## 2 · Fix the supply check — DONE 25 Aug

`npm run geocode` has been run. **MOP coverage went from 5.9% to 100%** and
geo.json holds 14,562 records. Blindspot's supply check now measures a real
2km radius instead of falling back to the town:

| | within 2km |
|---|---|
| Punggol | 9,459 upcoming of 68,329 = **13.8%** |
| Tampines | 9,886 of 72,146 = **13.7%** |
| Sengkang | 5,059 of 69,007 = **7.3%** |
| Bishan | 2,984 of 59,787 = **5.0%** |
| Queenstown | 1,104 of 31,518 = **3.5%** |

Nothing further to do here. Re-run `npm run geocode` after any HDB ingest that
adds new blocks; it only fetches addresses it has not seen.

## 3 · Two more ingests, when you want the other two checks

```
npm run ingest:gls       # not written yet — see below
npm run ingest:zoning    # not written yet — see below
```

These are the two Blindspot checks that currently show as "not run". Neither
script exists yet: both need a source decided first. URA publishes the GLS
programme and the Master Plan land-use layer, but I did not want to guess at
which dataset and write an ingest against an endpoint I could not test.

Until they exist the score is out of 6 rather than 10, and the page says so.

## 4 · The article pipeline

**a.** Create a Supabase project, then run `scripts/supabase-schema.sql` in the
SQL editor. It creates the table, the enums, the indexes and the RLS policy.
Two columns are not in the original blueprint and both are deliberate:
`status` (the webhook always writes `draft`) and `source_urls`.

**b.** Fill in the Supabase block of `.env.local` from `.env.example`.

**c.** Point Make.com at:

```
POST https://<your-domain>/api/webhook/article
Authorization: Bearer <ARTICLE_WEBHOOK_SECRET>
Content-Type: application/json
```

with a body of:

```json
{
  "title": "…",
  "slug": "optional — derived from the title if absent",
  "category": "deep_dive | note | policy | editorial",
  "excerpt": "…",
  "content_html": "<p>…</p>",
  "header_image_url": "https://images.unsplash.com/…",
  "unsplash_photographer_name": "…",
  "unsplash_photographer_profile_url": "https://unsplash.com/@…",
  "unsplash_download_location": "https://api.unsplash.com/photos/…/download",
  "tags": ["bishan", "mop"],
  "source_urls": ["https://…", "https://…"]
}
```

It returns `201` with `{ ok, id, slug, status: "draft", review: "/studio" }`.

**What it does on the way in:** verifies the Bearer token in constant time,
sanitises the HTML against an allowlist, pings the Unsplash download endpoint
their licence requires, drops an Unsplash image that arrives with no
photographer credit, resolves slug collisions, and files it as a **draft**.

**d.** Set `STUDIO_PASSWORD` and review drafts at `/studio`. Publishing from
there is the only thing that puts an article on the site — that is your bot
confirmation step, built in.

## 5 · The AI keys

Add whichever you want from the `.env.example` AI block. Each is independent:
a missing key disables its own feature and nothing else.

- `PERPLEXITY_API_KEY` → `/neighbourhood`
- `ANTHROPIC_API_KEY` → the Blindspot summary paragraph (the score works without it)
- `GEMINI_API_KEY` → `/floorplan`

## 6 · Before go-live

- `npm run build` — the AI routes have never been through a production build here.
- Test the webhook end to end from Make.com against a preview deploy first.
- `/studio` is HTTP Basic over one password. Fine for one person; if a second
  ever needs in, that is the moment for Supabase Auth, not a second password.
- Confirm the LTV and stamp duty rates against source once more before the site
  is public. `RATES_REVIEWED` and `LTV_REVIEWED` both say 2026-08-24.
