# The consult panel — how to run it and what each page is for

Internal. Runs on your Mac, never deployed. See `docs/CONSULT_BRIEF.md` for the
boundary that keeps it off truestorey.vercel.app, and `docs/AVM_METHOD.md` for
how the numbers are produced.

---

## Starting it

```
npm run consult
```

It prints two addresses:

```
this machine   http://localhost:4173
your phone     http://192.168.1.74:4173   (same wifi)
```

**Read the phone address off that line each time — it changes.** It is your
Mac's address on the wifi and your router reassigns it.

It runs until you press Ctrl-C or close the terminal. It has no login and is
reachable by anything on your wifi, which is deliberate so your phone can open
it at a viewing. Do not forward the port, tunnel it, or put it on a public
network: it serves point valuations, which is the thing rule 2 keeps off the
site.

---

## The five pages

### Valuation — one home you have in mind

Type an address, pick it from the list. **Flat type, floor area and storey fill
themselves in** from that block's filed sales — the storey offered is the
block's median, so change it to the actual unit. Add an asking price to get the
three tests.

The report has six parts: the indicative range, **how wrong it is likely to
be** (measured over held-out sales, not asserted), the three tests against the
asking price, what the property has going for it, a seven-year hold, and every
comparable with what each adjustment did to it.

Two collapsible calculators sit under the form and pre-fill from the asking
price: **Can they afford it?** (TDSR, MSR, LTV, the stress rate, cash needed)
and **What would a seller clear?** (the CPF refund with accrued interest is the
figure sellers are most often wrong about).

**Client-safe** removes the point estimate and keeps the range and the
comparables — the shape rule 2 permits on anything that leaves your screen.
**Export as PDF** prints without the form. **Download this report** saves a
self-contained HTML file.

### Scan — where to farm

Every HDB block priced twice, once on its own filed sales and once on its
neighbours', with what visible risk explains already stripped out. Filter by
town, switch between the three columns. **Click a row** and it opens on
Valuation with that block loaded.

Built by `npm run scan`, which takes a few minutes over ~9,500 blocks. The page
shows when it was built and says so when it is behind the data.

**It is a farming list, not listings.** A block trading below its neighbours is
somewhere to look, not something for sale.

### Find — screen listings

Two ways in.

**Paste box.** Copy the details off a listing you are looking at and paste
them — a link, the text, or both. Blank line between listings for several at
once. *Read them* parses and shows an editable table; *Screen them* runs on
what is in the table **after** your corrections.

**Your feed**, once a listings export has been imported on the Data page: what
has been cut, what has been sitting, and for how long.

A listing reaches the shortlist only if **both** halves pass — an unexplained
discount that survives the method's own error, and a positive score. Cheap and
bad is a bad flat at its correct price.

### Compare — up to four, side by side

Estimate, range, **typical error**, cohort size, verdict against an asking
price, and every scoring factor. Each column is priced on its own evidence;
nothing is averaged across them.

### Data — add exports, and see what everything is running on

**Add an export:** pick Listings or REALIS, drop CSVs, press *Check it*.
Nothing is written until you have seen how your columns were read, which were
not used, what could not be matched, and what the import would do.

For listings you must say what the file covers. There is no default:

- **Everything I watch** — a full sweep. Anything you already had that is not
  in the file is marked **gone**.
- **Only part of it** — one town, one saved search. Nothing is marked gone.

Get that wrong on a filtered export and listings disappear in a way that looks
exactly like the market moving. The preview shows the consequence both ways
before you choose.

**What the tools are running on** lists every dataset with its age and whether
it is stale. The scan is stale if it was built before the sales data it ranks
was last refreshed; the error table is stale if it measured a different version
of the AVM than the one running.

---

## The rhythm

| when | do |
|---|---|
| a listing lands | Valuation, with the asking price |
| "should I hold or sell?" | Valuation → *Holding it N years* |
| weekly | Data → import the export · Find → shortlist |
| monthly | `npm run scan`, then the Scan page |
| after any data refresh | `npm run build:avm-error` |

---

## Command line, for the jobs a web page should not wait on

```
npm run scan                          the island scan (minutes)
npm run build:avm-error               rebuild the confidence table
npm run backtest                      accuracy on recent sales
npm run backtest:rolling              accuracy across 2019-2026
npm run ingest:listings -- --full     same import, from data/listings/
npm run ingest:listings -- --partial
npm run ingest:realis                 rebuild from data/realis/
npm run ingest:pipeline               URA development pipeline
npm run avm -- --q "…" --sqft … --price …     the report, as text
npm run outlook -- --href … --years 7
```

**Anything that changes the estimator means rebuilding the error table.** It
records which version it measured, so a stale one is reported rather than
quoted — but it will not fix itself.

---

## What it cannot do yet

- **The listings feed needs an export.** The paste box works today; the feed
  page is empty until a CSV is imported.
- **REALIS data is stored but unread.** Importing it changes no estimate. The
  stack analysis is the next build.
- **Blindspot is on hold** pending the PropNex/Huttons data.
- **Nothing here is on your phone unless your Mac is on** and the panel is
  running.
