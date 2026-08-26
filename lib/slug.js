/**
 * URL slugs. These appear in public URLs and in the sitemap, so they must stay
 * stable across rebuilds — never change how this function works without a
 * redirect map, or every indexed page 404s.
 */
export function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Which shard file holds a record. Derived from the URL itself, so resolving a
 * page never needs a lookup table — it reads one ~300KB file, not the lot.
 */
export const shardOf = {
  hdb:    town => `hdb/${slugify(town)}`,
  condo:  slug => `condo/${/^[a-z0-9]/.test(slug) ? slug[0] : '_'}`,
  landed: slug => `landed/${/^[a-z0-9]/.test(slug) ? slug[0] : '_'}`,
};

export const hrefOf = {
  hdb:    (town, block, street) => `/hdb/${slugify(town)}/${slugify(block + ' ' + street)}`,
  condo:  project => `/condo/${slugify(project)}`,
  landed: street => `/landed/${slugify(street)}`,
  town:   town => `/hdb/${slugify(town)}`,
};
