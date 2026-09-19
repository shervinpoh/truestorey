# The AVM — what it does, why, and how to get more out of it

`lib/consult/avm.js`. Internal. See `docs/CONSULT_BRIEF.md` §2 for the boundary
that keeps it off the site.

Run it on anything:

```
npm run avm -- --q "ang mo kio ave 3" --first --sqft 1001 --floor 10 --asking 700
```

It prints every step of its own arithmetic. That is the point of it — the
number at the bottom is not something to trust, it is something to read.

---

## 1. What it is, in one sentence

**A weighted median of comparable sales, each one restated as though it had
happened on your floor, in your size, this quarter.**

That is all. There is no model, nothing is learned, and the same inputs give
the same answer every time. Every number it produces can be traced to a filed
transaction you can name.

**What it is not:** it is not a prediction of what a buyer will pay. It is a
statement about what the market has already done to homes like this one. The
difference matters when you are sitting across from someone — you are never
defending a forecast, you are describing a record.

---

## 2. The formula

### Step 1 — the cohort

Which filed sales count as this home. This is `priceAnalysis` in
`lib/blindspot/measure.js`, reused unchanged, and it is the most important step
because everything after it is arithmetic on whatever it chose.

| | HDB | private |
|---|---|---|
| type | same flat type | same type family |
| size | floor area ±10% | ±10%, ±25% landed |
| age/tenure | lease commencing within 5 years | same tenure family; leasehold within 15 years of lease left |
| where | 0.5 → 0.75 → 1 km | 0.5 → 1 → 1.5 km |

Three rungs are gathered and **unioned**: this address over 12 months, this
address over 24, and nearby addresses. The radius widens only until five
comparables exist.

### Step 2 — three adjustments, in order

Each comparable's filed psf passes through all three:

```
psf_filed
   → × (curve[your floor] / curve[its floor])     floor
   → × (index[this quarter] / index[its quarter]) time
   = psf_adjusted
```

**Floor** uses the storey curve for your town (HDB) or district (private), from
`data/storey.json`, and **prefers the within-building basis** — each block
compared with itself, then pooled across at least five blocks. That removes the
estate, the lease, the location and the flat model in one move, because all
four are shared by every band of one block. Where no such curve exists it falls
back to the town bands, truncated at the first implausible step. Capped at ±35%
either way.

**Time** uses HDB's Resale Price Index or URA's PPI, whichever governs.
A 2024-Q3 sale is 5.1% (HDB) or 6.6% (private non-landed) understated in
2026-Q2 money. The index lags — it restates to the **last published quarter**,
not to today, and says how many months behind that is. Adjusting to an
unpublished quarter would be extrapolation.

**Size** is deliberately *not* adjusted, only weighted. Smaller homes carry
higher psf and the gradient is real, but a coefficient taken from memory rather
than from filed sales is the thing this repo forbids. See §5.

### Step 3 — the weight

```
weight = w_distance × w_time × w_area
       = exp(−metres/110) × exp(−months/18) × exp(−|Δarea|/0.04)
```

Each is an exponential decay with a **half-weight distance** — the point at
which a comparable counts about a third as much as a perfect one. Two of the
three are now **measured, not chosen** (`npm run tune:avm`):

- **110 m — measured, and the biggest surprise in the file.** It was 400m, on
  the argument that past roughly there a comparable is a different precinct.
  The argument was reasonable and the number was nearly four times too
  generous. The tuner picked 110m in four of five address-split runs, and
  distance is far the strongest dimension: 0.283pp of median error across its
  range, against 0.097pp for time and 0.082pp for area.
  In words: **the building is almost the whole price.** A sale in your own
  block counts fully, one 110m away counts a third, one 400m away — which the
  old setting called half-weight — counts about a fortieth.
- **18 months — unchanged, and deliberately not tuned.** The search wanted 48,
  12, 18, 12 and 12 across five splits. It bounces because the dimension barely
  measures (0.097pp from six months to ninety-six), which is what you would
  expect once the index has already restated every price. A dimension that does
  not measure keeps its explainable default rather than taking whichever value
  one split happened to prefer.
- **4% of floor area — measured**, down from 12%, picked in four of five
  splits. The cohort already bounds area to ±10%, so at 4% a comparable at the
  edge of that band carries about a tenth of an exact match's weight.

**Held out on five different address splits**, the adopted combination beat the
hand-chosen one every time — gains of 0.19, 0.35, 0.13, 0.22 and 0.29pp, with
within-5% up two to three points in each.

### Step 4 — the answer

Sort by adjusted psf, accumulate weight, take the price where cumulative weight
crosses half. **Weighted median, not mean** — one penthouse cannot drag it.
No interpolation: the answer is always a price some home actually transacted at.

The **band** is the weighted 25th to 75th percentile of the same cohort. It is
not ±x% of the estimate and it is not a confidence interval — no distribution
was fitted, so none is claimed. A portal's ± is usually a fixed percentage,
which tells you only how confident the vendor decided to look.

---

## 3. What each part is actually worth

`npm run backtest` holds out 600 real sales the estimator was not allowed to
see, predicts each one as of the month before it happened, and measures.
`--ablate` switches a component off. **A component that cannot be switched off
is a component nobody has measured.**

| | median abs error | within 5% | within 10% |
|---|---|---|---|
| **full** | **3.15%** | 67.2% | 88.5% |
| − floor curve | 3.77% | 61.8% | 85.9% |
| − union of rungs | 4.11% | 57.7% | 80.4% |
| − weights (flat median) | 4.01% | 58.2% | 81.6% |
| − everything | 4.73% | 52.2% | 78.4% |
| *plain median of this address, 12 months* | *4.86%* | *50.9%* | *78.4%* |

Coverage 81.8% — the rest scored nothing and said why. The run of improvements,
all at n=4,000: hand-chosen weights and town-band floor curve 3.62% → tuned
weights 3.44% → within-building floor curve **3.15%**.

**Read this table before believing any improvement.** The time index is worth
the least right now (0.16pp) because the market has been flat and the cohort
window is short — most index factors come out at ×1.000. In a moving market it
is the component that stops the whole thing drifting, so its low score is a
fact about 2026, not about the method.

**How to quote the accuracy:** *"a median error under 4%, measured over 600
sales it was not allowed to see, against 4.9% for a plain median of the same
address's recent sales."* Never "more accurate than PropertyGuru" — there is no
API to any competitor's AVM and no lawful way to scrape one. The comparator is
the *method* a listing-page comparables widget uses.

---

## 4. Undervalued and overvalued — the part that must not be random

A gap between the asking price and the estimate is **not a finding**. Most of
the market is priced about right, and a tool that calls every 6% discount a
bargain is a random number generator with a confident voice.

A gap has four possible sources. Three of them are not opportunities.

```
gap = (asking − estimate) / estimate

  1. NOISE            the AVM's own error on this kind of lookup
  2. ADJUSTED-FOR     floor, size, tenure, lease — already netted out
  3. EXPLAINED        a risk the data CAN see: lease decay, MOP supply
                      nearby, a GLS site, thin liquidity, zoning
  4. RESIDUAL         what is left ← this is the only finding
```

### The three tests, in order

**Test 1 — does the gap survive the error?** This is arithmetic, not
judgement. `data/avm-error.json` holds the measured error for eighteen shapes
of lookup, built from 9,759 held-out sales and binned on the two features that
actually predict it: the cohort's own interquartile width and its effective
sample size. The eighteen bins run from **1.95% to 6.69%** at the median and
**5.52% to 27.85%** at the 90th percentile — threefold at the middle, fivefold
in the tail, all of which one national figure hides.

Every estimate carries its own bin, so the tool says *"6.7% is beyond the
typical 2.9% miss for lookups like this, but inside the 8.7% that one in ten
misses by"* rather than leaving you to weigh it.

Calibrated on 3,765 held-out lookups the table had never seen: **90.6% came in
at or under their predicted p90** (target 90%), **48.5% under the predicted
median** (target 50%). The table records which estimator version it measured,
so a stale one is reported rather than quoted.

Rebuild it after any change to the estimator, the weights or the cohort rules —
`npm run build:avm-error`. A stale table describes a method that no longer
exists while still returning confident-looking numbers.

**Test 2 — does a visible risk explain the direction?** Built:
`lib/consult/residual.js`, and it runs in the report. `lib/blindspot/rubric.js`
already measures lease, supply, liquidity, land sales and planning approvals;
this asks whether any of them argues in the same direction as the gap. A
discount that lines up with flagged risk is **explained, not cheap** — the
market is pricing something you can also see, and selling that as a bargain is
how you lose someone at the lawyer's office.

**It never converts a risk into a percentage.** "Supply explains 3% of the
discount" is the obvious output and it is fabricated — nothing published
anywhere says what a given MOP ratio is worth in price, and the rubric's points
are a risk ladder, not money. A number invented there would be far more
dangerous than the bare gap, because it would look like the answer. So Test 2
reports **direction and presence, in each check's own words**. The size of the
residual is the size of the gap; no more is claimed.

**The rubric's own `price` check is excluded, and that is not an oversight.**
It is the percentile of the asking price within its comparables — Test 1
restated. Letting it explain the gap would make the tool say *"the price is
high, and what explains it is that the price is high"*, and it would fire on
exactly the lookups where the residual matters most.
`test/consult.test.js` fails if it is ever added to the explainer list.

**A check that could not run is not a check that found nothing.**
"Unexplained" means one thing when five checks ran and all were clear, and
something quite different when three could not run at all. The first is
evidence; the second is silence. The verdict carries a qualifier saying which.

**Test 3 — what is left?** The residual is the finding, and it resolves to one
of five codes:

| code | meaning |
|---|---|
| `noise` | inside the error this lookup usually carries. Not a finding. |
| `discount-explained` | survives the noise, and flagged risk argues the same way |
| `discount-unexplained` | survives, and nothing found explains it ← **the finding** |
| `premium-against-risk` | paying above the evidence for a home the data already flags |
| `premium-unexplained` | survives upward, nothing explains it. A warning. |

Both premium codes are worth as much as the discount ones, and nobody builds
them, because they do not sell.

Worked example — Blk 649 Jln Tenaga, 1,313 sqft, floor 9, asked at $858,000:

```
asking   653 psf   S$858,000
estimate 613 psf → +6.6%  (S$53,131 above)
OUTSIDE the transacted band (596–628)

TEST 1  Yes. Beyond the typical 2.9% miss, inside the 8.4% one in ten misses by.
        measured over 537 held-out sales · HDB|b1|n1

TEST 2  3 of 5 checks flagged something:
          lease      1/3  66 years left, worth 83.6% of freehold …
          liquidity  1/2  About 2 sales a year here — the quieter quarter …
          supply     1/3  8.8% of nearby flats reach MOP in five years …
        clear: gls, view

TEST 3  premium-against-risk
        A 6.6% premium that survives the noise, on a home carrying 3
        flagged risks. Paying above comparable evidence for something
        the data already flags.
```

The same flat asked at $730,000 comes back `discount-explained` — a 9.3%
discount, but the same three risks are still standing beside it.

### The honest division of labour

The AVM cannot see renovation, facing, actual condition, whether it is tenanted,
or how badly the seller needs to move. **Those are exactly what you see at a
viewing.**

So the tool does not find bargains. **It sizes the question you have to answer
in person.** "This is 9% below comparable evidence, the cohort is thick, and
Blindspot flags nothing — so there is 9% here that the filed data cannot
explain, and I am going to find out what it is on Saturday." That is a
defensible sentence, it is true, and no portal can produce it.

### What is not buildable yet, and why

Ranking *across* listings — "best buys", "high potential" — needs a feed of
asking prices, and this repo holds none. Do not fake it by ranking the 13,168
transacted addresses in `comps.json`: those are records of things that already
sold, not things for sale, and a ranking of them answers no question anyone
asked. Until a licensed feed exists, **the asking price is typed in, one
property at a time** — which is how you actually work, looking at one listing.

---

## 5. Making it better — in order of accuracy per hour

**~~1. A per-lookup error.~~ Built** — see §4 Test 1 and
`lib/consult/error.js`. Two findings worth carrying forward: the RAW comparable
count barely predicts error (0.88pp of separation across its own quintiles)
while the *weighted* count predicts well (2.18pp), and cohort dispersion beats
both (3.13pp). The obvious feature was nearly the worst one.

**~~2. Tune the weights.~~ Done** — `npm run tune:avm`, and see §2 step 3.
Distance was nearly four times too generous at 400m; 110m is what the record
says. Two guards worth keeping: the grid must **contain its own answer** (the
first one started at 150m and the search picked the boundary, which is a wall
and not a minimum), and the split is a parameter so an optimum can be checked
for stability across five of them.

**~~3. Fit the size gradient.~~ Measured, built, and then removed** — the most
useful negative result here.

`npm run measure:size` finds a real gradient. Fitted within one block and one
flat type — which holds location, vintage, lease and tenure constant by
construction — HDB's elasticity of psf to floor area is **−0.387 across 541
groups, 86% of them negative**, and −0.444 with the storey band held constant
as well. A flat 10% larger sells for about 4% less per square foot: buyers
price the flat, not the foot. Private straddles zero (−0.060, p25 −0.235 to p75
+0.060) and does not measure at all — a project's mix runs from one bedroom to
four and those are different products priced closer to proportionally.

So the adjustment was built. It moved the median error by **0.01pp** — and once
the area half-weight was tuned from 12% down to 4% it moved it the **wrong
way**: 3.44% with it against 3.40% without, on three separate runs. The
tightened weight already discards the comparables the adjustment existed to
correct, and a single global elasticity applied to what remains adds only its
own error.

It was removed. **The gradient is real and the adjustment is not worth
having**, and those are different statements. The measurement script stays so
the next person to propose it can check — it will agree with them right up to
the point where it stops mattering.

**~~4. Rebuild the storey curve from within-block variation.~~ Done**, and it
was the largest single gain of the three: **3.44% → 3.15%**, with the floor
curve's own contribution going from 0.25pp to **0.62pp**. Fixing the confound
more than doubled what the adjustment is worth.

`build-storey.mjs` already computed the honest measure — each building compared
with itself — but only as a single low/high **ratio**, and a two-point pair
cannot place floor 9 between them without inventing the shape. So `storeyCurve`
went on reading the confounded town bands. The missing piece was the middle:
every band, still measured inside one building, pooled across at least five.

The difference is not subtle. **Ang Mo Kio 4 ROOM: the town bands claim 90.4%
from the bottom of the town to the top. Measured inside buildings, floors 1–12
are worth 2.0%.** And it cuts both ways — **District 05 Apartment's town bands
*fall* 0.2%, so the curve was refused outright; measured inside buildings it
rises 4.9% across eight bands, smoothly.** The confounded table was wrong in
both directions and looked authoritative in both.

97 group×type curves now use the within-building basis, 59 fall back to town
bands, 33 still refuse because no basis rises.

---

## 6. Two things that already went wrong here

**The ladder threw away the best evidence.** `priceAnalysis` picks ONE rung and
the third *replaces* the first, so a condo whose own building filed four sales
in 24 months dropped all four and priced itself off neighbouring projects.
Measured: private scored **6.83%** against a 4.86% baseline — worse than the
naive method — with a worst case of **503%**. HDB did not show it, because two
blocks of the same age in the same town really are the same product. The rungs
are unioned now. Private went 6.83% → 3.95%.

**The storey curve was measuring vintage, not height.** `storeyCurve` only
checked that the top band beat the bottom one. Ang Mo Kio's 4 ROOM curve ran
530 → 576 psf across floors 1–12 — a sane 9% over eleven storeys — and then
printed **866 at floors 13–15**, a 50% step in one band. That is not a height
premium: in an HDB town the blocks tall enough to *have* a 13th floor are the
newer ones, so the upper bands are a younger, longer-leased product and the
curve was reading their lease as their height. A comparable filed at 532 psf
was being restated to **352** to stand next to a tenth-floor home, a 34% move
that slipped under the ±35% cap and carried the third-largest weight in its
cohort.

28 of the 156 accepted curves carried a step above 25%; 96 were not monotonic.
Curves are now truncated at the first step above 15% — a floor is worth
0.5–1.5% in this market, so a three-storey band should step by a few per cent.
**This was a live bug on `/blindspot`, not only here.**

---

## 7. REALIS — what it actually buys, and how it is kept from leaking

REALIS is in scope for the practice. It is not in scope for the site, and that
is not only rule 1: redistribution is a licence question independent of use. So
**every comparable carries a provenance tag from the day the first REALIS row
lands** — `source: 'public' | 'realis'` — the estimate reports what share of
its evidence is REALIS-derived, and `clientSafe()` plus
`test/consult-boundary.test.js` keep it off anything published. The tag is also
how you find out whether the licence is earning its fee: run the backtest with
and without.

What it adds, in order of value:

**1. Unit identity, and therefore repeat sales.** The same unit sold twice is a
pure price change with every attribute held constant — same floor, same facing,
same stack, same lease. That is the gold standard for a price index, and it
would replace the *national* index (§3's weakest component, 0.16pp) with a
project-level one. This is the largest single upgrade available.

**2. Exact floor instead of a three-storey band.** Removes ±1.5 floors of noise
from every private comparable, and — more importantly — lets the storey curve be
fitted **within a block**, where vintage and location are held constant by
construction. That fixes §6's second bug at the root rather than truncating
around it.

**3. Stack and facing.** The largest unobserved attribute in a condo, and
currently invisible.

**4. Exact area** instead of banded.

Expect the gain to land on private, which is where the public data is thinnest
(3.95% against HDB's 3.78%, on a cohort that has to reach further). **Measure
it before claiming it.**

---

## 8. The outlook — "is this a good buy", without a forecast

`lib/consult/outlook.js` · `npm run outlook -- --href … --sqft … --floor … --years 7 --price …`

**There is no predicted price in it, and that is not a limitation.** Nobody can
forecast one home five or ten years out, and a number printed for it would be
repeated out loud in a living room long before it was ever checked.

What makes the refusal cheap is that **most of what decides the answer is
already on a calendar.** The tool separates that from the genuinely unknown and
never averages the two.

### The one subtlety that makes it honest

An index is a **basket** whose age composition stays roughly constant — older
stock leaves, newer stock enters. A single flat does not: it ages a year every
year. So applying index growth to one leasehold home **overstates** that home's
growth by roughly its own lease decay.

The decay therefore belongs *inside* the hurdle, not beside it. Adding it is
not double-counting — omitting it is the error, and it is the error every "what
will my flat be worth" calculator in this market makes.

### The four figures

**1 · Scheduled lease decay.** SLA's relativity table, all 99 rows, already in
`lib/calc/lease.js`. Not a model: the schedule the State itself uses for lease
renewals and differential premium. 66 years left is 83.6% of freehold; 59 years
is 79.5%. Over a seven-year hold that is **−4.9%, whatever the market does.**
Freehold reports *no scheduled decay* — a different claim from a zero arrived
at by not looking.

**2 · Friction.** BSD and ABSD from `lib/calc/constants.js` (statutory, sourced,
review-dated). Commission and conveyancing are conventions, not published
rates, so they live in `FRICTION` as stated assumptions and print every time.
SSD is zero at every horizon here — it expires at three years — and that is
said rather than silently omitted. Financing is excluded by design: interest
depends on the loan, and `lib/calc/plan.js` is the tool for it.

**3 · The hurdle** = friction + lease drag. For a 66-year Bedok flat at
$858,313 over seven years: **+10.2%, or 1.39% a year compounding, just to
return the money that went in.**

**4 · How often the record cleared a hurdle that size.** `distribution()` in
`lib/calc/windows.js` reads every window of that length the index has ever run
— no forecast, no averaging. Then `countAtOrBelow()` counts how many finished
below the hurdle:

```
Every 7-year stretch in the HDB Resale Price Index
1990-Q1 → 2026-Q2, 118 of them, 5 non-overlapping

  p10        −9.6%
  p25        +2.9%
  median    +34.0%   ← the middle of the record
  p75       +65.6%
  p90      +165.9%

27 of 118 finished below where they started.
39 of 118 finished at or below the +10.2% hurdle.
```

**A count, not a probability.** Overlapping windows are not independent trials
and nothing here pretends they are.

### Why percentiles and not the best and worst window

The first version of this led with *"worst −24.1%, best +305.8%"*. Both are
true and the second was actively misleading, in two separate ways.

**It is a bad statistic.** A maximum over 118 *overlapping* windows is a single
observation and the least stable number in the block — move the series by one
quarter and it can shift by tens of points.

**And it is a different market.** That window is 1990-Q1 → 1997-Q1: before ABSD
(2011), before the current SSD regime (2010), before TDSR (2013), and off an
index reading **24.3 against today's 202.8**. **40 of the 118 windows start
before 2000**, and they occupy almost the whole upper tail — which is why even
the p90 reads +165.9%. Printed as a headline, it invites a reader to treat an
impossible outcome as an attainable one.

The extremes are kept, dated and demoted, with the regime named beside them —
deleting the upside while keeping the downside would be its own dishonesty.
`test/consult.test.js` fails if an extreme is ever reported without it.

### And what happens when you ask only about the modern regime

`--since 2013-Q3` cuts the record at TDSR. For a seven-year hold it **refuses**,
and that refusal is the finding:

> Cutting the record at 2013-Q3 leaves too few non-overlapping 7-year stretches
> to read. Four is the floor. There is not enough history since 2013-Q3 to say
> what a 7-year hold has done under that regime.

Twenty-four windows, 1.93 independent readings. **The honest answer to "what
does a seven-year HDB hold do under today's rules" is that nobody knows yet** —
and a tool that produced a number anyway would be inventing one.

### The horizon limit, named rather than hidden

`distribution()` requires four non-overlapping readings before it speaks. The
consequence is specific: **HDB's index begins in 1990-Q1, so it supports
seven-year stretches and not ten-year ones.** URA's begins in 1975 and supports
both. Asking for ten on an HDB flat returns a refusal that names the longest
horizon that works, because "cannot be read" reads as a broken tool while
"seven is the longest this index carries" is the next thing to run.

### What it will not do

It prints **no verdict and no adjective** — `test/consult.test.js` fails if the
words "good buy", "undervalued", "bargain" or "recommend" appear anywhere in
the output. The tool assembles the evidence; the view is Shervin's, and a
verdict in the output is both worse analysis and, the moment it reaches a
client, a rule 7 problem.

It also states what it cannot see, every time — that the index is a market and
this is one home, that facing and layout and renovation are in no public
dataset, that how many MOP blocks actually list is unknowable, and that policy
has moved this market more than any fundamental in the record above.

---

## 9. Does it hold in a market that moved?

`npm run backtest:rolling` · `lib/consult/history.js` · `scripts/backtest-rolling.mjs`

§3's figure is measured on the last six months, which is one market — a flat
one. It says nothing about the 2018 cooling measures, the 2020 circuit breaker
or the 2021–22 run-up, and those are the conditions under which a valuation is
most likely to be wrong and most expensive to be wrong about.

**The data was already being downloaded and thrown away.** `ingest-hdb.mjs`
fetches all 240,345 rows from 2017-01 and then filters to `monthsBack = 36`.
That filter is right for the site — older rows bloat the bundle — so
`--history` now writes the full record to `data/.hdb-history.json` (22MB,
gitignored, and in `outputFileTracingExcludes`, because the tracer reads the
disk and this repo has forgotten that twice).

### As-of by construction, not by a filter

The market is built **forward**. Each month is predicted first and only then
folded in, so a sale that has not been added cannot be seen. There is no
`month < asOf` comparison anywhere in the loop to get subtly wrong — which
matters, because that is exactly how the first backtest here nearly shipped a
leak.

### The result

5,255 predictions, sixteen half-years, 60 sampled per month:

| fold | n | MdAPE | within 10% | bias | HDB index |
|---|---|---|---|---|---|
| 2019 H1 | 326 | 3.85% | 89% | +0.2% | −0.2% |
| 2020 H1 | 328 | 3.47% | 88% | +0.5% | +0.3% |
| 2021 H2 | 337 | 3.54% | 90% | +0.3% | **+3.4%** |
| 2022 H1 | 343 | 3.49% | 92% | +0.1% | +2.8% |
| 2024 H2 | 345 | 2.74% | 95% | +0.4% | +2.6% |
| 2025 H1 | 343 | 2.73% | 95% | −0.1% | +0.9% |
| 2026 H1 | 347 | 3.24% | 91% | +1.1% | −0.3% |
| **ALL** | **5,255** | **3.27%** | **92%** | | |

**Worst half-year 3.85%, best 2.73% — a spread of 1.12pp across seven years**,
with bias never leaving ±1.1%. It holds through the run-up as well as the flat
stretch. The early folds are slightly worse because less history had
accumulated behind them, which is what you would expect and not a regime
effect.

### The leak that remains, bounded rather than argued away

`data/storey.json` is fitted on today's sales, so a 2019 prediction uses a
floor curve built partly from 2024. It is structural — what a floor is worth
inside a block moves far more slowly than the market — but it is information
from the future and calling it anything else would be dishonest.

So run it both ways. `--ablate floor` removes the leak entirely:

| | overall | spread across 16 half-years |
|---|---|---|
| with floor curve | 3.27% | 1.12pp |
| floor curve removed | 3.78% | 1.39pp |

**Same flat shape, no regime where either collapses.** The leak moves the
level, not the conclusion. It also does not inflate what the floor curve is
worth: 0.51pp here against 0.62pp measured on the recent window, where there is
no leak at all.

### What this run found

A **+54% median bias in 2019 decaying smoothly to zero at the present** — the
exact shape of the HDB index from 2019 to 2026. `quarterOf` took a string and
`estimate()` passes a **Date**, so it returned null, the cap in
`latestQuarter` fell through, and every historical valuation restated its
comparables into the newest quarter in the file. A 2018-Q4 comparable was being
multiplied by **1.54** to reach 2026-Q2.

Invisible in production, where `asOf` is today and the newest published quarter
*is* today's, so capping to it changes nothing. The existing test passed
because it only asked that the target not be in the future — which it never
was. **A guard that cannot fire in the environment you test in is a guard
nobody has tested**, and it is the second time in this file's history that a
bound which is correct live has been fatal looking backwards.

---

## 10. Where it is weakest — error by segment

`npm run backtest:rolling -- --by town,flatType,lease,price,confidence`

One national figure hides where the tool should not be trusted, which is
exactly what you need to know before opening your mouth in a living room.
7,887 predictions, 2019–2026. Segments under 40 predictions are withheld
rather than merged into a neighbour.

### By town — mature estates are hard, new towns are easy

| worst | MdAPE | bias | | best | MdAPE | bias |
|---|---|---|---|---|---|---|
| Clementi | 4.74% | +2.0% | | Sembawang | 2.56% | +0.2% |
| Central Area | 4.73% | −0.0% | | Punggol | 2.58% | +0.3% |
| Queenstown | 4.57% | +1.7% | | Sengkang | 2.78% | +0.3% |
| Ang Mo Kio | 4.52% | +1.1% | | Tampines | 2.85% | +0.3% |
| Toa Payoh | 4.46% | +1.0% | | Woodlands | 2.96% | +0.0% |

The pattern is not subtle and it is not geography. **Punggol, Sengkang and
Sembawang are homogeneous BTO stock** — one vintage, one lease, a handful of
layouts — so a cohort of twenty comparables really is twenty of the same
product. **Clementi, Queenstown, Ang Mo Kio and Toa Payoh have 1970s blocks
standing next to 2015 BTOs**, with SERS history, mixed models and leases forty
years apart. The cohort rules match on lease and type, but inside a mature town
what is left is still more varied than in a new one.

Note the **bias column**: the difficult towns all run +1.0% to +2.0%, and the
easy ones sit at zero. The AVM **over-estimates in mature estates.**

### By lease remaining at the sale

| segment | n | MdAPE | within 10% | bias |
|---|---|---|---|---|
| under 60y | 1,537 | **4.13%** | 87% | **+1.2%** |
| 60–70y | 1,833 | 3.28% | 92% | +0.4% |
| 70–80y | 1,600 | 3.16% | 94% | +0.1% |
| 80–90y | 990 | 2.87% | 94% | +0.4% |
| 90y+ | 1,927 | 2.94% | 94% | +0.6% |

Monotone, and it is the same finding as the towns wearing different clothes:
short leases cluster in mature estates. **The AVM is least accurate and
slightly optimistic exactly where lease decay bites hardest** — which is the
segment where a buyer most needs it to be right. Worth saying out loud before
quoting a number on a sub-60-year flat.

### By price band

| segment | n | MdAPE | bias |
|---|---|---|---|
| 1m+ | 192 | **4.04%** | **−2.2%** |
| under 400k | 1,781 | 3.59% | +1.3% |
| 400–600k | 3,312 | 3.09% | +0.3% |

The million-dollar tail is **under-called by 2.2%**. That is the classic
comparable-method failure: a weighted median of a cohort regresses toward the
middle of that cohort, so the top of the market is systematically shaded down.
If you are pricing a million-dollar flat, the tool will tend to come in low and
you should say so rather than quoting it flat.

### By flat type

2 ROOM 2.71% · 4 ROOM 3.04% · 5 ROOM 3.40% · 3 ROOM 3.51% · EXECUTIVE 3.54%.
A narrow range, and the two ends make sense: 2-room stock is nearly all new and
uniform, executives are rare and varied.

---

## 11. The confidence gate

A confidence label that does not predict accuracy is decoration, and worse than
none — it puts a number on a hunch and invites a reader to trust the tight
ones. So it is a **pass/fail**, not a table.

Graded on 7,887 predictions from 2019–2026, while `data/avm-error.json` was
built on the most recent months only — **out of sample in time as well as in
address**:

| band | n | actual MdAPE | under predicted p90 | under predicted median |
|---|---|---|---|---|
| tight | 3,806 | **2.76%** | 91.0% | 47.2% |
| workable | 4,081 | **3.84%** | 89.3% | 47.6% |

**Ordering PASS** — a tighter band really is more accurate, by 1.08pp.
**Coverage PASS** — each band's predicted p90 contains 89–91% of its own
outcomes, against a 90% target.

Two honest notes. The "under predicted median" column sits at ~47% rather than
50%, so the table's median is **slightly optimistic — about 3pp too tight**.
Small, and in the direction that matters least, but it is there.

And **no lookup in seven years of HDB landed in the `wide` band.** That is not
a bug: `wide` begins at a p90 of 15% and HDB's worst bin is 13%. HDB is simply
more predictable than private, where the p90 reaches 27.85%. It does mean the
three-word scale is a two-word scale on HDB, and a reader should not read
"workable" as the middle of three when it is in practice the bottom of two.

**If either check ever fails, recalibrate before the label is shown to anyone.**
The script prints that instruction rather than leaving it to judgement.
