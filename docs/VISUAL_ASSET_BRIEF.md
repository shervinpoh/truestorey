# Brief: a rendered editorial asset system for Truestorey

Paste everything below the line into ChatGPT. It is written to be read cold by
a model that has never seen the site.

---

## What you are building

I run **Truestorey**, an editorial-first Singapore property site. It publishes
under a licensed agent's registration number (CEA Reg. No. R066925H), which is
why several of the constraints below are absolute rather than stylistic.

Every article currently gets a stock photograph from Unsplash, chosen by
subject. That is being replaced, for the ten subjects listed below, with
**rendered 3D assets I own**. I want you to help me design and build them in
Blender, with a repeatable headless render script, using Codex to write the
scene and the script.

## Why this is worth doing, and what would make it stand out

Every property site in Singapore is illustrated from the same pool. Marina Bay
at golden hour, a skyline at dusk, a generic condominium pool deck. PropNex,
Stacked, EdgeProp and the portals are visually interchangeable, and buying
better stock photography does not fix that, because they can buy the same ones.

Three things a rendered system gives me that stock cannot:

1. **It carries the palette.** A photograph can never be `#164F52`. A render
   can be built from the site's own colours, so the images stop being foreign
   objects pasted into a design and become part of it.
2. **It stays coherent as the archive grows.** The desk files most mornings. A
   stock-photo archive drifts into incoherence by article fifty. Ten owned
   assets still look like one publication at article five hundred.
3. **Nothing foreign can get into the frame.** This is not hypothetical. In one
   week the stock picker returned a US federal tax return with a flag printed
   on it for a piece on Singapore stamp duty, and a street in Myanmar with the
   sign in Burmese script for a piece on a land tender. Neither photograph's
   metadata mentioned a country. The country was *in the picture*, where no
   automated check can see it. A render has no country in it unless I put one
   there.

The bar: someone should be able to recognise a Truestorey article from the
image alone, the way a pink page reads as the FT. Not a logo. A visual grammar.

## The ten assets

These map onto subjects that already exist in my code. One asset each, ideally
two variants each so consecutive articles on the same subject differ.

| id | the article is about | honest object |
|---|---|---|
| `sun` | which way a unit faces, afternoon light | light falling across a surface |
| `bto` | new flats, waiting periods, completion | scaffold, crane, formwork |
| `land` | government land sales, tenders, awards | earth, a cleared site, plant |
| `enbloc` | collective sale, redevelopment | packed boxes, an emptied room |
| `launch` | new launches, developer pricing | a model, a drawing, drafting tools |
| `tax` | stamp duty, ABSD, decoupling | a contract, a pen, a signature |
| `lease` | freehold vs 99-year, lease decay | keys, a lock, ageing material |
| `rent` | rental yields, landlords, tenancies | keys on a surface, a door handle |
| `floor` | high floor premiums, stacks | a railing, a stairwell, a window frame |
| `money` | loans, CPF, affordability | ledger, coins, a desk |

Two subjects are deliberately **not** on this list — anything about Singapore
public housing or the market as a whole keeps a real photograph, because those
pieces are about a real place and a render cannot honestly claim to be it.

## Rules that cannot be broken

**1. No identifiable real property, ever.** This is the hard one. My site rule
is "never draw geometry the data does not contain". A generic building is fine.
*That* building is not. Nothing may read as a depiction of a specific project,
block, plot or address. No massing studies, no site plans, no stack plans, no
floor plans tied to anywhere real. The test: could a reader point at it and ask
which development that is? If yes, it does not ship.

**2. Nothing in the frame that names a country.** No signage, no readable text
in any script, no flags, no currency, no number plates, no recognisable
landmark. This is the failure the whole project exists to stop.

**3. No people's faces.** Hands are acceptable. Faces are not.

**4. No text in the image at all.** Captions live in HTML where a screen reader
can reach them.

**5. It must not look like marketing.** No lens flares, no golden-hour warmth
pushed for mood, no aspirational lifestyle staging, no pool decks. Restrained,
material, slightly cool. The site's whole position is that it is the sober
alternative to the portals.

## The site has two grounds, and this is the hardest constraint

As of 12 September the reader chooses light or dark and the site remembers it.
Both are real, both are in use, and **every asset has to work on both without
being rendered twice.**

That rules out the obvious approach. A subject floating on a pale background
looks correct on the light theme and blazes like a lightbox on the dark one.
Two variants per subject doubles the work and doubles the drift.

So the rule is:

**Fill the frame, edge to edge, like a photograph.** No floating object on a
backdrop that has to match the page. If the image is an opaque rectangle, the
page's ground never shows through it and the theme becomes irrelevant.

**Hold the value in the middle.** No blown whites, no crushed blacks. Target
roughly 25–70% luminance across the frame. A light-key render sits badly on
`#0B0D0F` and a dark-key one disappears into it; a mid-key render is at home on
either. This is the single art-direction decision that makes the set work.

**Do not colour-match the page.** Trying to blend the asset into `#F6F5F2`
guarantees it clashes with `#0B0D0F`. Let it read as an image sitting on a
page, not as part of the page.

## The palette

Light ground — the default:

```
--paper   #F6F5F2   warm off-white
--sunk    #EFEEE9   a recessed surface
--card    #FFFFFF
--line    #E2E0D9   hairlines
--ink     #111414   near-black
--ink2    #48514F
--mute    #666E6A
--acc     #164F52   deep teal — the interface colour, used sparingly
```

Dark ground — the reader's other choice:

```
--paper   #0B0D0F
--sunk    #15181B
--card    #121517
--line    #232830
--ink     #ECEEF0
--ink2    #AFB6BD
--mute    #79828B
--acc     #22D3DD   the accent SHIFTS between themes — it is not one colour
```

Build materials from the neutral ramp rather than from either ground:
`#111414 #5A625F #7B837F #B6BAB6 #DAD8D2`. Those mid values are what survive
the flip.

**Do not use `#58BCC3` or `#22D3DD` decoratively.** Both are reserved on this
site for data that is live or selected, and spending them on an illustration
breaks the one rule that keeps the accent meaningful. A trace of teal as a
material colour is fine; teal as the subject is not.

Reserved and off-limits in these images on both grounds: green (`#1E7A5F`
light, `#4BBD8D` dark) and red (`#AE4736` light, `#E8836A` dark). They mean a
price that moved and a dataset that could not be measured.

## Technical output

- **Master render: 2400 × 1350** (16:9), rendered, then delivered downscaled.
- **Delivered: 1600 × 900**, as **AVIF** with a **WebP** fallback.
- Under **120 KB** each after encoding. These sit above the fold.
- The composition must survive a **centre crop to 4:3** and to **1:1**, because
  the same file is used as a 120 px thumbnail. Keep the subject centred and
  away from the edges.
- Naming: `subject-<id>-<variant>.avif` / `.webp`, e.g. `subject-lease-a.avif`.
- **Check every render on both `#F6F5F2` and `#0B0D0F` before calling it done.**
  Drop it on each ground at 1600px and at 120px. If it only works on one, it is
  not finished, and the fix is the value key rather than a second render.

## The render script — this matters as much as the images

I do not want ten hand-made one-off files. I want a pipeline I can re-run when
the palette changes or when I add a subject.

- One `.blend` per subject, or one scene with swappable collections.
- A headless Python script driven from the command line:
  `blender -b scenes/lease.blend -P render.py -- --variant a --out out/`
- **Deterministic.** Fixed seed, fixed camera, fixed sample count. Re-running
  must produce the identical file, or the pipeline is not repeatable.
- Colours read from **one config file**, not typed into each scene, so a
  palette change is one edit and a re-render.
- The `.blend` files, the Python and the config all get committed.

## What to give me back

1. A short visual direction for the set: lighting model, camera discipline,
   material vocabulary, and what makes the ten read as one family.
2. Two or three concrete concepts per subject, in words, before any rendering.
3. The Blender scene structure and the render script.
4. One subject rendered end to end as a proof, so I can see it before you build
   the other nine.

Start with `lease` and `land`. Between them they cover the two extremes: a
close-up object on a plain ground, and something with depth and environment.
Show me each one sitting on both page grounds, not just the render.

## A note on GPT Image

I had assumed images could feed into Blender as a pipeline stage. They cannot.
Raster output is not geometry or materials. Use generated images as reference
to look at while writing the scene, or bake them in as textures and backplates,
but do not plan a handoff that has to pass an image into a scene description.
