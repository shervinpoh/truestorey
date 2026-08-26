# What to build next

Written 27 Aug 2026 at the end of a Cowork session, for whoever picks this up
in Claude Code. `CLAUDE.md` has the rules and the architecture — read that
first, it is not optional. This file is only the ordered backlog.

**State:** 36 routes, 121 tests passing, three npm dependencies. Everything
below is additive; nothing here is a rescue.

---

## 0 · Finish the wiring (do this first, it is nearly done)

Shervin has created the Supabase project and `.env.local` has the block for it.

1. **Check the table exists.** `scripts/supabase-schema.sql` may or may not have
   been run in the Supabase SQL editor yet. Ask him, or just try `/studio` — it
   renders a clear message when Supabase is unreachable.
2. **`npx next build`.** *This has never been run.* Every route below was
   written and verified in dev only, because the Cowork bridge could not run a
   build. Expect to fix something. Do this before anything else is added.
3. **Test the webhook locally** before pointing Make.com at it:

   ```bash
   curl -X POST http://localhost:3000/api/webhook/article \
     -H "Authorization: Bearer $ARTICLE_WEBHOOK_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","category":"note","content_html":"<p>'"$(head -c 300 </dev/urandom | base64)"'</p>","source_urls":["https://data.gov.sg"]}'
   ```

   Expect `201` with `status: "draft"`, then the piece in `/studio`.
4. **Then** wire the Make.com scenario. Payload shape is in `SETUP.md`.

### A deploy trap already fixed, worth understanding

`next.config.mjs` now sets `outputFileTracingIncludes`. Next works out a
serverless function's files by following imports statically, and the data layer
reads `path.join(process.cwd(), 'data', f)` with a runtime `f` — invisible to
the tracer. Without those globs `/api/ai/blindspot` works perfectly in dev and
returns "No record at that address" for every input in production. If a new API
route reads from `data/`, add it to that map.

---

## 1 · The two Blindspot checks that do not run

Blindspot scores out of 6 instead of 10 and says so on the page. Two ingests
are missing, and both were deliberately not written because the source needed
deciding and an ingest against an endpoint nobody could test is how the
boundaries ingest failed the first time.

**`npm run ingest:gls` → `data/gls.json`**
Shape `measure.js` already expects: `{ source, accessedAt, sites: [{ name, lat, lon, units, status, launchDate }] }`.
URA publishes the GLS programme. Confirmed sites and their indicative unit
yields are what matter; a site with no coordinate is useless here, so geocode
via `scripts/lib/onemap.mjs` the way the amenity ingest does.

**`npm run ingest:zoning` → `data/zoning.json`**
Shape: `{ source, accessedAt, parcels: [{ lat, lon, plotRatio, landUse, undeveloped }] }`.
URA Master Plan land use and plot ratio, on data.gov.sg alongside the boundary
layer already ingested. `undeveloped` is the hard part — decide honestly how it
is determined and write the reasoning in the script, or drop the field and
change the check to "what the zoning permits nearby" rather than "what could be
built on empty land".

Follow `scripts/ingest-boundaries.mjs`: save the raw download, and print what
the payload actually contained when parsing fails.

---

## 2 · The TRM gaps still open

From the teardown, in its order. All nine were buildable from data already
held; five remain.

| | Tool | Notes |
|---|---|---|
| 5 | **Price history and realised returns** | Match repeat sales of the same unit. `data/private.json` has project, area, floorRange and contractDate — enough to pair them. TRM sells this as three separate TRM-tier products off one join. |
| 6 | **Quantum by year** | What buyers actually paid, by region, size and year. A pivot over data already held. |
| 7 | **Compare** | Two blocks side by side. Every field already renders on a record page — a layout, not a feature. |
| 8 | **URA Private Residential Property Index** | Only HDB's index is published today, so anyone comparing a flat to a condo has to leave the site. |
| 9 | **Supply and demand 2026–2030** | `data/mop.json` knows 92,811 units reach year five. Add GLS (see above) and completions for a forward view. |

Refuse regardless, unchanged: Valuation, Project Scorecard, New Projects/BUC,
Commercial, Watchlist.

---

## 3 · Known problems

- **`/api/track` writes to a local file.** Breaks on serverless and gates
  go-live. Supabase now exists — an `events` table is the obvious fix, and it
  is the last thing standing between the site and a deploy.
- **`Proceeds.jsx` reimplements `lib/calc/proceeds.js` inline.** Two versions
  of the sale-proceeds maths, one tested. Reconcile before go-live.
- **Share cards are SVG.** WhatsApp will not preview SVG, which is most of the
  point of having them. Needs a PNG path — `sharp` at build time or
  `@vercel/og`.
- **`data/sources/rail-future.json` is empty.** Future MRT needs LTA's own
  announcements. Do not populate opening years from memory (rule 13).
- **The deck scripts hardcode rates.** `build-scripts/deck1–4.py` should import
  from `lib/calc/constants.js` so the decks cannot drift from the site.
  `test/guides.test.js` already catches drift between the guides and the
  calculators; the decks are the remaining gap.
- **The deck palette does not match the site.** Dark teal-green, gold, cream,
  DM Serif against the site's white and teal. A client who sees both sees two
  companies. Four lines in `deckkit.py`.

---

## 4 · Worth taking from haio.sg

See `claude/haio-teardown.md` in the Claude project for the full read.

- **Promote provenance.** Their dated stamp sits at full size beside the
  heading; ours is fine print at the bottom. Same information, a tenth of the
  credibility. Make it a chip.
- **Progress as a bar.** MOP cohort progress and Tower View sample coverage are
  both numbers today and would land harder as bars.
- **Affordability that ends somewhere.** `/plan` computes the most a buyer's
  funds support and then stops. Feed that into `/hdb` and `/condo` as a filter.

---

## 5 · Editorial

Two posts against finished machinery. Deferred by Shervin's own call — content
gets slotted in later rather than blocking the tools. `npm run note` scaffolds
a dated entry prefilled with what moved in the data.

Once the Make.com pipeline is running, `/studio` is where volume arrives. The
approval step is the feature; do not add a way to skip it.

---

## Blocked on other people

- Huttons KEO approval — sent 22 Aug, gates go-live
- Domain not registered
- DNC check on 219 existing CRM contacts

---

## How to work in this repo

- `npm test` before and after. 121 passing. A red test is a real finding.
- Every new derivation gets a test that describes a failure someone could
  actually cause. Several existing tests exist because the bug already happened.
- Degrade, never break: a missing key or dataset disables one feature and says
  so on the page.
- Say what could not be measured. Silent truncation reads as completeness.
- If a feature needs a model to produce a *number*, the feature is wrong.
