# Agency work — brief for a separate chat

Everything here is **for Shervin's own practice, not for truestorey.vercel.app**.
The site is editorial and free-to-use; it publishes data under a CEA
registration and is bound by the rules in `CLAUDE.md`. The work below is
marketing and client work, which is a different job with different constraints,
and mixing the two is how the site loses the thing that makes it worth trusting.

Hand this file to a new chat as the starting context.

---

## 1. What already exists and works

### Blender render pipeline — `scripts/render/layout.py`

Takes a JSON spec of a flat and renders a furnished doll's-house turntable.
Proven on a real unit: 16 frames, 8KB an AVIF frame, 576KB for a whole
rotation. Blender 5.2.1 LTS at `/Applications/Blender.app/Contents/MacOS/Blender`,
headless, writes AVIF and WebP itself so no converter is needed.

```
blender -b -P scripts/render/layout.py -- \
    --spec data/layouts/traced-unit-a.json \
    --out public/layouts/unit-a --frames 16 --samples 48 --width 1400
```

**Six bugs were fixed to get it working. Do not re-introduce them:**

| Symptom | Cause |
|---|---|
| Black silhouette | The extrusion translated vertices it had not selected, so every face had a coincident twin |
| Black walls | Room edges keyed whole, so partial overlaps each drew a full wall — 15 overlapping pairs of 41 |
| Black walls again | Hand-traced edges miss by up to 27cm; they must be snapped onto shared lines |
| A wall through the master bedroom | An L-shaped room is several boxes and needs a `group`, or the seam between them is drawn as a partition |
| A warning on correct work | The door cross-check used a flat 8% band; a 33px door carries ±12% noise on its own |
| A picture of nothing | The palette sat inside an 18-point luminance band and half the frame came back within 0.4 points of itself |

**The rules that came out of it:** heights zero-based against the figure, never
mapped from a range. Light from the camera's side, offset about 35°. Never
simplify geometry to fix a shading artefact. Values need a measured ladder,
about ten points a rung, walls brightest and ground mid.

### Tracing — `scripts/render/trace.html`

Opens off disk, no server. Drop a plan in, type the unit's area, drag a box per
room. Solves metres per pixel as `sqrt(stated area / traced area)`. About
fifteen minutes for a plan.

### Detection — `scripts/render/detect-walls.py` and `lib/planparse.js`

Finds walls and rooms automatically, in about two seconds. On a real HDB plan:
three bedrooms and the kitchen correct, both bathrooms found as one region, the
main bedroom wrongly merged with the living room. Roughly half usable.

---

## 2. What to build for the agency

### 2.1 Listing renders

The highest-value use. A listing you market gets a 3D turntable nobody else's
listing has. The pipeline exists; what is missing is the routine around it —
a folder per listing, a naming convention, and the twenty minutes of tracing.

**Worth testing first:** whether a *furnished* render or an *empty* one sells
better. The empty one is more honest about a resale flat you have not seen;
the furnished one answers "will my life fit", which is the question. Possibly
both, as a before/after.

### 2.2 Renovation proposals

Blender can show the same unit with a wall removed, a kitchen reconfigured, a
different layout. **This is the thing rule 13 forbids on the site and is
completely legitimate here**, because a proposal labelled as a proposal is what
an agent and an ID are paid to produce.

Two hard constraints that are not editorial preferences:

- **HDB publishes which walls may be removed.** A proposal that takes down a
  structural wall is not a rendering problem, it is an offence. Any renovation
  render must be checked against HDB's approved demolition list for that flat
  type, and the render should say it has been.
- **Label every proposal as a proposal**, in the image and in the caption. A
  photoreal render of a flat that does not exist, sent to a buyer, is the kind
  of thing that ends up in front of CEA.

### 2.3 Sun and shadow studies

`lib/sun.js` computes solar position for any latitude and date from the
Astronomical Almanac's low-precision algorithm. On the site it can only say
where the sun IS, never what it falls on, because the repo holds no building
geometry. **For a property you have measured, that limit disappears.** A real
shadow study of a real unit, from real lat/long, is a genuine deliverable and
the site cannot produce one.

Note the honest finding for Singapore: on a due-west facing the sun's arrival
bearing swings about 45° across the year — roughly 248° in December to 293° in
June, dead-on at the equinoxes. Nobody can picture that, which is why a render
is worth more than the number.

### 2.4 Walkthroughs and video

Blender does animation. A camera path through a measured unit is a deliverable
no listing portal offers. Deferred until the still renders are routine — video
is a large payload and a large time cost, and a turntable already answers most
of what a buyer wants.

---

## 3. Lead generation and CTA — the honest version

**The mechanic that fits what has been built:** *send us your floor plan, get a
3D model back.* The reader uploads a plan, you trace or correct it, they get
something genuinely useful, and you have a lead who handed you their unit and
their intent. The manual cost is not a blocker — it is the product.

The site now has a browser-side version at `/floorplan` that needs nobody in
the loop, which is the free tier. The agency offer is the corrected, verified,
properly rendered version.

**Constraints that are regulatory, not stylistic. These do not relax for
marketing:**

- **Consent is per-channel and optional** (PDPA s14(2)). Bundled consent is
  void. The site has been email-only since 24 Aug 2026 — no phone, no WhatsApp
  off a web form.
- **An inbound message is not consent.** Only an explicit ticked box is.
- **`DNC Checked` is never auto-filled.** It reflects a real check or nothing.
- **No "undervalued", "best deal", "expert", "specialist"** in any copy, CEA
  advertising guidelines.
- **Never publish a single valuation number.** Ranges with the comparables
  shown. A percentile is fine; a verdict on price is not.
- **Every derived figure carries its source and period** (CEA PG 02-11 s3.1).

**Still open on the site side and blocking lead capture:** `addContactsBulk_`'s
field names, in `05_Actions.gs` or `06_Import.gs` of the Apps Script. Until
those are known, `lib/crm.js` posts the wrong shape and `CRM_WEBHOOK_URL` must
stay out of Vercel.

**Also outstanding:** three secrets were pasted in plain text in chat on
13 Sep 2026 — `WA_WEBHOOK_KEY`, `MAKE_SECRET` and the Apps Script exec URL.
They should be rotated.

---

## 4. What NOT to bring across

- **Rule 13 stays on the site.** Never draw geometry the data does not contain.
  Agency renders of measured properties are exempt; anything that would appear
  on truestorey.vercel.app is not.
- **Three npm dependencies.** The site is `next`, `react`, `react-dom` and
  nothing else. Agency tooling can use whatever it likes, but it lives outside
  the site's build.
- **Never run `next build` while a dev server is up**, and never
  `git commit -a` or `git add -A` in this repo. A push to master is a deploy.
