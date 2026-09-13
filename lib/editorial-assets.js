import { subjectFor } from './photo.js';

// Only inspected, local illustrations belong in this manifest. A place-led
// article keeps its photograph: these objects never stand in for an address.
/**
 * `variants` is the letters that exist on disk for this subject, and it is the
 * whole of the duplicate fix.
 *
 * ── WHY TWO ARTICLES SHOWED ONE PICTURE ────────────────────────────────────
 * This returned `subject-<id>-a` unconditionally, so every article about a
 * land tender got the identical image. Two of them ran consecutively on
 * /insights and it looked like a bug, because it was one: an editorial page
 * whose entries are visually interchangeable says the entries are
 * interchangeable.
 *
 * A subject with one variant still repeats. That is not something code can
 * fix — it needs a second render. What this does is make dropping
 * `subject-land-b.webp` into public/editorial and adding 'b' here the whole
 * of the work.
 */
const ASSETS = {
  lease: { variants: ['a'], alt: 'Editorial illustration: two worn metal keys on a stone surface.', maker: 'Blender' },
  land: { variants: ['a'], alt: 'Editorial illustration: an unbranded spade resting on textured earth.', maker: 'Blender' },
  sun: { variants: ['a'], alt: 'Editorial illustration: daylight crossing a concrete window reveal.', maker: 'GPT Image' },
};

/* Deterministic, not random. The same article must show the same picture on
   every render, or the image changes under a reader on a revalidate and the
   page looks unstable. Hashing the slug spreads articles across the variants
   without any of them moving. */
/* ── THE LOW BIT IS THE TRAP, NOT THE HASH ────────────────────────────────
   Two hashes failed here before this one worked, and both failed the same way.
   `h % variants.length` reads the LOW bits, and every multiplicative hash —
   h*31+c and FNV-1a alike — multiplies by an odd constant, which preserves
   parity. So with two variants the result is decided by whether the slug's
   characters happen to sum odd or even, and five real article slugs went to
   the same variant both times.

   Taking the high bits is the fix. The test proves the spread against a
   two-variant manifest rather than the live one, which has a single variant
   of each and would pass either version vacuously. */
const pick = (slug, variants) => {
  if (variants.length < 2) return variants[0];
  let h = 0x811c9dc5;
  for (const c of String(slug)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return variants[(h >>> 16) % variants.length];
};

export function editorialAsset(subject, slug = '') {
  const asset = ASSETS[subject];
  if (!asset) return null;
  const v = pick(slug, asset.variants);
  return {
    image: `/editorial/subject-${subject}-${v}.webp`,
    imageAvif: `/editorial/subject-${subject}-${v}.avif`,
    imageAlt: asset.alt,
    imageCredit: `Truestorey · ${asset.maker} editorial illustration. Does not depict an actual property or site.`,
    credit: null,
    illustration: true,
  };
}

export function withEditorialAsset(post) {
  if (!post) return post;
  const subject = subjectFor(`${post.title || ''} ${post.slug || ''}`, (post.tags || []).join(' '));
  const asset = subject.lane === 'thing' && editorialAsset(subject.id, post.slug || post.href || '');
  return asset ? { ...post, ...asset } : post;
}
