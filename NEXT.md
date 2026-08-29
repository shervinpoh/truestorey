# What to build next

Rewritten 29 Aug 2026, after the site went live. `CLAUDE.md` has the rules and
the architecture — read that first, it is not optional. This file is only the
ordered backlog.

**State:** live at https://truestorey.vercel.app · 132 tests · three npm
dependencies · Blindspot scoring out of 10 with all four checks running · data
refreshing itself daily.

---

## What changed on 28–29 Aug, so you do not redo it

The previous version of this file opened with "run `npx next build`, it has
never been done". That is finished, along with most of what followed it. In
order:

- **Production build, deploy, custom Vercel team.** Live. `vercel.json` pins the
  build command to `next build` — the default `npm run build` runs three live
  data.gov.sg ingests first, so a deploy would fail whenever their API is slow.
- **Serverless bundle 155MB → 89MB.** `outputFileTracingExcludes` in
  `next.config.mjs`. Raw ingest downloads must be added there as well as to
  `.gitignore` — the tracer reads the disk, not the index. That has been
  forgotten twice.
- **`/api/track` moved to Supabase.** The local file was silently losing every
  event on serverless. `scripts/supabase-events.sql` creates the table; RLS is
  on with no policies, so only the service role can touch it.
- **`Proceeds.jsx` reconciled with `lib/calc/proceeds.js`.** It had its own copy
  of the maths, floored at zero, telling a seller in negative equity they walk
  away with nothing rather than owing S$197k.
- **Blindspot is out of 10.** `ingest:zoning` and `ingest:planning` written;
  GLS transcribed by hand. Rubric v2 moved the `view` check from what the
  Master Plan permits to what URA has actually approved.
- **Daily data refresh.** `.github/workflows/refresh-data.yml` runs `npm run
  sync`, commits `data/`, and the commit triggers the deploy.
- **Keys live.** Perplexity, Anthropic, Gemini, Supabase, OneMap — all verified
  against production, not just accepted. `npm run preflight` re-checks them.

Git log is the detailed record. Every commit says what broke and how it was
found.

---

## 0 · Waiting on something, not blocked

**SORA is missing.** MAS has been under maintenance since 28 Aug;
`eservices.mas.gov.sg` and `www.mas.gov.sg` both serve a maintenance page.
`/market` omits the rates block until it returns and the scheduled workflow
will collect it on the first morning it does. Nothing to do.

**19 of 27 GLS sites have no unit yield.** URA publishes yields in each site's
own launch press release, not on the schedule page, so a site that has not
launched has no figure. Add them as launches happen — `units` plus a
`unitsSource` URL in `data/sources/gls-programme.json`, then `npm run
ingest:gls`. Never estimate one from site area and plot ratio.

**Three GLS sites will not geocode** — Berlayar Drive, Berlayar Close, Marina
Gardens Crescent. Confirmed absent from OneMap with and without a token; they
are new roads. Only a properly sourced coordinate should go in by hand.

**The OneMap token expires every three days.** `forever: false` in the JWT.
Unauthenticated search still works today, so expiry degrades quietly rather
than breaking — but the geocoder warns when a token is set and refused. Check
whether OneMap offers a long-lived token.

---

## 1 · The TRM gaps still open

From the teardown, in its order. Four remain, all buildable from data held.

| | Tool | Notes |
|---|---|---|
| 5 | **Price history and realised returns** | Repeat sales of the same unit. `data/private.json` has project, area, floorRange and contractDate — enough to pair them. **See the note on PropNex below before building this.** |
| 6 | **Quantum by year** | What buyers actually paid, by region, size and year. A pivot over data already held. |
| 7 | **Compare** | Two blocks side by side. Every field already renders on a record page — a layout, not a feature. |
| 8 | **URA Private Residential Property Index** | Only HDB's index is published today, so anyone comparing a flat to a condo has to leave the site. |

Refuse regardless, unchanged: Valuation, Project Scorecard, New Projects/BUC,
Commercial, Watchlist.

### What PropNex's Investment Suite does, and why most of it is off limits

Reviewed 28 Aug. Their *Profitability* tab is gap 5, already built: matched
repeat sales with purchase price, sale price and profit per transaction. Their
*Tower View* is a stack plan showing every unit by number with the current
owner's purchase price, an estimated valuation and estimated profit.

Its footer reads **"for your personal use only"**. Unit-number-level purchase
prices are REALIS-shaped, which rule 1 forbids outright, and a single Est. Val
per unit breaks rule 2 independently. Useful to look at as a licensed agent.
Not republishable here.

So gap 5 is worth building only in a form that does NOT identify a unit —
matched on project, size band and date, reported as a range. If it needs a unit
number to work, it is the wrong feature.

**What was worth taking, and was taken:** their Planning Decisions tab, which
led to the URA Data Service `Planning_Decision` endpoint now behind the `view`
check. Public data, no licence problem, better than the zoning it replaced.

---

## 2 · Known problems

- **Share cards are SVG.** WhatsApp will not preview SVG, which is most of the
  point of having them. Needs a PNG path — `sharp` at build time or
  `@vercel/og`.
- **`data/sources/rail-future.json` is empty.** Future MRT needs LTA's own
  announcements. Do not populate opening years from memory (rule 13).
- **The deck scripts hardcode rates.** `build-scripts/deck1–4.py` should import
  from `lib/calc/constants.js`. `test/guides.test.js` already catches drift
  between the guides and the calculators; the decks are the gap. *Shervin is
  amending these, 29 Aug.*
- **The deck palette does not match the site.** Dark teal-green, gold, cream,
  DM Serif against the site's white and teal. *Same, in progress.*
- **`NEXT_PUBLIC_SITE_URL` is the Vercel URL.** Correct today by luck. It drives
  `robots.txt` and the sitemap, so it must change when a real domain is
  attached.

---

## 3 · Design — the largest thing outstanding

The interaction layer is done: a state layer with two timing tokens across
every interactive surface, a 1px press, a slider thumb that grows, and the
count-up fixed twice. The **visual** work never happened, because a correctness
bug surfaced every time it was started.

There are none left on the list, so this is next.

- **`/plan` first.** Highest traffic, weakest layout — twelve identical number
  inputs stacked in a column. It is the site's most-used calculator and it
  looks like a tax form.
- **Record pages** next, then the homepage.
- Rules 1–4 in `app/globals.css` are not up for negotiation, and they are the
  differentiation: one accent used loudly, no rounded corners anywhere, no
  serif, the figure larger than the heading above it. `tabular-nums` is
  deliberately rejected — Schibsted's tabular comma sets "S$1 , 420 , 000".

---

## 4 · Editorial

The pipeline works end to end and has published one article. `npm run note`
scaffolds a dated entry prefilled with what moved in the data.

Make.com is not set up. It needs one HTTP module posting to
`/api/webhook/article` with the Bearer secret from `.env.local`; the payload
shape is in `SETUP.md` §4c. The endpoint is verified against production.
Nothing depends on it — articles can be posted by hand.

`/studio` is where volume arrives once it is running. The approval step is the
feature; do not add a way to skip it.

---

## Blocked on other people

- Domain not registered
- DNC check on 219 existing CRM contacts — `DNC Checked` is never auto-filled

Huttons KEO approval came through on 28 Aug.

---

## How to work in this repo

- `npm test` before and after. 132 passing. A red test is a real finding.
- `npm run preflight` before assuming a key works. It makes a real call to each
  provider and only a 200 counts — it was written after a dead Gemini model
  reported "Everything wired" over a feature that was 404ing on every request.
- Every new derivation gets a test that describes a failure someone could
  actually cause. Several exist because the bug already happened.
- Degrade, never break: a missing key or dataset disables one feature and says
  so on the page.
- Say what could not be measured. Silent truncation reads as completeness.
- If a feature needs a model to produce a *number*, the feature is wrong.
