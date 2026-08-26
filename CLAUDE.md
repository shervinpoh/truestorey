# Truestorey

Editorial-first Singapore property site. Every lookup and calculator is free
with no sign-up — that is the whole strategic position against the paid
competitor, not a launch offer.

Shervin Poh · CEA Reg. No. R066925H · Huttons Asia Pte Ltd. **Everything
published here goes out under a licensed agent's registration number.** That is
the reason for most of the rules below.

---

**`NEXT.md` is the ordered backlog.** Start there for what to do; this file is
what to know.

---

## Rules that must not be relaxed

These are not style preferences. Several are regulatory, and the rest are the
reason the site is worth trusting.

1. **No REALIS data, ever.** CEA PG 02-11 s6 — licensed for personal research,
   not commercial use.
2. **Never publish a single valuation number.** Ranges, with the comparables
   shown. A percentile is fine; a verdict on price is not.
3. **Consent is per-channel and optional.** PDPA s14(2). Bundled consent is
   void. As of 24 Aug 2026 the site collects **email consent only** — no phone,
   no WhatsApp.
4. **An inbound message is not consent.** Only an explicit ticked box is.
5. **`DNC Checked` is never auto-filled.** It reflects a real check or nothing.
6. **Every derived figure renders its source and period.** CEA PG 02-11 s3.1
   requires market claims to be substantiated.
7. **No "undervalued", "best deal", "expert", "specialist".**
8. **Compliance footer on every page.**
9. **Never reproduce news.** Index primary sources and link to them. Nothing
   from Straits Times, Business Times, EdgeProp or Stacked.
10. **Never render a walking time or distance.** Straight-line, labelled.
11. **Never imply a school place.** The 1km band is ballot priority.
12. **A coordinate below street-grade confidence is not published.**
13. **Never draw geometry the data does not contain.** No rail lines from a
    station list, no boundaries from a point cloud. If it would come from
    memory, it does not get drawn.

### Two rules about models specifically

- **A language model never assigns a number.** Blindspot's score comes from a
  published formula in `lib/blindspot/rubric.js`. Models write prose around
  figures that are already fixed. If a feature needs a model to produce a
  figure, that is a sign the feature is wrong, not that the rule is.
- **A check that cannot run scores nothing and says so.** It is never treated
  as zero risk. Absence of evidence must never read as evidence of safety.

---

## Architecture

**Build-time, not runtime.** Every figure is derived from JSON in `data/` by
scripts that run before deploy. Three npm dependencies — `next`, `react`,
`react-dom` — and that is deliberate. No Tailwind, no TypeScript, no ORM, no
chart library, no map library, no AI SDK.

When something needs a network call at runtime it goes through plain `fetch`
(see `lib/ai/providers.js` and `lib/supabase/rest.js`). Adding a dependency
should feel like a decision, not a reflex.

### Styling

`app/globals.css`, hand-written, with four rules enforced at the top:

1. **One accent, used loudly.** Teal `#00C2CC`. Green and red are reserved for
   a price that moved and a school on the 1km line — the accent must never
   encroach on those.
2. **No rounded corners, anywhere.** Enforced by a global reset, not trusted.
3. **No serif.** Schibsted Grotesk + DM Mono. Stacked Homes owns
   cream-and-serif in this market.
4. **The figure is the largest thing on the page.**

Do not introduce Tailwind. Its utilities would let rounded corners back past
the reset, and rule 2 is free differentiation from every competitor.

### Motion

`components/Motion.jsx`. Headline figures count up once on first sight, bars
grow. Body text and tables never move. `prefers-reduced-motion` is honoured
before anything else runs, and the real value renders before the animation so
SSR and no-JS readers get the number.

---

## Commands

```
npm run dev            localhost:3000
npm test               121 tests, node:test, no framework
npm run build          data build + next build

npm run due            what data is stale
npm run sync           refresh only what is past due

npm run geocode        OneMap. Includes the MOP register — see the note below.
npm run ingest:hdb     HDB resales via data.gov.sg
npm run ingest:ura     URA private transactions
npm run ingest:rental  URA rental contracts
npm run ingest:boundaries   URA Master Plan planning areas
npm run build:map      data/map.json
npm run build:storey   data/storey.json  (Tower View)
npm run build:yield    data/yield.json
npm run build:guides   content/guides/ from the deck research base
npm run note           scaffold a dated editorial note
```

---

## Things that have already gone wrong here

Read these before touching the areas they describe.

**The geocoder used to miss the blocks that mattered.** It walked
`data/records/`, which holds blocks that have already sold — and a block
reaching MOP for the *first* time never has. So 694 of 749 upcoming-MOP blocks
had no coordinate and the supply check reported near-zero risk everywhere.
Fixed 24 Aug; `mopCoverage()` in `lib/blindspot/measure.js` now measures this
and falls back to town level if it ever regresses.

**The map ingest failed silently on a markup difference.** URA ships attributes
as an HTML table inside a GeoJSON property, in two different markups. The
parser handled one. Every feature came back nameless and the ingest reported
"the source schema may have changed", which is not a diagnosis. Ingests should
now save their raw download and print what they actually received on failure.

**The sanitiser deleted prose.** A stray `<` in body text made it eat
everything to the next `>`. Fixed to escape and keep. `lib/sanitize.js` is the
only thing between a leaked webhook secret and stored XSS on every page —
treat a failure in `test/sanitize.test.js` as a security regression.

**Rates lived in two places and disagreed.** `lib/calc/constants.js` said the
stress rate was 4.2%; the deck research base said 4.0%. `test/guides.test.js`
now parses the published guides and asserts every rate against the constants,
so a change in one place and not the other goes red before it ships.

**`device_bash` over the Cowork bridge runs Linux with no network.** It cannot
run `next dev`, `next build` or any ingest. Plain node scripts, `npm test` and
python-pptx all work. This does not apply to Claude Code running locally.

**The site has never been through a production build.** Everything was written
and verified in `npm run dev` because the bridge could not run one. `npx next
build` is the first thing to do. Related: `next.config.mjs` sets
`outputFileTracingIncludes` because the tracer cannot see
`path.join(process.cwd(), 'data', f)` with a runtime `f` — without it the data
files are absent from the serverless bundle and every Blindspot lookup fails in
production while passing in dev. Any new API route that reads `data/` goes in
that map.

---

## Layout

```
app/            routes. Server components by default; 'use client' only where
                there is real interactivity.
components/     shared UI. fmt.js has f() for money and num() for counts —
                f() prefixes S$, so it is wrong on "5,762 sales".
lib/
  calc/         constants · stampDuty · affordability · plan · proceeds ·
                timeline · amortise. Every rate carries its source and review
                date. constants.js is the single source of truth.
  blindspot/    rubric (the published formula) · measure · analyse
  data/query.js the read layer over data/
  ai/providers  Perplexity, Claude, Gemini over plain fetch
  supabase/rest PostgREST over plain fetch
  sanitize.js   allowlist HTML sanitiser
  geojson.js    attribute parsing, Douglas–Peucker, shoelace centroid
data/           build-time JSON, versioned with the repo
scripts/        ingest + build. Each explains its refresh interval.
content/
  insights/     hand-written notes (markdown)
  guides/       GENERATED — edit the build pack, not these
  source/       the deck research base
test/           node:test. 121 passing.
```

---

## Conventions

- **Comment the decision, not the mechanics.** Explain why a threshold is what
  it is, what was tried and rejected, and what breaks if someone changes it.
  The existing files are the reference for tone.
- **A test should describe a failure someone could actually cause.** Several
  tests here exist because the bug they catch already happened once.
- **Degrade, never break.** A missing dataset, a missing API key or a database
  outage disables one feature and says so. It never 500s a page.
- **Say what could not be measured.** Silent truncation reads as completeness.
