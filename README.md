# Truestorey — build repo

Singapore property data, tools and lead capture. Covers **HDB and private
residential**. All data from free government open-data sources under the
Singapore Open Data Licence v1.0.

## Setup

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run data                   # HDB only — works immediately, no key
npm run dev
```

For **private property** you need a free URA key first:
1. Register at https://eservice.ura.gov.sg/maps/api/reg.html
2. Put it in `.env.local` as `URA_ACCESS_KEY`
3. `npm run data:all`

The URA token expires **daily** — the ingest script mints a fresh one each run,
so a scheduled daily job is fine, but don't cache the token.

## Market data — what to run

Three new ingests. None needs a key.

```bash
npm run ingest:index    # HDB Resale Price Index — verified resource id
npm run ingest:mop      # HDB Property Information → MOP tracker (run ingest:hdb first)
npm run ingest:sora     # MAS SORA — ENDPOINT UNVERIFIED, see below
```

`npm run data` now chains hdb → index → mop → build-index.
`npm run data:all` adds ura and sora.

### SORA, and MAS outages

MAS eservices goes down for maintenance regularly. On 22 Aug 2026 it was
serving `maintenance.mas.gov.sg` instead of the API, so the ingest is built to
survive that rather than assume a clean run:

- tries several known endpoints, first one that answers wins
- **recognises the MAS maintenance page** and says so, instead of wrongly
  blaming the resource id
- on failure **leaves the existing `data/sora.json` alone** — losing good data
  because the source was briefly down is the worse outcome
- exits 0 on a MAS outage, so it cannot break `npm run data:all`
- the market page marks the rate **stale past 7 days** and shows how long ago it
  was fetched, so a figure can never quietly pass as live

```bash
npm run ingest:sora     # normal run
npm run probe:sora      # raw diagnostics, writes nothing
```

If everything fails, the market page simply omits the rates block. Nothing
breaks, and no rate is ever invented or carried forward as fresh.

### Why the MOP tracker is built on evidence

MOP runs five years from **key collection**. The HDB Property Information
dataset carries **Year Completed**, which is not the same date, and MOP differs
again for resale-flat buyers and SERS replacement flats.

So the tracker never publishes "the MOP date". It publishes:

1. `earliestMop` = year completed + 5, labelled **earliest possible**
2. `firstResaleSeen` — the first month a resale was actually filed at that
   block, cross-referenced from `data/hdb.json`

A block past its fifth year with no resale ever filed is the interesting case:
supply that has not reached the market. That is defensible because it is an
absence of evidence rather than an invented date.

## Analytics — first party, no cookies

```bash
npm run stats          # last 30 days
npm run stats -- 7     # last 7 days
npm run stats -- all   # everything
```

### Why not Google Analytics

A site whose promise is "free, no sign-up, nothing leaves your browser" cannot
open with a cookie banner. Under PDPA a consent notice is required for personal
data, and third-party analytics with cookies and full IP is squarely that.

What is collected is deliberately non-personal, so **no banner is needed**:

- **no cookies** — the session id is in `sessionStorage` and dies with the tab
- **no IP**, not even hashed. `app/api/track/route.js` deliberately does not
  read `x-forwarded-for`. Do not add it.
- **no user agent or screen fingerprint** — only mobile/tablet/desktop from width
- **no free text from the lead form.** Names, numbers and emails never arrive.
  A submit records only which page it came from and whether consent was given.

`sanitise()` in `lib/analytics.js` is the boundary: a whitelist per event type.
Anything not named there never reaches disk, so an accidental extra field cannot
leak. **Adding a field means asking whether it identifies someone** — if it
does, a consent notice becomes required and this stops being free.

Note `/api/lead` *does* record IP, correctly — that is consent evidence under
PDPA and a different thing entirely.

### The section that matters

`npm run stats` prints a funnel with drop-off, top pages, device split,
referrers, top searches — and **FAILED SEARCHES**. Every line in that list is
someone who came looking and left without it: a content gap, a naming mismatch,
or a real hole in the data. No competitor can hand him that list.

### ⚠ Before deploying

`/api/track` appends to `data/events.jsonl`. Correct locally and on a
long-running Node server, **wrong on serverless** — Vercel's filesystem is
ephemeral and events would vanish. Swap the body of `append()` for a real sink
(the CRM sheet, a database) at deploy time. Nothing else changes.

## Writing insights

Posts are markdown in `content/insights/`. Frontmatter:

```
---
title: 92,811 flats are about to become sellable
date: 2026-08-22          # a FUTURE date = draft, never listed or routed
summary: One line, used on the index and as the meta description.
towns: [TENGAH, TAMPINES] # cross-links onto those town pages
blocks: [/hdb/tengah/123-plantation-cres]
tags: [MOP, supply]
---
```

### Never type a figure into the prose

Use a shortcode and it reads the live dataset, so rebuilding the data refreshes
every post automatically. Each insert renders its own source line.

| Shortcode | Renders |
|---|---|
| `{{index}}` | HDB resale price index, latest quarter and direction |
| `{{sora}}` | Latest SORA |
| `{{mop}}` | National units reaching year five |
| `{{mop: TENGAH}}` | One town's upcoming supply |
| `{{town: tampines}}` | A town's median psf, with a link in |
| `{{block: /hdb/ang-mo-kio/100-ang-mo-kio-ave-1}}` | One block's psf range |

An unknown shortcode renders a visible `[unknown insert: …]` marker rather than
failing the build — you will see it in preview.

A post can reference a town that has **no page**, e.g. Tengah, which has 14,148
units reaching MOP and not one filed resale. The post says so explicitly instead
of dropping the link, because that absence is the story.

`lib/md.js` is a small hand-rolled renderer, deliberately not a dependency. It
is for Shervin's own writing only — do not run third-party markdown through it.

## The daily brief

```bash
npm run brief             # diff against last run, then save state
npm run brief -- --dry    # report without saving, so you can re-run
npm run brief -- --reset  # ignore previous state, rebuild the baseline
```

It tells you **what changed and what is worth writing about**. It never drafts
prose and never writes into `content/insights/` — the take is yours, which is
the whole editorial premise.

Watches: new index quarters · SORA moves over 0.10pt · MOP supply shifts ·
town median psf moves over 2% · towns with eligible-but-untraded supply.

### Why there is no news feed

The first version pulled RSS from URA, HDB, MND and MAS. Checked 22 Aug 2026:
URA 404, MND 404, HDB 403, MAS returned something that was not a feed. **Those
agencies publish HTML press-release listings, not RSS.** Scraping them would be
fragile, would break silently, and would tempt reproducing text that must never
be reproduced.

So `scripts/brief-news.js` does two better things:

1. **A tripwire on the rates.** Cooling measures are the announcements that
   actually matter here, and their whole effect is captured by
   `lib/calc/constants.js`. If a measure lands and the constants are not
   updated, every calculator is silently wrong — worse than missing a headline.
   The brief nags once `RATES_REVIEWED` is more than 30 days old.
2. **A checklist** of pages worth eyeballing, with direct links. Two minutes of
   human attention, and it never breaks.

`FEEDS` in that file is empty on purpose. If a working feed is ever confirmed,
add it there and the machinery in `brief.mjs` picks it up.

State lives in `data/.brief-state.json`. Delete it for a fresh baseline.

## Consent wording is single-sourced

`lib/consent.js` holds the consent copy **and** its version. The form renders
those exact strings; `/api/lead` logs that exact version into `Consent Basis`.
Never retype the copy anywhere else — if the two drift, the CRM records evidence
of wording nobody was ever shown, which is worse than recording nothing.

Changing any string there is a **new version**: bump `CONSENT_COPY_VERSION` in
the same edit. Existing rows keep the version they were captured under.

`lib/consent.js` also owns `normaliseMobile` (SG mobiles: 8 digits from 8 or 9,
accepts `+65` and spacing) and `consentBasis`.

## Lead endpoint guards

`/api/lead` writes to the live CRM sheet, so it is not left open:

| guard | behaviour |
|---|---|
| honeypot (`website` field) | returns 200, writes nothing — the bot learns nothing |
| per-IP throttle | 5/hour, in-memory; a speed bump, not a security boundary |
| body size | 8KB cap → 413 |
| mobile | must be a valid SG mobile → 400 |
| email | format checked; opt-in without an address is **not** recorded as consent |
| missing env | 503 and a logged lead, rather than a silent loss |
| CRM unreachable | 502, full row written to the log so the lead is recoverable |

The real duplicate guard is the mobile check in `crm-webhook.gs`.

## CRM wiring

Lead capture writes into your existing **Property CRM** sheet, Contacts tab,
using the columns already there — including `PDPA Consent`, `Consent Date`,
`Consent Basis`, `DNC Checked`.

1. Open the sheet → Extensions → Apps Script
2. Paste `scripts/crm-webhook.gs`, change `SECRET`
3. Deploy → New deployment → Web app → Execute as **me**, access **anyone**
4. Put the `/exec` URL and secret in `.env.local`

It assigns the next `C-XXXX` id continuing your sequence, and skips duplicates
by mobile number.

## Where the rates live

**`lib/calc/constants.js` is the only place any rate is defined.** Every figure
carries its source and effective date. When a rate changes, change it there and
nowhere else, then run `npm test`.

Current as at 2026-08-21:
- HDB concessionary loan **2.6%** · CPF OA accrual **2.5%** — different rates, don't conflate
- BSD tiers effective 15 Feb 2023
- ABSD effective 27 Apr 2023 (SC 2nd 20%, PR 1st 5%, foreigner 60%, entity 65%)
- **SSD: schedule changed 4 Jul 2025** — holding period 3y → 4y, rates 16/12/8/4%.
  Which schedule applies depends on the **purchase** date, not the sale date.
  Most calculators still get this wrong.

## Amenities — what is around a block

Three steps, in order. The first is slow and runs once; the other two are fast
and can be re-run freely.

```
npm run probe:amenities     # DO THIS FIRST — what each source actually returns
                            # data.gov.sg throttles; "rate limited" means re-run, not a bad id
npm run geocode             # 13,243 addresses through OneMap. ~55-60 min, resumable
npm run ingest:amenities    # the layers themselves
npm run build:nearby        # join them onto every record
```

`npm run amenities` runs the last three back to back.

### Run the probe first

The dataset ids in `scripts/amenity-sources.mjs` were written without a
connection to data.gov.sg, so treat them as unverified until the probe says
otherwise. It reports, per layer, whether the endpoint answered and which
columns came back. A wrong id is a one-line fix in that file — it is the only
place in the repo that names a dataset id, deliberately, the same way
`lib/calc/constants.js` is the only place that names a rate.

### The geocode is the gate

Nothing amenity-related works without a coordinate on each record, and neither
HDB nor URA publishes one. OneMap does, free and without a key, and it is SLA's
own address index — which matters when the input is a block number and a
street, a form no general geocoder handles well.

Every answer, including "no match", is cached in `data/geocache.json`, so:

- the run is safe to interrupt at any point and safe to restart
- a second run costs seconds, not an hour
- the amenity ingest shares the cache when it geocodes schools by postal code

**Pace is set globally, not per lane.** OneMap allows roughly 250 calls a
minute. One gate in `scripts/lib/onemap.mjs` holds the whole process to ~240,
pauses every lane on a 429, widens the gap, and creeps back down only after a
clean run. The first version backed off per request instead, which is not a
rate limit at all — three lanes each backing off politely still meant three
lanes hammering, and it was throttled inside a hundred lookups. Raising
`LANES` does not make this faster; it only gets you blocked.

Sustained throttling stops the run rather than grinding 13,000 records into
failures. Everything done is saved; re-run in ten minutes.

Flags, none of which touch the network except the default:

| flag | does |
|---|---|
| `--report` | what is on disk, by match grade |
| `--retry-weak` | another go at the poor matches |
| `--regrade` | re-score everything already placed, from the cache. Free. Use after a change to the matching rules |
| `--only=hdb` | one namespace |

### HDB and OneMap spell streets differently

HDB's dataset says `ANG MO KIO AVE 10`; OneMap says `AVENUE 10`. Compared raw,
the road test never fires — every block grades `good` rather than `exact`, and
the grade stops meaning anything, because a correct block number on the *wrong*
road scores identically. `normRoad()` expands both sides first. On the first
198 records this moved 177 of them from `good` to `exact`.

`ST` is deliberately not expanded: HDB uses it for both STREET and SAINT, and
guessing wrong would manufacture a false `exact`, which is worse than the
honest `good` those few roads get.

### A coordinate we are not sure of is worse than none

Every match is graded — `exact`, `good`, `street`, `weak`, `none` — and
`build:nearby` publishes only the first three. A block placed on the wrong
street would put a school in the wrong 1km band and quietly publish a false
answer to the exact question this feature exists to answer. So a record we
cannot place shows no amenities at all, which is visibly different from
showing the wrong ones.

### Layers

| layer | source | count | notes |
|---|---|---|---|
| rail | LTA station exits | 609 exits / 190 stations | collapsed to nearest exit per station |
| schools | MOE School Directory | 337, of which 182 take P1 | geocoded by postal code |
| hawker | NEA | 129 | |
| parks | NParks | 461 raw, ~300 kept | playgrounds filtered out — see below |
| childcare | ECDA | ~1,800 | geocoded by postal code, so the slow one |
| malls | hand-curated | 0 | no agency publishes one; optional |

Counts are from the 23 Aug 2026 ingest.

### Two judgement calls in the layer data

**Three primary schools are not coded "PRIMARY".** Catholic High, CHIJ St
Nicholas Girls' and Maris Stella High are `MIXED LEVEL (P1-S4)` in MOE's
`mainlevel_code`. They register a P1 cohort like any other primary school, and
they are among the schools people most want the 1km answer for — so matching on
the word "PRIMARY" alone silently dropped the three that matter most.
`isPrimary()` tests for `P1` as well. `MIXED LEVEL (S1-JC2)` must keep failing
the test: no P1 intake, no band.

**A playground is not a park.** The NParks layer is 461 entries, 137 of them
playgrounds (`PG`, `PLAYGROUND`) and 17 open space (`OS`). Every HDB block has a
playground two minutes away, so "nearest park: Irau Drive Playground, 80m" is
not information — it is the absence of it dressed up as a row. `exclude` in the
registry drops those, along with `INTERIM` green space, which is temporary by
definition and the last thing to put on a page about where to live.

The rail layer is station **exits**, not stations. That is better raw material
than a centroid — the exit is what you walk to — but a big interchange
contributes a dozen points, so the join collapses them to the nearest exit per
station (`dedupe: 'station'` in the registry). Without that, a Bishan block
lists Bishan three times and no second station.

The cost is that this layer carries no line code and no planned stations, so
planned lines come only from the curated file.

`data/sources/` holds the two hand-maintained files — future rail stations and
malls. Both ship empty, both are optional, and both take bare names: the
ingest geocodes them. See the README in that folder before filling either in.

### The 1km band is the point

MOE measures home-to-school in a straight line for Phase 2A/2B/2C priority, so
the 1km figure here is the rule's own measure rather than a proxy for it —
which is why it is the one place on the site where a straight-line distance is
not an approximation of anything.

It is still only priority in a ballot, never a place, and MOE measures from the
registered home address rather than from the block. The page says so, and a
school within 50m of the line is marked as sitting on it rather than asserted
to be inside. Do not remove either.

Every other distance on the page is straight-line and labelled as such. **Never
render a walking time.** We do not know what is between the two points — a
canal, an expressway, a park connector — and a walk time we cannot derive is an
estimate dressed as a fact.

### Names are shown as their source wrote them, unless the source shouts

NParks and MOE are all-caps; NEA is not. Left alone the page reads like a
database dump. `titleCase()` in `Amenities.jsx` converts a name only when it is
more than 85% uppercase, keeps acronyms (CHIJ, MRT, ITE), and leaves anything
already mixed-case exactly as received.

### Rebuilding

`build:nearby` is offline and takes seconds. Re-run it after a fresh geocode,
after editing a curated file, or after new records appear in a quarter. Re-run
`geocode` after new blocks appear — it only fetches what it has not seen.

## The design system — "Gallery"

Four rules live at the top of `app/globals.css`. They are load-bearing, not
taste, and each was chosen against a measured competitor rather than a mood.

1. **No brand colour.** Colour appears in exactly two situations: a price that
   rose or fell, and a school on the MOE 1km line. Everything else is ink on
   paper. It means the two coloured things carry real weight.
2. **No rounded corners, anywhere.** `*{border-radius:0}` enforces it. Every
   competitor rounds everything; square is free differentiation.
3. **No serif.** Stacked Homes owns cream-paper-and-serif in this market.
   Schibsted Grotesk and DM Mono, nothing else.
4. **The figure is the largest thing on the page** — larger than the heading
   above it. Someone arriving from Google wants a number, not a story.

Measured off the live sites on 23 Aug 2026 rather than remembered:

| | paper | headline | accent | corners |
|---|---|---|---|---|
| Stacked Homes | `#F7F1E6` cream | Gascogne **serif** | orange `#FC9047` | — |
| TRM Intel | `#F4F3EF` warm | **Inter** | navy + gold | 6–14px |
| Truestorey | `#FDFDFC` **cool** | Schibsted **sans** | **none** | **0** |

Reference mockups live in `design/`.

### Numerals

`body` sets `proportional-nums`; only `.mono` sets `tabular-nums`. Schibsted's
tabular comma takes a full digit slot, so "S$1,420,000" sets as
"S$1 , 420 , 000". Tabular alignment is worth having only where figures stack
in a column and the face handles it — which here means DM Mono.

### Names

`lib/name.js` decides capitalisation, word by word rather than by a ratio over
the whole string. HDB, MOE and NParks shout; NEA does not. A whole-string
threshold gets "Blk 275A BISHAN ST 24" wrong, because the lowercase "lk" sinks
it under any sensible cutoff. Shared by the amenity list, the record pages and
the share cards, so a block cannot be titled one way on the page and another
way in the image someone forwards.

## Editorial — two kinds, one feed

- **note** — a short dated entry. What changed, two or three sentences.
- **deep** — the weekly long piece.

`kind` in frontmatter, inferred at 450 words when absent. They share one
chronological feed rather than living in separate sections, because a note
published after a deep dive may well supersede it — splitting them would bury
the correction under the thing it corrects. The index filters; it does not
pretend they are two publications.

**A post with no title is a draft, whatever its date says.** `npm run note`
scaffolds with the title deliberately blank, so this is what stops an empty
scaffold publishing itself.

```
npm run note              # scaffold today's short, prefilled with what moved
npm run note -- --deep    # scaffold a long piece
npm run note -- --force   # overwrite today's file
```

The scaffolder reads the same datasets `npm run brief` does and writes the
facts in as comments. It never writes prose — not a sentence, not a headline.
A daily cadence does not fail because writing two sentences is hard; it fails
because opening an empty file and remembering what changed is friction. The
machine does the remembering. The writing is his, which is the entire point.

## Share cards

`/og?t=…&v=…&u=…&s=…&k=…` draws an SVG card carrying the figure, its source,
and his name and CEA registration number. Built by `lib/og.js` from the same
record the page renders, so the two cannot disagree.

Drawn as SVG rather than through `@vercel/og`: this repo has three
dependencies and is better for it, the design is already hairlines and type
with no photography, and SVG needs no WASM font rasteriser.

⚠ WhatsApp and iMessage will not preview an SVG. Before go-live this needs a
PNG path — a small `sharp` render at build time, or `@vercel/og`. Until then
the cards work on the site and in the markup but not in a forwarded chat,
which is most of the point of having them.

## Hard rules — do not relax

1. **No REALIS data, ever.** CEA PG 02-11 s6 restricts it to personal research,
   not commercial use. Only data.gov.sg and the public URA Data Service.
2. **Never publish a single valuation number.** Ranges with the comparable
   transactions shown. A point estimate is a claim you cannot substantiate.
3. **Consent is per-channel and optional.** Bundled consent is void under
   PDPA s14(2). Log the wording version, timestamp and IP.
4. **An inbound message is not consent.** Only a ticked box is.
5. **`DNC Checked` is never auto-filled.** It reflects a real check or nothing.
6. **Every derived figure renders its source and period beside it** (PG 02-11 s3.1).
7. **No "undervalued", "best deal", "expert", "specialist".** State disclosed
   arithmetic against a cited source instead.
8. Compliance footer on **every** page, from the `NEXT_PUBLIC_*` env vars.
9. **Never reproduce news.** Take in the data, publish it in Shervin's voice.
10. **Never render a walking time or a walking distance.** Every distance on
    the site is straight-line and says so. What is between two points — a
    canal, an expressway, a park connector — is not in any dataset we hold.
11. **Never imply a school place.** The MOE 1km band is priority in a ballot,
    measured from a registered home address, not from the block. The caveat
    under the band list is load-bearing.
12. **A coordinate we are not confident in is not published.** `build:nearby`
    drops anything below a `street`-grade match rather than showing amenities
    against a guess. A blank section is the honest state.

## Layout

```
lib/calc/       constants · stampDuty · proceeds · affordability · timeline
lib/data/       query helpers — catalogue · search · record
scripts/        ingest-hdb · ingest-ura · build-index · crm-webhook.gs
app/api/search/ typeahead over blocks and projects
app/api/record/ one block or one project, with its comparables
app/api/lead/   capture endpoint → CRM
test/           rate and rule tests — run these after any rate change
```

### Data files

`build-index.mjs` splits its output so no request ever parses more than it needs:

| file | size | loaded |
|---|---|---|
| `data/index.json` | ~300 KB | every request — town/district aggregates for the heat grid |
| `data/search.json` | ~1.6 MB | first search only — the typeahead manifest |
| `data/towns.json` | ~1.8 MB | town index pages |
| `data/projects.json` | ~510 KB | condo / landed index pages |
| `data/urls.json` | ~620 KB | sitemap and prerendering |
| `data/records/**.json` | 85 shards, ~220 KB median | one shard per page request |

`data/records.json` is a **dead file kept empty on purpose** — it was the old
single 32 MB store. Delete it whenever; nothing reads it.

All of these are read server-side and cached per file in module scope. None is
ever shipped to the browser whole.

### Why the records are sharded

A single 32 MB `records.json` meant every cold start parsed the whole country
to render one block. Shards are keyed so the right file is **derivable from the
URL** — no lookup table, one file read:

- `/hdb/ang-mo-kio/100-…` → `data/records/hdb/ang-mo-kio.json`
- `/condo/the-sail-marina-bay` → `data/records/condo/t.json` (first slug char)

Measured: 11–20 ms to resolve a record, against ~1.5 s to parse the old store.

### URLs are permanent

`lib/slug.js` generates every public URL and every sitemap entry. **Changing how
`slugify` works breaks every indexed page.** If it ever has to change, ship a
redirect map in the same commit.

| route | what it is |
|---|---|
| `/` | search, then browse by area |
| `/hdb` | all 26 towns |
| `/hdb/[town]` | every block in that town |
| `/hdb/[town]/[block]` | one block |
| `/condo`, `/landed` | every project / street, grouped by district |
| `/condo/[slug]`, `/landed/[slug]` | one project / street |

The 300 busiest HDB blocks and 200 busiest projects are prerendered at build;
`dynamicParams` renders the tail on first request and caches it (measured
114 ms cold, 3.5 ms after). Crawl depth to any block is three clicks from home.

### Granularity rule

**Private is addressable by project, HDB by block.** District and town
aggregates exist for the heat grid and are labelled *Area median* — they are
context, never an answer about someone's home. A block with 3-, 4- and 5-room
flats has no single meaningful median price, so the record view can be
narrowed to one flat type; when it is, the trend chart and the YoY figure are
hidden, because both are computed across all types.

## Status

- [x] Calculation core, both property types, 37 tests passing
- [x] HDB ingest (no key needed)
- [x] URA private ingest (needs key)
- [x] CRM capture endpoint + Apps Script
- [x] UI: homepage flow, HDB + private, waterfall
- [x] Search: 9,477 HDB blocks + 3,766 private projects/streets, typeahead
- [x] Record view: psf range, comparables, per-type filter, source + period
- [x] Real URLs — every block and project at its own address, sharded record store
- [x] Town / project index pages, sitemap, robots.txt, per-page metadata
- [x] Huttons KEO written approval — **email sent 22 Aug 2026, awaiting reply**
- [x] Lead capture form — context-aware, unbundled consent, endpoint hardened
- [x] Market page — HDB resale price index + SORA, `/market`
- [x] MOP tracker — `/mop`, by town and year, evidence-backed
- [x] Ran index + MOP ingests — 146 quarters, 10,796 blocks, 693 reaching year five
- [ ] Re-run `npm run ingest:sora` once MAS is back up
- [x] Insights content system — markdown + live-data shortcodes, cross-linked to towns and blocks
- [x] Daily brief generator — `npm run brief`
- [x] Proceeds inputs persist across blocks
- [x] RSS replaced with a rates tripwire — the agencies do not publish feeds
- [x] Amenities pipeline built — geocoder, source registry, 6 layers, join, UI
- [ ] **Run `npm run probe:amenities`** and fix any dataset id it flags
- [ ] **Run `npm run geocode`** — 40-70 min, once, resumable
- [ ] Then `npm run ingest:amenities && npm run build:nearby`
- [ ] Fill `data/sources/rail-future.json` from LTA's own announcements
      (ships empty — an opening year with nothing behind it breaks rule 6)
- [x] Design pass — "Gallery" tokens, global nav, wordmark, every component
- [x] Homepage rebuilt — one entry choice, salesy headline gone
- [x] Search on every index page
- [x] Editorial — notes + deep dives, one feed, `npm run note` scaffolder
- [x] Share cards with CEA watermark (SVG; needs a PNG path before go-live)
- [ ] **PNG share cards** — WhatsApp will not preview SVG
- [ ] Assistant bot — Thursday. See claude/next-build-plan.md
- [x] Analytics — first-party, cookie-free, `npm run stats`
- [ ] Swap the analytics sink off the local file before deploying
- [ ] Domain registration — then set `NEXT_PUBLIC_SITE_URL`, which the sitemap
      and every canonical tag depend on
- [ ] DNC check on the 219 existing CRM contacts
