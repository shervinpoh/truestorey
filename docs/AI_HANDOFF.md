# AI handoff — Truestorey

Current as of the commit named below. Kept short on purpose: this is the state
of play, not a transcript. Overwrite it, do not append to it.

---

## Goal

"The Living Property Atlas" — the visual redesign brief. Direction **02, Warm
Ledger**, chosen by Shervin from three rendered options.

The two documents that disagree, and how it was resolved:

- The brief specifies `#58BCC3` on cool paper `#F7F9F8`, which is a refined
  version of the palette Shervin had just rejected.
- Direction 02 is a **warm** neutral with a deep teal and no bright cyan.

Resolved as: 02's warm ground `#F6F5F2`, the brief's deep teal `#164F52` as the
primary interface colour, and `#58BCC3` demoted to live/selected data only —
which is what the brief itself asks for when it says "use teal selectively".
The one deliberate departure from the brief is **warm paper over cool paper**.
Flagged to Shervin, not yet overruled.

## What was implemented — Phase 1

Visual foundation, homepage hero, and the first of four "wow" moments.

- **Tokens.** New palette, a two-value radius scale (`--r1 3px`, `--r2 8px`), a
  warm-tinted elevation token. The global `border-radius:0` reset is gone.
- **Type.** Archivo (variable, `wdth 88` for semi-condensed headings) +
  Source Sans 3 + IBM Plex Mono, replacing Schibsted Grotesk + DM Mono.
- **Wow #2 — the living island.** Land settles, then shading crosses the
  country west to east, ~1.49s end to end. Ordered by longitude so it reads as
  one wave rather than as loading.
- **Homepage hero.** Asymmetric: claim, search and proof left; island right.
- **Map ramp** re-cut to run from the palette's data mist to its deep teal.

## Files changed

```
app/globals.css          tokens, type, hero, island animation, search
app/layout.jsx           font links (Archivo wdth axis must be requested)
app/page.jsx             asymmetric hero, proof list replaces the trust strip
components/IslandMap.jsx staggered reveal, `compact` prop for the hero
components/PriceMap.jsx  ramp + canvas label font
CLAUDE.md                styling rules rewritten; the old four are retired
docs/AI_HANDOFF.md       this file
```

## Functional behaviour preserved

No routes, data reads, calculators, business logic or anchor navigation were
touched. `/compare`, the section nav, the two-column planner, the property
strip and the lead-form swap all behave as they did before.

## Checks performed

- `npm test` — 137 pass.
- `npx next build` — clean, with `next dev` stopped first (they share `.next`).
- Rendered at 1440px and 390px.
- **The brief's hard requirement, verified explicitly:** the homepage search
  takes focus while the island is still animating (`playState: running`).
  The animation never gates interaction.
- Animation wiring confirmed in the DOM: 55 paths, 24 shaded, `ilit` 0.62s,
  delays 0.05s → 0.867s.

## Known limitations

- **No photography.** The brief's imagery strategy is a large part of it and
  none of it is implemented: there is no Singapore architectural photography in
  the repo, and the brief correctly forbids generic or AI imagery standing in
  for a named block. This needs Shervin to supply images. What can be built
  from data instead: locator maps, block-number compositions, silhouettes.
- **Phases 2–4 not started** — the remaining three wow moments: numbers that
  arrive on scroll, View Transitions between pages, and the map in 3D
  (`max_floor_lvl` on `ingest-mop.mjs`, then honest HDB columns).
- Per-page direction from the brief (town pages, insights, map page) is
  untouched. Only the foundation and the homepage were in scope for Phase 1.
- `/map` is 296KB gzipped, pre-existing. Worth knowing before 3D lands on it.

## Recommended review focus

Visual hierarchy of the new hero at 1024px, which was not captured. Whether
warm paper or the brief's cool paper is right.

Contrast was checked and one value was wrong: `--mute` started at `#7B837F`,
which is **3.57:1** on `#F6F5F2` — a WCAG AA failure on `.prov` and `.lab`, the
10px lines that carry the source and period CEA PG 02-11 s3.1 requires. It is
now `#666E6A`, 4.81:1. Every other token passes: `--ink2` 7.51, `--acc` 8.47,
`--ink` 16.99. Re-check this whenever the ground colour moves.
