# Hand-curated amenity sources

Two amenity layers have no government dataset behind them, so they live here
as hand-maintained files. Both are **optional** — leave them as empty arrays
and the site simply does not show that layer. That is a supported state, not a
broken one.

Entries need a `name` and nothing else. `npm run ingest:amenities` runs each
name through OneMap and attaches the coordinate, which is more reliable than a
lat/long typed by hand. Add `street` when a name is ambiguous. Add `lat`/`lon`
yourself only for a place OneMap does not know — an unbuilt station, usually.

An entry OneMap cannot place is skipped with no fuss. Nothing here can put a
wrong point on the map silently.

---

## `rail-future.json` — stations not yet open

Merged into the rail layer. A station already present in the government layer
wins, so there is no harm in listing one twice.

```json
[
  { "name": "Example MRT Station", "line": "CRL", "status": "Under construction", "opening": "2030" }
]
```

| field | meaning |
|---|---|
| `name` | as LTA writes it |
| `line` | line code — `CRL`, `JRL`, `TEL`, … |
| `status` | shown verbatim on the page. Use LTA's own word: `Announced`, `Under construction` |
| `opening` | target year, as LTA published it |

**This file ships empty on purpose.** Populating it from memory would put a
station opening year on a public page with nothing behind it — the same
mistake the MOP tracker was built to avoid, and a breach of the rule that
every derived figure renders its source. Fill it from LTA's own announcement
pages, and treat `opening` as a target, never a promise. The page labels every
one of these "announced, subject to change" for exactly that reason.

## `malls.json` — shopping malls

No agency publishes a mall register. Names alone are enough.

```json
[
  { "name": "Junction 8", "street": "BISHAN PLACE" }
]
```

Worth keeping short. A neighbourhood mall people actually walk to is useful;
every retail podium in Singapore is noise.

---

## `gls-programme.json` — Government Land Sales sites

Feeds Blindspot's GLS check. **This one is different from the two above** and
the difference matters.

`data.gov.sg has no residential GLS dataset.` The whole catalogue was searched —
463 pages — and the only Government Land Sales layer is *Industrial Government
Land Sales - Sites*: 166 features carrying LOT_NO and nothing else. No unit
yields, no launch dates, no residential sites, last updated 2017. URA publishes
the real programme half-yearly on its own site, so this is transcribed by hand.

```json
{
  "programme": "2026 H2",
  "enteredAt": "2026-08-28",
  "enteredBy": "Shervin Poh",
  "sites": [
    { "name": "Dairy Farm Walk", "street": "DAIRY FARM WALK", "units": 380,
      "status": "Confirmed List", "launchDate": "2026-09" }
  ]
}
```

| field | meaning |
|---|---|
| `programme` | the half-year, `YYYY H1` or `YYYY H2`. **Required**, and it is printed on the page beside every finding |
| `name` | as URA writes it. Run through OneMap, like the other two files |
| `street` | add when the name alone is ambiguous |
| `units` | URA's indicative yield. Leave it out if none is published — the site still shows, counted as no units, never as a guess |
| `status` | `Confirmed List` or `Reserve List`, URA's own word |
| `launchDate` | as published |

### Why an empty file is safe and a stale one is not

A missing mall is a missing dot. A missing GLS site is a check reporting
**"No GLS site within 1km"** — and a reader takes that as a finding rather than
as a gap. That is absence of evidence reading as evidence of safety, which is
the failure the whole rubric exists to avoid.

So `npm run ingest:gls` is stricter than the other ingests:

- **Empty `sites` deletes `data/gls.json`.** The check then does not run and the
  page says so. That is the correct state and it is how this ships.
- **A programme older than the current half is refused, not warned about**, and
  the script exits non-zero. A stale list is worse than none because it looks
  current.
- **If nothing geocodes, no file is written.** An empty `sites` array on disk is
  a trap for the next person.
- Every finding names its programme — `(2026 H2)` — because "no GLS site within
  1km" is not a claim anyone can check, and "none in the 2026 H2 programme" is.

**Update it every URA announcement.** This is the one file on the site that goes
stale on a calendar rather than on a feed.
