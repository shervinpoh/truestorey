/**
 * Every destination on the site, once.
 *
 * Three things render this: the desktop row, the mobile panel and the footer.
 * They were going to be three lists. Rates lived in two places in this repo
 * once already and the two disagreed, which is why test/guides.test.js exists;
 * a nav is the same shape of mistake with a cheaper symptom — a link that gets
 * added to the header and not the footer just quietly reaches fewer people.
 *
 * `top: true` marks what appears in the desktop row. Everything appears in the
 * panel and the footer, so a tool can be one tap from a phone without adding a
 * twelfth item to a row that already does not fit.
 *
 * Nothing is listed here that does not resolve. A nav link to a page that does
 * not exist yet is worse than a shorter nav.
 */
export const NAV = [
  {
    group: 'Look up',
    items: [
      { href: '/map', label: 'Map', match: ['/map'], top: true,
        blurb: 'Every block and project, plotted by median psf' },
      { href: '/hdb', label: 'HDB', panelLabel: 'HDB, by town', match: ['/hdb'], top: true,
        blurb: 'Every town, every block with a filed resale' },
      { href: '/condo', label: 'Condo', panelLabel: 'Condos and apartments', match: ['/condo'], top: true,
        blurb: 'By project, grouped by district' },
      { href: '/landed', label: 'Landed', match: ['/landed'], top: true,
        blurb: 'By street — URA does not name landed projects' },
      { href: '/mop', label: 'MOP', panelLabel: 'Which flats can start selling', match: ['/mop'], top: true,
        blurb: 'Blocks reaching their fifth year, by town and year' },
      { href: '/market', label: 'Rates', panelLabel: 'Rates and the index', match: ['/market'], top: true,
        blurb: 'SORA and the HDB Resale Price Index' },
    ],
  },
  {
    group: 'Tools',
    items: [
      // The desktop row carries the index; the panel and the footer carry the
      // tools themselves, which are otherwise two taps deep on the surface
      // where taps cost the most.
      { href: '/tools', label: 'Tools', panelLabel: 'All tools', top: true,
        match: ['/tools', '/plan', '/floors', '/yield', '/blindspot', '/floorplan', '/neighbourhood'],
        blurb: 'Everything below, in one place' },
      { href: '/plan', label: 'Can I afford it', match: ['/plan'],
        blurb: 'TDSR, the LTV ceiling, the cash CPF cannot cover, both stamp duties' },
      { href: '/blindspot', label: 'Blindspot', match: ['/blindspot'],
        blurb: 'Four checks against filed transactions, scored to a published rubric' },
      { href: '/floors', label: 'What a higher floor is worth', match: ['/floors'],
        blurb: 'Measured within a building, not across the country' },
      { href: '/yield', label: 'Rental yields', match: ['/yield'],
        blurb: 'Filed rents over filed prices, matched on unit size' },
    ],
  },
  {
    group: 'Read',
    items: [
      { href: '/insights', label: 'Latest', match: ['/insights'], top: true,
        blurb: 'Notes and deep dives, built on the same figures' },
      { href: '/guides', label: 'Guides', match: ['/guides'], top: true,
        blurb: 'Every rule, every rate, every table. Nothing gated' },
      { href: '/archive', label: 'Policy & data', match: ['/archive'], top: true,
        blurb: 'Primary sources, indexed and linked' },
      { href: '/about', label: 'About', match: ['/about'], top: true,
        blurb: 'Who publishes this, and under what registration' },
    ],
  },
];

/** True when `here` is inside this item's section. Drives aria-current. */
export const isHere = (item, here) =>
  item.match.some(m => here === m || here.startsWith(m + '/'));

/** The items that appear in the desktop row, in order. */
export const topLinks = () => NAV.flatMap(g => g.items).filter(i => i.top);
