# Truestorey Consult — brief for the analytical side

The counterpart to `docs/AGENCY_BRIEF.md`. That one covers renders and
listings. This one covers **numbers, triage and closing** — the work that
happens after someone arrives from the site.

Hand this file to a new chat as starting context.

---

## 1. The shape, in one line

**The site is the hook. This is the workbench.** `truestorey.vercel.app` is
editorial, free, public, and bound by every rule in `CLAUDE.md`. Consult is
private, runs on Shervin's own machine, and answers the questions the site is
not allowed to answer.

**On the name.** `desk` is already taken — `npm run desk` writes the daily
editorial piece. The code namespace is `lib/consult/` and that is settled.
The outward-facing name is a preference, with one constraint that is not:
CEA advertising guidelines cover Shervin's marketing generally, not just the
site, so **"expert", "specialist" and "advisory" stay out of the business name
too.** "Consult" is clear of that. "Advisory" is not, and reads as licensed
financial advice, which is a different regulator again.

---

## 2. The boundary, and why it is a test

`lib/consult/` produces a point estimate of what a home is worth. That is the
one thing rule 2 forbids publishing, and it is correct here: an internal
research tool is not a publication.

The distance between those two states is **one `import`**. Next traces imports
from `app/`, so a single component reaching in "just for the range" ships the
whole module, and nothing about the resulting page looks wrong in review.

So it is asserted, not agreed:

- `test/consult-boundary.test.js` fails if anything under `app/`, `components/`
  or `lib/` (outside `lib/consult/`) imports the consult layer.
- `clientSafe()` in `lib/consult/avm.js` is the **only supported crossing**. It
  drops `psf` and `price` and the weights that produced them, and keeps the
  observed band and the comparables — which is the shape `/blindspot` already
  publishes.

---

## 3. What relaxes, and the three things that do not

The premise — *these are my tools, the words come out of my mouth* — is right,
and it is right about most of `CLAUDE.md`. Those rules govern **what gets
published under a CEA registration number**. A private research tool is a
different surface.

**Genuinely relaxed, internally:** rule 2 (a point estimate), rule 7
(over/under, ranking, "best" as a working vocabulary), rule 13 (geometry for a
property that has actually been measured — see the agency brief).

**Three that do not relax, and each costs real money if treated as though it
did:**

1. **REALIS is a licence term, not a publication rule.** URA licenses it for
   personal research, *not commercial use*. An agent using it to advise a
   client is commercial use by definition — being private makes it more
   clearly commercial, not less. Rule 1 stands here unchanged.
   **Worth resolving rather than assuming:** Huttons may hold a corporate
   REALIS licence, which would be a legitimate route to unit-level private
   data and a real accuracy gain. That is a question to ask the agency, and
   the answer changes what the AVM can see. It never changes what the site
   can show.

2. **An inbound message is still not consent, and DNC still applies.** This
   gets sharper with a bot, not softer. Replying to someone who messaged first
   is fine. **Adding that number to a broadcast, a digest or a list is not** —
   that needs an explicit ticked box per channel (PDPA s14(2)) and a real DNC
   check for a Singapore number. `DNC Checked` is never auto-filled (rule 5).
   A bot that quietly builds a contact list is the single most expensive thing
   that could be built here.

3. **"Out of my mouth" is not a safe harbour.** CEA PG 02-11 governs
   *representations*, not only written advertisements. A licensed salesperson's
   spoken price opinion is still his professional representation, and a
   screenshot of an internal tool sent to a client is an artefact regardless of
   who typed the message around it.
   This does not restrict the tool. It restricts **what travels**: think in
   points and rankings, hand over ranges and comparables. `clientSafe()` is
   that distinction made mechanical, so it does not depend on remembering it
   at the moment of being in a hurry.

---

## 4. The AVM — built, and measured

`lib/consult/avm.js`. It answers the inverted question `/blindspot` is not
allowed to: not "you were quoted X, where does X sit" but "what would this
sell for".

**What it reuses.** Cohort selection is the hard, already-audited part — same
type family, floor area in a band, same tenure family, similar lease
remaining, a radius that widens only until enough exist. That is
`priceAnalysis` in `lib/blindspot/measure.js` and it is **not reimplemented**.

**What it adds, and these three are the accuracy:**

1. **Time.** `lib/consult/timebase.js` restates every comparable into one
   quarter's money using HDB's RPI or URA's PPI — both already in `data/`,
   neither previously used for this. A 2024-Q3 sale is 5.1% (HDB) to 6.6%
   (private non-landed) understated in 2026-Q2 money, and a flat median throws
   that away.
2. **Weight.** Published half-weight distances in `WEIGHTS`: 400m, 18 months,
   12% of floor area. A sale in this block last quarter is better evidence
   than one 1.4km away two years ago, and a plain median says they are equal.
3. **A measured error.** See below.

### The numbers, and how to quote them

`npm run backtest` — 600 held-out sales, seed 1, six-month window:

| | AVM | Plain median, same address, 12 months |
|---|---|---|
| median absolute error | **3.84%** | 4.86% |
| within 5% | **60.3%** | 50.9% |
| within 10% | **82.9%** | 78.4% |
| within 20% | **94.7%** | 94.3% |
| — HDB, median abs error | **3.78%** | 4.86% |
| — private, median abs error | **3.95%** | 4.86% |

Bias 0.05%. Coverage 81.8% — the rest scored nothing and said why, which is
the rule, not a shortfall to be hidden.

**The honest sentence this supports** is *"a median error under 4%, measured
over 600 sales it was not allowed to see, against 4.9% for a plain median of
the same address's recent sales."* It is **not** "more accurate than
PropertyGuru". There is no API to any competitor's AVM and no lawful way to
scrape one, so the comparator is the *method* a listing-page comparables widget
uses, and `scripts/backtest-avm.mjs` says so in its own header.

**Where it is still weak:** private beats the baseline at the middle (3.95%
against 4.86%) and is still slightly behind it in the tails — 73.7% within 10%
against 79.0%. Nearby-project comparables are what fatten that tail.

### Two things that already went wrong here

**The ladder was throwing away the best evidence.** `priceAnalysis` picks ONE
rung — this address over 12 months, else 24, else nearby — and the third
*replaces* the first. A condo whose own building filed four sales in 24 months
dropped all four and priced itself off neighbouring projects. Measured: private
scored **6.83%** against a 4.86% baseline, worse than the naive method it
exists to beat, with a worst case of **503%**. HDB did not show it, because two
blocks of the same age in the same town really are the same product. The rungs
are unioned now and `WEIGHTS.distanceM` arbitrates, which is what it was for.
Private went 6.83% → 3.95%.

**A backtest through this engine leaks by default.** `sameRecordPrice` filters
`month >= cutoff` with **no upper bound**. That is correct live — `now` is
always today — and fatal to a backtest: a past `now` still sees every later
sale, including the one being predicted. `lib/consult/asof.js` truncates the
data instead of changing the engine, strictly `month < asOf` (same-month sales
had not registered yet either). A backtest run without it reports an accuracy
nobody can reproduce on a live lookup, which is the most expensive kind of
wrong number — confident, reproducible, and measuring the answer key.

### Next, in order of accuracy per hour

1. **Fit the size gradient from filed sales**, the way `storeyCurve` fits the
   floor gradient. Smaller homes carry higher psf; right now that is a weight,
   not an adjustment, because a coefficient taken from memory is what this repo
   forbids. Fitted from data it becomes a real correction.
2. **An ablation flag on the backtest** — `--ablate index|weights|union` — so
   each component has to earn its place rather than being assumed to.
3. **Per-town and per-district error**, because one national figure hides where
   the tool should not be trusted, and that is exactly what he needs to know
   before he opens his mouth in a living room.

---

## 5. The rest of the ask — what is buildable and what is blocked

**Undervalued / overvalued: buildable now, with one input.** It is the AVM plus
an asking price. The repo holds no listing data and there is no lawful free
feed of one, so **the asking price is typed in** — which is how an agent
actually works, looking at one listing. That ships today and needs nothing new.

**Best buys / high potential: genuinely blocked, and not on effort.** Ranking
*across* listings needs a listing feed, and that means a licensed source or a
scrape. Name the blocker rather than building a ranking over the 13,168
addresses in `comps.json` and calling it best buys — those are transacted
addresses, not things for sale, and a ranking of them answers no question
anyone asked.

**New launch vs resale: buildable now, and the data is unusually good for it.**
`gls-awards.json` (441 awarded sites, 1993–2026), `projects.json`,
`private.json` and `ppi.json` support a real sourced comparison of new-launch
psf against resale psf in the same locality. Note what `/land` already refuses
and why: a projected launch price from land cost is **two guesses wearing
arithmetic's clothes** (construction cost and developer margin are published by
nobody). Compare what was actually paid, not what should have been.

**The bot: read before writing.** The Apps Script Property CRM project already
has one — `07_Bot.gs`, `09_Intake.gs`. Two replacement bots have already been
written and deleted here, and the commit messages are the lesson: *"A second
replacement bot, for a project that does not exist"* and *"Read the project
before writing for it."* The blocker is the same one the agency brief names:
**what field names `addContactsBulk_` reads**, in `05_Actions.gs` or
`06_Import.gs`. Until that is known, `lib/crm.js` posts the wrong shape and
`CRM_WEBHOOK_URL` stays out of Vercel. Triage into buy/sell/rent/curious is a
small job on top of a bot that already exists; it is not a bot project.

**The brain.** `lib/ai/providers.js` and `lib/scope.js` are the substrate, and
`scripts/desk.mjs` is the working example of the pattern: `lib/findings.js`
decides what matters *by arithmetic* and the model writes prose around figures
that are already fixed.

**"A model never assigns a number" survives into Consult, and it is not one of
the regulatory rules.** It is an accuracy rule, and it binds harder here, not
softer — a figure a model invented is one Shervin cannot source when a client
pushes back, and he will have said it out loud. The AVM and the rubric produce
the numbers. The brain explains them, drafts around them, and never originates
one.

---

## 6. Carried over, still open

- **Three secrets were pasted in plain text in chat on 13 Sep 2026** —
  `WA_WEBHOOK_KEY`, `MAKE_SECRET` and the Apps Script exec URL. **Rotate them.**
  This is the oldest item here and the only one with a live blast radius.
- `addContactsBulk_`'s field names — blocks the bot *and* lead capture.
- Whether Huttons holds a corporate REALIS licence (§3.1).
- `CLAUDE.md` says 571 tests. It is 599.
