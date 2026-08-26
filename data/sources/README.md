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
