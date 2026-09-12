import { subjectFor } from './photo.js';

// Only inspected, local illustrations belong in this manifest. A place-led
// article keeps its photograph: these objects never stand in for an address.
const ASSETS = {
  lease: { alt: 'Editorial illustration: two worn metal keys on a stone surface.', maker: 'Blender' },
  land: { alt: 'Editorial illustration: an unbranded spade resting on textured earth.', maker: 'Blender' },
  sun: { alt: 'Editorial illustration: daylight crossing a concrete window reveal.', maker: 'GPT Image' },
};

export function editorialAsset(subject) {
  const asset = ASSETS[subject];
  if (!asset) return null;
  return {
    image: `/editorial/subject-${subject}-a.webp`,
    imageAvif: `/editorial/subject-${subject}-a.avif`,
    imageAlt: asset.alt,
    imageCredit: `Truestorey · ${asset.maker} editorial illustration. Does not depict an actual property or site.`,
    credit: null,
    illustration: true,
  };
}

export function withEditorialAsset(post) {
  if (!post) return post;
  const subject = subjectFor(`${post.title || ''} ${post.slug || ''}`, (post.tags || []).join(' '));
  const asset = subject.lane === 'thing' && editorialAsset(subject.id);
  return asset ? { ...post, ...asset } : post;
}
