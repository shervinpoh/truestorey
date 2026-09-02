# AI handoff — Truestorey

Current 2 Sep 2026. This file is the state of play, not a transcript. Overwrite
it at the next handoff.

---

## Read first

The next phase is a **comprehension and personality pass**, not a new visual
theme.

Shervin's feedback:

> The site does not have enough personal flavour. To a normal person the tools
> and functions are confusing: there are too many things and not enough
> explanation.

That feedback is correct. The interface is visually disciplined and the
underlying tools are unusually strong, but the site currently asks a first-time
visitor to understand Truestorey's internal product taxonomy before choosing a
question.

Do not solve this with decoration, another dashboard shell, a chatbot, a
generic luxury-property aesthetic, or more motion. The desired direction is a
**guided, personal Singapore property atlas**: the existing data authority,
with fewer choices at once and more of Shervin's real voice.

docs/DESIGN_BRIEF.md is not present in this checkout. The current visual source
of truth is the Styling section in AGENTS.md: warm paper, deep teal interface,
light teal only for live/selected data, Archivo + Source Sans 3 + IBM Plex Mono,
restrained radii, and motion only when it explains information.

---

## Repository state — preserve this work

- Branch: master
- HEAD: fbf5c01
- origin/master is at the same commit.
- The worktree is intentionally dirty with the completed Blindspot price fix.
  **Do not reset or discard it.**
- Modified before this handoff:
  - NEXT.md
  - app/api/ai/blindspot/route.js
  - app/blindspot/page.jsx
  - app/globals.css
  - components/BlindspotReport.jsx
  - lib/blindspot/analyse.js
  - lib/blindspot/measure.js
  - lib/blindspot/rubric.js
  - test/blindspot.test.js
- This handoff refresh adds docs/AI_HANDOFF.md to the diff.

Blindspot now keeps same-block evidence visible and, when a thin HDB block has
fewer than five suitable recent transactions, uses a transparent nearby cohort
of the same flat type, similar floor area and similar lease. Every comparable
is shown. A price check that still cannot run says
“Incomplete — price not assessed” and cannot produce “Little flagged”.

Verified example, Blk 242 Bishan St 22, 1,292 sq ft:

- S$6.47m: S$5,008 psf; five comparable sales across four blocks within 750m;
  S$745–806 psf; 521% above the highest; price 3/3; report 3/10.
- S$1.2m: S$929 psf; 15.2% above the same high; price 3/3; report 3/10.
- Both saturate the published three-point price check, but the report now
  preserves the very different magnitude instead of hiding it.

Checks already completed:

- npm test — **284/284 pass**
- ./node_modules/.bin/next build — successful across 762 pages
- Blindspot verified at desktop and 390px mobile, including the comparable table

---

## What the design audit found

### What is already strong — preserve it

1. **The homepage hero is the signature.** The asymmetric search + living
   Singapore island is distinctive, clearly local and visually confident.
2. **The Warm Ledger system works.** The typography, warm ground, deep teal and
   hairline structure feel more like an editorial research product than a
   portal or marketplace.
3. **The article voice is genuinely personal.** The MOP deep dive contains
   first-person judgment, a real client story, plain disagreement with common
   agent advice and an honest “what I would do” section. Do not replace this
   voice; surface it elsewhere.
4. **The data contract is the brand.** Source, period, missing-data states,
   ranges rather than valuations, free access and no sign-up are the strongest
   trust signals.
5. **The responsive foundation is sound.** The hero, search, map and Blindspot
   report work at desktop and 390px. Reduced-motion and focus checks are covered
   by tests.

### Where first-time comprehension fails

1. **The Tools dropdown contains twelve destinations** including the index.
   It must scroll on an ordinary desktop viewport, and the last choices are not
   visible without discovering that scroll.
2. **The mobile menu exposes all eleven tool routes as one long list** with no
   explanation. It is complete, but completeness is not guidance.
3. **/tools begins with four embedded calculators, then presents fifteen
   additional tool-like links.** Some overlap: “What can I borrow” is narrower
   than /plan (“Can I afford it”), while the sell timeline, duty and
   amortisation tools do not have their own routes.
4. **The four calculator tabs wrap awkwardly at 390px.** “The loan over time”
   falls onto a second row and reads like a detached control.
5. **The taxonomy mixes user outcomes with mechanisms.** “Blindspot”, “What the
   land cost”, “Rental yields”, “Buying off the plan” and “Can I afford it” are
   presented at the same level even though they serve very different moments
   in a purchase.
6. **Homepage tool blurbs lead with insider language.** TDSR, LTV, CPF, MOP, GLS
   and “published rubric” are accurate but make the visitor decode the site
   before receiving help.
7. **Many calculators open with silent example values.** /plan, /cost,
   /progressive and the calculators inside /tools immediately show specific
   answers without labelling the prefilled inputs as examples.
8. **The homepage is excellent for someone with an address and weak for
   someone with a decision.** After the search, a mobile visitor travels past
   the proof figures, island and lead article before reaching the six featured
   tools.

### Where the personal layer disappears

1. The homepage mentions Shervin only in the article byline, below the hero.
2. The About page is titled “About this site” and opens with page, town and
   archive counts. It explains the data very well and barely explains the
   person.
3. There is no portrait or original photography in the repository. The
   photos-in/photos.json manifest is only an example; the referenced files are
   absent.
4. Tool results are deliberately factual, which is correct, but there is no
   labelled human bridge such as “What I would check next” after the arithmetic.

The goal is not to make facts sound subjective. Keep deterministic results and
Shervin's commentary visually and semantically separate.

---

## Recommended next phase

### 1. Rebuild navigation around three visitor situations

Keep the existing Look up / Tools / Read top-level shape if it remains the
cleanest implementation, but change what the Tools entry reveals.

The first choice should be:

- **I'm buying**
- **I'm selling or already own**
- **I'm checking a specific home**

Allow at most three or four equally weighted choices in the desktop Tools
dropdown. One of them can be “Browse every tool”. The full index, footer,
sitemap and direct URLs must remain complete.

Suggested mapping:

- Buying: /plan, /progressive, /cost, /guides
- Selling/owning: sell timeline, proceeds, /mop, /cost
- Checking a home: /blindspot, /compare, /floors, /yield, /floorplan,
  /neighbourhood
- Advanced market research can remain in the full index: /lease, /land, /map,
  /market

The earlier instruction in NEXT.md said to delay splitting the Tools menu.
Shervin's new direct feedback supersedes that wait. Do the information
architecture now; do not wait for more tools to make the list longer.

### 2. Turn /tools into a decision router

The first screen should ask:

> What are you trying to work out?

Selecting a situation should reveal no more than three recommended starting
points, each phrased as a question and each stating its output in one plain
sentence. Keep a subdued “Browse all tools” route for people who know what they
want.

Move the four embedded calculators under a clearly named **Quick answers**
section. Do not present them as the primary product taxonomy.

Specific overlap to resolve:

- Add the variable-income input and haircut explanation to /plan.
- Only after /plan can express that case, merge or remove the narrower
  “What can I borrow” tab.
- Keep the sell timeline, duty-only answer and amortisation view unless they
  receive a better dedicated route.
- Give embedded calculator states deep links or URL parameters so “Stamp duty”
  can be linked directly instead of always opening “When can I sell”.

### 3. Add a common plain-language introduction to every tool

Before inputs, answer three things compactly:

- **Use this when…**
- **You will need…**
- **You will get…**

Do not add walls of explanatory copy. One sentence per item is enough. Spell
out an acronym at first use and reserve the acronym for the detail layer.

If inputs are prefilled, label them:

> Example values — replace these with yours.

At the end of a result, use the same hierarchy:

- The answer
- What changed it
- What public data cannot know
- The next useful action

Any human interpretation must be labelled **Shervin's note** or **What I would
check next** and must never change a deterministic score or assign a number.

### 4. Surface Shervin without turning the site into an agent brochure

Add one restrained personal bridge near the homepage hero or immediately after
it:

> I'm Shervin. I built Truestorey because buyers should be able to see the
> filed numbers and the assumptions without creating an account or sitting
> through a sales pitch.

Treat that as draft copy for Shervin to approve, not invented biography.

Redesign /about in this order:

1. Real portrait + “Hi, I'm Shervin”
2. Why this site exists, in first person
3. Three operating principles already proven by the product:
   - if the source cannot be shown, it does not publish;
   - a range is more honest than a single valuation;
   - a useful tool should not require a phone number.
4. Registration particulars
5. How the data works and what the site refuses to do

Use compact author modules on articles and, selectively, at the end of high
intent tools. Do not repeat a headshot on every result.

### 5. Use authentic photography as the emotional layer

This part is blocked on Shervin, not engineering.

Ask for:

- one horizontal and one square portrait, ideally in an ordinary recognisable
  Singapore residential setting rather than a studio or luxury showflat;
- six to ten original context photographs: void decks, covered walkways,
  corridors, neighbourhood streets, a condo edge and a landed street;
- optional process photographs: reviewing a floor plan or working through
  figures with identifying client information removed.

Every file must go through photos-in/photos.json with place, date, alt text and
an honest exact flag. Never use a generic or AI building image as if it were a
named property. Avoid generic skyline, keys-in-hand and luxury-interior stock
imagery.

---

## Suggested plain-language labels

Keep route names and SEO metadata where useful; these are interface labels.

- Blindspot → **Check this home before I offer**
  Secondary label: “Blindspot · four public-data checks”
- Buying off the plan → **How much will I pay while it is being built?**
- What owning it costs → **What will this home cost me over time?**
- What a higher floor is worth → **Does this higher-floor premium make sense?**
- Compare → **Compare two or three blocks**
- Read a floor plan → **What should I notice in this floor plan?**
- What has been announced nearby → **What has changed near this property?**
- Rental yields → **What rent does this price imply?**

Validate the last label against the actual gross-yield output before shipping;
plain language must not change the claim.

---

## Acceptance criteria

1. At 1440px and 390px, a first-time visitor can choose buying, selling/owning
   or checking a home without knowing a property acronym.
2. No primary navigation surface presents more than four equally weighted
   choices at once.
3. The desktop Tools dropdown no longer requires internal scrolling.
4. The mobile menu does not present eleven uncontextualised tools in one run.
5. The /tools tab set does not wrap into an accidental-looking second row at
   390px.
6. Every calculator with defaults clearly labels them as example values.
7. Every tool says what it is for, what is needed and what comes out before the
   first input.
8. Shervin's identity and reason for building the site are visible before the
   footer, while data and opinion remain clearly separated.
9. Every current route remains directly reachable from the full index, footer
   or sitemap. Do not delete specialist tools based on taste; instrument
   coarse, allowlisted tool-use events first if removal is considered.
10. Homepage search remains focusable in the first frame while the island
    animates. No new CLS, no unconditional smooth scrolling, and reduced motion
    remains honoured.
11. Touch targets stay at least 44px; keyboard, focus, headings and contrast
    continue to pass.
12. npm test and direct next build pass. Never run a build while a dev or
    production server is running.

---

## Preserve unchanged

- The living island hero and current Warm Ledger visual system
- The deep-teal/light-teal semantic distinction
- Archivo + Source Sans 3 + IBM Plex Mono
- The homepage search as the primary action
- Article voice and the MOP deep dive's real client story
- Source-and-period lines, visible data limitations and honest missing states
- Ranges rather than single valuations
- Free access, no account, no email gate and no phone collection
- Blindspot's deterministic rubric and the uncommitted nearby-comparable fix
- Record pages, Tower View, Compare, cost, progressive payments, yield cohorts
  and the land-to-project trail
- The three-dependency architecture; no Tailwind, icon pack, chart library or
  animation dependency

Do not adopt the generic UI-search suggestion of glassmorphism, Cinzel or a
cool teal SaaS palette. It conflicts with the chosen direction, the repo rules
and the site's differentiation from Singapore property portals.

---

## Files likely involved

- app/page.jsx — homepage personal bridge and situation entry
- app/tools/page.jsx — decision router and full-index hierarchy
- components/Tools.jsx — quick calculators, deep links and example labels
- components/Nav.jsx — grouped desktop/mobile disclosure behaviour
- lib/nav.js — shared labels, routes and situation metadata
- app/about/page.jsx — personal introduction and operating principles
- components/Masthead.jsx or a new small shared component — tool
  “use/need/get” introduction
- app/globals.css — reuse existing tokens; do not start a second design system
- lib/analytics.js and app/api/track/route.js — coarse tool-use events only,
  never input figures
- photos-in/photos.json, scripts/ingest-photos.mjs — authentic imagery
- test/navigation.test.js, test/motion.test.js, plus focused tests for the new
  routing metadata and example labels

Start by reading AGENTS.md, NEXT.md and the current dirty diff. Do not begin by
rebuilding the visual system.
