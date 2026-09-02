# What to build next

Rewritten 1 Sep 2026, at the handover to Codex. `CLAUDE.md` has the rules and
the architecture — **read that first, it is not optional.** This file is only
the ordered backlog.

**State:** live at https://truestorey.vercel.app · **295 tests** · three npm
dependencies · Blindspot scoring out of 10 with all four checks running · data
refreshing itself daily via `.github/workflows/refresh-data.yml`.

**Unpushed on master:** `b390c47` (Blindspot price fix, committed out of the
dirty tree), `f851b4d` (navigation and comprehension), `89daeb8` (the personal
layer). A push to master IS a deploy — see the top of `AGENTS.md`.

---

## Read this before you touch the design

An earlier version of this file told you to keep "no rounded corners anywhere",
"the figure larger than the heading", Schibsted + DM Mono, and bright teal
`#00C2CC`. **Those four rules were retired on purpose on 29 Aug 2026** and
`CLAUDE.md` now says so. Square shapes on pure white read as a spreadsheet
rather than as authority.

The live system is warm ground (`--paper #F6F5F2`), two teals (`--acc #164F52`
is interface, `--acc-lit #58BCC3` is data that is live or selected and nothing
else), radius as a decision (`--r1 3px` control, `--r2 8px` panel), Archivo
semi-condensed headings, Source Sans 3 body, IBM Plex Mono figures. Read rules
1–5 under "Styling" in `CLAUDE.md`. Do not reinstate the old ones by reflex —
that instruction is why this warning is at the top of the file.

---

## 0 · Blocked on Shervin, not on you

Nothing below can be finished by an agent. Ordered by what unblocks the most.

1. **A domain.** Drives three things: a Resend account with a verified sending
   domain, `NEXT_PUBLIC_SITE_URL` (which today is the Vercel URL and is correct
   only by luck — it drives `robots.txt` and the sitemap), and the OG cards.
2. **`RESEND_API_KEY` and `DIGEST_FROM`** in Vercel and `.env.local`. These are
   the only two environment variables referenced in code and absent from
   `.env.local`. Until they exist, `lib/watch.js` refuses every subscription
   and the form does not render — deliberately. See "A consent tick promised
   something nothing delivered" in `CLAUDE.md`.
3. **`NEXT_PUBLIC_WA_CHANNEL` in Vercel.** Set locally, not in production.
4. **DNC check on 219 existing CRM contacts.** `DNC Checked` is never
   auto-filled — rule 5.
5. **A decision: does a phone number ever get used?** Consent has been
   email-only since 24 Aug 2026 and the mobile field was deleted rather than
   reworded. Reintroducing one is a policy decision, not a UI one.
6. **19 of 27 GLS sites need unit yields.** URA publishes them in each site's
   own launch press release. Add `units` plus a `unitsSource` URL to
   `data/sources/gls-programme.json`, then `npm run ingest:gls`. **Never
   estimate one from site area and plot ratio.**
7. **Three GLS sites will not geocode** — Berlayar Drive, Berlayar Close,
   Marina Gardens Crescent. Confirmed absent from OneMap with and without a
   token; they are new roads. Only a properly sourced coordinate goes in.
8. **A URA URL for district locality names**, so the map can label a district
   consistently instead of mixing "East Coast" with "District 15".
9. **Make.com HTTP module** posting to `/api/webhook/article` with the Bearer
   secret from `.env.local`. Payload shape is in `SETUP.md` §4c. The endpoint is
   verified against production; nothing depends on it.
10. **Photos.** Ten are in `photos-in/` as of 2 Sep and `photos.json` is drafted
    — every `alt` is written from the actual frame. Three things are needed
    before `npm run photos` will publish any of them:
    - **`place` is missing on nine of ten, on purpose.** Where a photograph was
      taken cannot be read off the picture, and the ingest refuses an entry
      without it rather than captioning a guess. Only `IMG_3193` has one: the
      name is on the entrance signage in frame, and it is Perfect Ten, which
      is a record here with 239 filed transactions.
    - **Three files are stored sideways** — `IMG_1679`, `IMG_1780`, `IMG_3193`.
      There is no orientation tag to correct them (`sips -g orientation`
      returns nil), so they will publish rotated. Rotate the originals, or say
      the word and `ingest-photos.mjs` can take a `rotate` field.
    - **Three are off-brief**: a showflat scale model, a condominium pool deck,
      and office towers with a Christmas tree. Those are the visual language of
      the marketing portals this site defines itself against, and the scale
      model is a developer's property besides. The three strongest are the HDB
      precinct with the playgrounds, the estate over the expressway, and the
      forest edge under a storm.
11. **Still no portrait.** `/about` and the homepage bridge are both built to
    take one and both render without rather than showing a placeholder face.
    Nothing in the current ten is a photograph of a person.
12. **Approve or replace the first-person copy.** `/about` carries a
    PLACEHOLDER ORIGIN, marked as such in the source. It says why the SITE
    exists and asserts nothing about your history, because that is the only
    version safe to write on your behalf.

---

## 1 · Waiting on someone else's server

**SORA is missing.** MAS has been under maintenance since 28 Aug;
`eservices.mas.gov.sg` and `www.mas.gov.sg` both served a maintenance page when
last checked. `ingest:sora` exits 0 on purpose in that case, and `sync`
re-checks file age afterwards so it can no longer report a refresh that did not
happen. `/market` omits the rates block until it returns. Nothing to do.

**The OneMap token expires every three days** (`forever: false` in the JWT).
Unauthenticated search still works, so expiry degrades quietly. Worth checking
whether OneMap offers a long-lived token.

---

## 2 · What was built 29 Aug – 1 Sep, so you do not redo it

Git log is the detailed record; every commit says what broke and how it was
found. In brief:

- **The 1 Sep running design/flow pass** — `/plan`, `/cost` and `/progressive`
  now read as numbered decisions in a fixed two-column grid rather than an
  auto-fit tax form; the same controls fall to one column only below 360px.
  The mobile result strip now gives focused controls enough scroll clearance.
- **Record navigation exists in the first frame.** It used to discover anchors
  after hydration, insert 43px above the figures and hide its last links beyond
  an invisible horizontal edge. The server-known section list renders at once,
  with real previous/next controls on an overflowing phone row.
- **The homepage is not a second `/tools`.** Six common buyer/owner decisions
  are featured in a complete 3×2 grid; “All 11 tools” remains explicit and all
  eleven still live in the menu, footer, sitemap and index.
- **A record carries its identity into Blindspot.** The buyer supplies the
  actual ask and unit area; the record median is deliberately not passed as an
  asking price. There is a route back to the property. Commits `42a08af`,
  `b5fde4f`, `69536b1`, `97034ed`.
- **Blindspot no longer loses the asking price on a thin HDB block.** It always
  shows the sales held at the searched block, then — only when fewer than five
  suitable recent sales exist — scores a transparent nearby cohort of the same
  flat type, similar size and lease. Every comparable, radius and filter is
  printed. If even that cohort is too thin, the report says the price was not
  assessed and cannot call the result “Little flagged”. Rubric `2026-09-v3`.
- **Preflight reports a request with no response.** The Supabase events probe
  used to call `.slice()` on an absent body and crash the whole diagnostic on
  a DNS failure. It now names the unreachable integration. A live unsandboxed
  run on 1 Sep returned `ok` for all nine checks. Commit `151ea68`.

- **The calculators cross all four property types.** `HDB`, `EC_DEVELOPER`,
  `EC_RESALE`, `PRIVATE` — MSR applies to the first two, TDSR to all, and the
  tenure cap differs. An EC sent as HDB was assessed over 25 years instead of
  30 and understated the loan by ~S$54,000.
- **`/progressive`** — the nine statutory BUC stages, quoted from the Housing
  Developers Rules, with stamping deadlines and penalties.
- **`/lease`** — SLA's leasehold relativity table, all 99 rows, from
  `data/sources/leasehold-table.json`. No "when to exit" advice; that half of
  the brief was refused.
- **`/land`** — 441 URA awarded sites since 1993 plus 216 HDB sites, with every
  losing bid where HDB published it. **No breakeven ladder** — see the refusal
  note at the top of `components/LandView.jsx`.
- **The land → project trail** — `lib/land.js` joins HDB's tender tables to 190
  records. A condo or EC page now opens the tender that created it.
- **`/cost`** — `lib/calc/ledger.js`. What a purchase costs before the property
  does anything, and the price a sale must clear to return the reader's cash.
- **`/compare`** — gap 7 from the TRM teardown, done.
- **A back button on every page** — `components/BackLink.jsx`, `lib/nav.js`.
  It goes UP, not back; the reasoning is in the file.
- **The neighbourhood tracker is scoped to Singapore in `lib/scope.js`**,
  before the model is called. A prompt rule alone did not hold.
- **`lib/watch.js`, `lib/digest.js`, `scripts/send-digest.mjs`** — the block
  digest the consent tick had been promising since 24 Aug with nothing behind
  it.
- **Contrast measured rather than eyeballed** — `test/contrast.test.js` reads
  the tokens out of `globals.css`. `--edge` exists because every control border
  was at 1.21:1 against a 3:1 requirement.
- **The sitemap is driven from `lib/nav.js`.** It was missing every calculator
  on the site. Adding a tool to the nav now adds it to the sitemap.

---

### The 2 Sep comprehension pass

The complaint was "too many things and not enough explanation". It was a
navigation problem, not a decoration problem, and it is largely fixed.

- **The doorway is three sentences.** The Tools menu was twelve destinations
  named after mechanisms in a panel that had to scroll. It is now `I'm buying`
  / `I own, or I'm selling` / `I'm checking one specific home` plus a way to
  browse everything — four choices, measured at 245px against an 804px ceiling.
  The phone menu shows the same four instead of eleven bare routes.
- **The words live in `lib/nav.js`.** One description drives the menu, the
  `/tools` router and each tool's own header. `SITUATIONS` caps recommendations
  at three per situation and `test/situations.test.js` fails if that or the
  no-acronym rule is broken.
- **`/tools` routes instead of listing.** Three situation cards, three
  recommended starts each, long tail behind a disclosure, full index below.
- **Every tool says what it is for** before its first input — `ToolIntro`,
  use/need/get. Calculators that open on prefilled figures say so in `--warn`.
- **The quick calculators are addressable** — `/tools?calc=duty`. Every route
  in used to open "When can I sell". Their tabs also stop wrapping 3+1 at 390px.
- **Somebody built this.** Four sentences on the homepage after the search, and
  `/about` reordered to who → why → three principles → particulars → method.
  **The first-person copy is a DRAFT for Shervin to approve or replace.**
  Nothing biographical is asserted; every clause is provable from the product.

Corrected on the way: the handoff proposed "What rent does this price imply?"
for `/yield`, which reports a GROSS return and implies no rent. Plain language
may simplify a claim and may not enlarge it — there is a test for that now.

### What that pass did NOT finish

1. **`Look up` still shows six items.** Acceptance criterion 2 says no primary
   surface offers more than four equally weighted choices. Tools is fixed; this
   group is not. It is a weaker case — those six are content indexes, not
   mechanisms, and grouping them adds a tap to the site's main content — so it
   was left rather than decided unilaterally.
2. **No result hierarchy.** The brief asks every tool to end with: the answer ·
   what changed it · what public data cannot know · the next useful action.
   Several tools do parts of this; none does it consistently.
3. **No labelled human bridge.** "Shervin's note" or "What I would check next"
   after the arithmetic, never changing a deterministic score or assigning a
   number. **DEFERRED by Shervin on 2 Sep — do not start it uninvited.** It
   remains the right answer to "not enough personal flavour", and it is worth
   more than any amount of decoration: voice with substance behind it, in the
   one place a reader has just finished reading a figure.
4. **A portrait is NOT needed, and this was decided rather than postponed.**
   The handoff asked for one at the top of `/about` and on the homepage. Both
   surfaces are built to take one and both render fine without. Three reasons
   it was dropped:
   - A headshot is the most generic move available to a Singapore property
     agent — on every listing and every namecard, and therefore invisible.
     Being the property site WITHOUT one is closer to the positioning.
   - It is a trust signal that works by not being evidence. Putting a face
     above three principles that begin "if the source cannot be shown, it does
     not publish" undercuts the page in the act of making it.
   - The CEA registration on every page is a stronger accountability signal,
     because it can be checked.

   If a photograph of Shervin ever goes in, it belongs small and further down
   `/about` — at work, somewhere ordinary and recognisably Singapore, not a
   studio headshot — and it is a nice-to-have, not a blocker.
5. **One editorial note in Shervin's own voice.** The MOP deep dive was deleted
   on 2 Sep (it was written to demonstrate tone, not to publish), and it was
   the ONLY place on the site carrying first-person judgment. `/insights` is
   down to a single entry. Also deferred; also his to write, not an agent's.
6. **"What can I borrow" is still separate from `/plan`.** Unchanged on
   purpose: it uniquely applies the variable-income haircut, and §6 says do not
   delete it until `/plan` can express that case.

## 3 · The TRM gaps still open

Three remain, all buildable from data already held.

| | Tool | Notes |
|---|---|---|
| ~~5~~ | ~~**Price history and realised returns**~~ | **REFUSED 2 Sep — it cannot be built from this data, and the attempt is the record.** Pairing filed sales needs a unit identifier and neither HDB nor URA publishes one, deliberately: unit-level purchase prices are the REALIS-shaped data rule 1 forbids outright. The closest available match is address + floor area + floor band, and it is NOT a unit — Blk 362C Sembawang Crescent filed fifteen 4-room 93 sqm sales on storeys 7–9 inside seventeen months, two in the same month. A first build of it paired those and produced a confident median holding period out of fifteen different families' homes. **What shipped instead** is `sizeTrend` in `lib/blindspot/measure.js` over `data/trend.json`: median psf by year in 10 sqm bands, beside the same figure for every size at that address. A headline year-on-year figure is a median over whatever happened to sell, so it moves when the MIX moves — The Sail's 60–70 sqm homes fell 4.1% while the address rose 7.2%. That gap is the finding, and it is true. |
| 6 | **Quantum by year** | What buyers actually paid, by region, size and year. A pivot over data already held. |
| 8 | **URA Private Residential Property Index** | Only HDB's index is published on the site today, so anyone comparing a flat to a condo has to leave. `data/hdb-index.json` is the shape to follow. |

Refuse regardless, unchanged: Valuation, Project Scorecard, Commercial,
Watchlist.

### Why most of PropNex's Investment Suite is off limits

Their *Tower View* is a stack plan showing every unit by number with the
owner's purchase price, an estimated valuation and an estimated profit. Its
footer reads "for your personal use only". Unit-number-level purchase prices
are REALIS-shaped, which **rule 1 forbids outright**, and a single Est. Val per
unit breaks **rule 2** independently.

So gap 5 is worth building only in a form that does NOT identify a unit —
matched on project, size band and date, reported as a range. **If it needs a
unit number to work, it is the wrong feature.**

---

## 4 · The two live briefs, and what survives of them

Both came from other models. Each had a buildable half and a refusable half,
and the refusals are the useful part of the record.

**"How this land became this project"** (ChatGPT) — the strongest idea either
produced, and the reason `lib/land.js` exists. **Half of it is now built:** the
tender, the bids and the award render on the record page. What is NOT built is
the second half — a restrained timeline down the page from tender to today's
filed range, and the reverse view on `/land` showing the trail forward. Worth
finishing.

**"Capital Ledger / Opportunity Cost Engine"** (Gemini) — the honest core
shipped as `/cost`. **Three things in it were refused and should stay refused:**

- Scoring the purchase against historical STI, S&P 500 and gold. None of those
  series is in the repo, each needs sourcing and licensing, and ranking a home
  against equities is investment advice.
- Historical BSD/ABSD tiers by purchase year. `lib/calc/constants.js` holds
  current rates only. Backdating them is real work and needs IRAS as a source,
  not memory.
- `.tsx` and `recharts`. Three npm dependencies is the architecture.

Also still refused, from earlier briefs: the GLS **breakeven ladder** (two of
three inputs published by nobody, and it projects a launch price for a
development that does not exist yet), the **floor-plan badge library** (a model
assigning a verdict, plus developers' copyright), and the lease **"inflection
point / when to exit"** (sell advice built on an invented 2% line).

### Other ChatGPT suggestions not yet started

"What changed since your last visit", an evidence-band record redesign, an EC
eligibility decision tree, a school explorer. None assessed in depth.

---

## 5 · Known problems

- **Share cards are SVG.** `app/og/route.js` returns `image/svg+xml`. WhatsApp
  will not preview SVG, which is most of the point of having them. Needs a PNG
  path — `sharp` at build time, or `@vercel/og`, which would be a fourth
  dependency and therefore a decision.
- **`data/sources/rail-future.json` is an empty array.** Future MRT needs LTA's
  own announcements. **Do not populate opening years from memory** — rule 13.
- **3 of 219 HDB land rows will not parse.** Printed on every run of
  `npm run parse:hdb-sites`. Their column layouts differ from all three known
  schemas.
- **The HDB half of `/land` cannot auto-refresh.** HDB publishes those tables as
  PDFs behind a page that builds its links client-side, with no stable download
  URL and nothing on data.gov.sg. They are dropped into `land-in/` by hand and
  parsed. URA's half does refresh.
- **The deck scripts hardcode rates.** `build-scripts/deck1–4.py` should import
  from `lib/calc/constants.js`. `test/guides.test.js` catches drift between the
  guides and the calculators; the decks are the gap.
- **The deck palette does not match the site** — and now matches a palette that
  no longer exists either. See the warning at the top of this file.

---

## 6 · Design and product flow

The first running pass is complete: shared calculators, record navigation,
record → Blindspot and homepage hierarchy are covered above. Rules 1–5 under
"Styling" in `CLAUDE.md` remain the differentiation and are not up for
negotiation.

### Next design order

1. **`/tools` itself.** The first screen is four quick calculators in tabs and
   the rest of the page is the full index. “What can I borrow” is narrower than
   `/plan` but uniquely applies the variable-income haircut. Do not delete it
   until that input exists in `/plan`; then merge the two rather than keeping
   overlapping answers. The sell timeline, duty-only answer and amortisation
   view remain distinct.
2. **Measure tool use before deleting specialist features.** First-party
   analytics records page views, search, records and the lead funnel, but not a
   tool run. Add coarse allowlisted tool-use events (tool id only; no figures)
   before judging `/floorplan` or `/neighbourhood` by taste.
3. **Record hierarchy.** Keep the filed median dominant with the observed range
   beside it. A median from transactions is not a point valuation, and
   reversing the hierarchy because an outside report grouped the two together
   would make the first answer harder to scan without making it more honest.
4. ~~**Splitting the Tools menu.**~~ **Done, 2 Sep.** The wait was superseded
   by Shervin's direct feedback that the site is confusing to a normal person.
   The menu is now three situations plus "Browse every tool"; the inventory
   moved to `/tools`, the footer and the sitemap, which is where an inventory
   belongs. A new tool now needs a `plain`, `use`, `need` and `get` in
   `lib/nav.js` or `test/situations.test.js` goes red.

### Feature audit decisions

**Preserve:** `/plan`, `/cost`, `/progressive`, Blindspot's deterministic rubric,
Compare, Tower View, rental yield cohorts, the land → project trail, the island
hero, the record buyer/owner fork, source-and-period lines, and the visible
missing-data states. These are the product; none should be replaced by a new
dashboard shell or a generic AI answer.

**Validate before building:**

- “What changed since the last visit” is the strongest small repeat-use idea:
  local browser state, no account, and a natural match for Block Watch. Check
  actual repeat-record traffic and alert use first; a median changing because
  a thin cohort changed must never read as a valuation update.
- A school explorer is useful only with MOE ballot results and the school's
  authoritative land boundary. A list of blocks by measured band is viable; a
  shaded 1km circle around a registered point is not MOE's boundary and does
  not ship.
- A personal MOP timeline may align known dates, eligible-to-list supply and
  today's proceeds. It must not project a future index or recalculate future
  sale proceeds from one; that would turn a known-date tool into a forecast.
- The three still-open TRM gaps in section 3 remain ahead of another general
  tool because they complete comparisons the site already invites.

**Refused after the audit:**

- “Renovation-age negotiation anchor.” Renovation is not in the filed data;
  inferring it from a building or flat's age would dress an assumption as a
  comparable.
- Shaded school-radius geometry from a single coordinate, future-index proceeds
  on an MOP timeline, any launch-price projection from land cost, and any
  valuation/ranking badge. The refusal reasons are rules 2, 6, 12 and 13, not
  build complexity.

The Perplexity report dated 31 Aug was useful for buyer jobs and competitor
patterns, but its reference appendix is partly corrupted: several early
citations resolve to unrelated Vercel and template pages, and it called the
land → project trail and mobile record navigation missing after both existed.
Use its ideas as hypotheses; re-check every source against a primary agency
before a feature becomes a published claim.

---

## 7 · Editorial

The pipeline works end to end. `npm run note` scaffolds a dated entry prefilled
with what moved in the data. `/studio` is where volume arrives once Make.com is
running — **the approval step is the feature; do not add a way to skip it.**

---

## How to work in this repo

- `npm test` before and after. **295 passing.** A red test is a real finding.
- `npm run preflight` before assuming a key works. It makes a real call to each
  provider and only a 200 counts.
- **Never run `next build` while a dev or production server is up.** They share
  `.next` and the mix corrupts it. The process renames itself to `next-server`,
  so `pgrep "next dev"` will not find it — check the port. This has now caught
  three people, one of them twice.
- A raw ingest download goes in `outputFileTracingExcludes` **as well as**
  `.gitignore`. The tracer reads the disk, not the index. Forgotten twice.
- Every new derivation gets a test that describes a failure someone could
  actually cause. Several here exist because the bug already happened.
- Degrade, never break. Say what could not be measured.
- **If a feature needs a model to produce a number, the feature is wrong.**
- **JSX text does not process `\uXXXX` escapes.** Write the character. An em
  dash written as an escape reached a rendered page once;
  `test/jsx-escapes.test.js` is why it did not ship.
