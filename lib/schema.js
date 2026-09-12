/**
 * Structured data — what this site is, in a form a machine can read.
 *
 * ── WHY IT MATTERS MORE HERE THAN ON MOST SITES ────────────────────────────
 * An AI answer engine cites a source when it can extract a claim, see where
 * the claim came from, and tell how old it is. This site already does the hard
 * half of that in prose: every derived figure renders its source and its
 * period, because CEA PG 02-11 s3.1 requires a market claim to be
 * substantiated. The compliance rule and the citation mechanic want the same
 * thing, which is a piece of luck worth spending.
 *
 * What was missing was saying it in a format a parser reads. Thirty-nine
 * routes carried metadata and not one carried a single ld+json block.
 *
 * ── WHAT MAY NEVER GO IN HERE ──────────────────────────────────────────────
 * Schema is markup that makes CLAIMS, and a claim in markup is a claim. The
 * rules that govern the page govern this too, and the temptation is worse
 * here because rich results reward exactly the types that would break them:
 *
 *   · No `Product`, no `Offer`, no `price`, no `priceRange`. A property is not
 *     a product with a price on this site — rule 2 — and an Offer would put a
 *     single valuation into markup where no reader can see it.
 *   · No `AggregateRating` or `Review` on a place. It would be a verdict on a
 *     property, which is the same rule again, and there are no ratings to
 *     aggregate.
 *   · No `RealEstateListing`. Nothing here is a listing. It is a public
 *     register rendered.
 *
 * `Dataset` is the honest type, and it is the right one: these pages ARE
 * derived datasets from named agencies, with a temporal coverage and a
 * provenance. Almost nobody in this market publishes that, which is the other
 * reason to do it.
 *
 * test/schema.test.js fails if any forbidden type appears.
 */

/**
 * One <script type="application/ld+json">. Not a component, because the
 * layout and the routes both need it and a shared JSX file would drag a
 * client boundary somewhere it is not wanted.
 *
 * JSON.stringify escapes nothing that matters inside a script tag except the
 * closing sequence, so `<` is escaped rather than trusting the data. The
 * sanitiser note in CLAUDE.md is about the same class of problem.
 */
export const ldJson = data => ({
  __html: JSON.stringify(data).replace(/</g, '\\u003c'),
});

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app')
  .replace(/\/$/, '');

/**
 * Who publishes this, and under what registration.
 *
 * The CEA number is the strongest authority signal on the site because it is
 * the only one a reader can independently check. It goes in as an identifier
 * with its issuer named, not as a decorative string.
 */
export function organisation(agent) {
  const person = {
    '@type': 'Person',
    name: agent.name,
    jobTitle: 'Licensed real estate salesperson',
    worksFor: { '@type': 'Organization', name: agent.agency },
    identifier: {
      '@type': 'PropertyValue',
      propertyID: 'CEA Registration Number',
      value: agent.cea,
      description: 'Council for Estate Agencies, Singapore',
    },
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: SITE,
        name: 'Truestorey',
        inLanguage: 'en-SG',
        publisher: { '@id': `${SITE}/#publisher` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE}/#publisher`,
        name: 'Truestorey',
        url: SITE,
        areaServed: { '@type': 'Country', name: 'Singapore' },
        founder: person,
        member: person,
      },
    ],
  };
}

/**
 * A record page, as what it actually is: a derived dataset.
 *
 * `temporalCoverage` and `isBasedOn` are the two fields that do the work. The
 * first says how old the figures are, which is the question an answer engine
 * weights most heavily and the one most property sites cannot answer. The
 * second names the agency, so the provenance travels with the citation
 * instead of stopping at this domain.
 */
export function dataset({ name, description, href, n, source, from, to, sourceUrl }) {
  const d = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    url: `${SITE}${href}`,
    isAccessibleForFree: true,
    inLanguage: 'en-SG',
    spatialCoverage: { '@type': 'Place', name: 'Singapore' },
    creator: { '@id': `${SITE}/#publisher` },
  };
  /* Every field below is omitted rather than guessed. A Dataset that declares
     a temporal coverage it does not have is the markup version of a figure
     with no period on it, which is the thing rule 6 exists to stop. */
  if (Number.isFinite(n)) d.size = `${n} filed transactions`;
  if (from && to) d.temporalCoverage = `${from}/${to}`;
  if (source) {
    d.isBasedOn = {
      '@type': 'Dataset',
      name: source,
      ...(sourceUrl ? { url: sourceUrl } : {}),
    };
  }
  return d;
}

/**
 * A written piece. `dateModified` matters as much as `datePublished`: an
 * answer engine weights recency, and an undated page loses to a dated one
 * even when it is better.
 */
export function article({ title, description, href, published, modified, author, image }) {
  const a = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: String(title || '').slice(0, 110),
    url: `${SITE}${href}`,
    mainEntityOfPage: `${SITE}${href}`,
    inLanguage: 'en-SG',
    isAccessibleForFree: true,
    publisher: { '@id': `${SITE}/#publisher` },
  };
  if (description) a.description = description;
  if (published) a.datePublished = published;
  a.dateModified = modified || published || undefined;
  if (author?.name) {
    a.author = {
      '@type': 'Person',
      name: author.name,
      ...(author.cea ? {
        identifier: {
          '@type': 'PropertyValue',
          propertyID: 'CEA Registration Number',
          value: author.cea,
        },
      } : {}),
    };
  }
  if (image) a.image = image;
  return a;
}

/**
 * Questions and their answers, as a pair a parser can lift whole.
 *
 * The answer is the part people get wrong: it has to stand on its own. An
 * answer that says "as described above" is useless to something that only
 * extracted this block.
 */
export function faq(items) {
  const clean = (items || []).filter(x => x?.q && x?.a);
  if (!clean.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: clean.map(x => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  };
}

/** Where a page sits. Cheap, and it is what puts a path under a result. */
export function breadcrumbs(trail) {
  const items = (trail || []).filter(x => x?.name && x?.href);
  if (items.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((x, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: x.name,
      item: `${SITE}${x.href}`,
    })),
  };
}
