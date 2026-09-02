# Images

Drop files here. Reference them from a post's frontmatter:

```yaml
---
title: What the resale index did this quarter
image: /images/2026-09-rpi.png
imageAlt: The HDB Resale Price Index by quarter, with the latest reading picked out
imageCredit: Shervin Poh          # omit for generated illustrations
---
```

`imageAlt` is not optional. A post with an image and no alt text fails the
build check in `npm run images`, because an unlabelled image is invisible to a
screen reader and to Google.

## Naming

`YYYY-MM-topic.ext` — dated, lowercase, hyphenated. It keeps the folder
sortable and stops two posts fighting over `hero.png`.

## Three kinds, in order of how well they work

1. **Your own photography.** The estate, the block, the view from the unit.
   This is the only one nobody else can produce, so it is worth the most.
   Shoot 3:2 landscape where you can.
2. **Data graphics.** Charts drawn from the datasets. Best for anything where
   the story IS the number, and they carry your CEA watermark automatically.
3. **Generated illustration.** For abstract topics — policy, rates, timing —
   where there is nothing real to photograph.

Generated images are for illustration only. Do not use one where a reader
could take it for a photograph of a real property, and never for a person
presented as a real client. An invented face beside a testimonial is a
fabricated endorsement whatever the caption says.

## Sizes

Header images render at 1200px wide. Anything above ~1600px is wasted bytes;
`npm run images` warns when a file is over 400KB.
