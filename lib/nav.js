import { titleCase } from './name.js';
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
        match: ['/tools', '/plan', '/cost', '/floors', '/yield', '/blindspot', '/floorplan', '/neighbourhood'],
        blurb: 'Everything below, in one place' },
      { href: '/plan', label: 'Can I afford it', match: ['/plan'], home: true,
        blurb: 'TDSR, the LTV ceiling, the cash CPF cannot cover, both stamp duties' },
      { href: '/progressive', label: 'Buying off the plan', match: ['/progressive'], home: true,
        blurb: 'The nine stages a developer bills you for, and what the instalment does' },
      { href: '/cost', label: 'What owning it costs', match: ['/cost'], home: true,
        blurb: 'Duties, interest, commission and the CPF interest accruing the whole time' },
      { href: '/lease', label: 'What a lease is worth', match: ['/lease'],
        blurb: 'The table the State uses to price a lease renewal, and the cost of holding' },
      { href: '/land', label: 'What the land cost', match: ['/land'],
        blurb: 'Every GLS site awarded since 1993 — the tender, the rate, the bids' },
      { href: '/blindspot', label: 'Blindspot', match: ['/blindspot'], home: true,
        blurb: 'Four checks against filed transactions, scored to a published rubric' },
      { href: '/compare', label: 'Compare', match: ['/compare'],
        blurb: 'Two or three blocks side by side, in a link you can send' },
      { href: '/floors', label: 'What a higher floor is worth', match: ['/floors'], home: true,
        blurb: 'Measured within a building, not across the country' },
      { href: '/yield', label: 'Rental yields', match: ['/yield'], home: true,
        blurb: 'Filed rents over filed prices, matched on unit size' },
      // These two existed only on /tools. Nothing in the nav led to either, so
      // the only way to find them was to already know they were there.
      { href: '/floorplan', label: 'Read a floor plan', match: ['/floorplan'],
        blurb: 'Layout efficiency and the wall questions for your ID and a QP' },
      { href: '/neighbourhood', label: 'What has been announced nearby', match: ['/neighbourhood'],
        blurb: 'Live retrieval on any town or project, every claim linked' },
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


/**
 * One step UP from a path — where a back control should go, and what to call
 * it. Lives here rather than in the component because Node does not strip JSX,
 * so anything defined inside a .jsx file cannot be unit-tested at all: the
 * same reason test/motion.test.js reads source instead of importing.
 *
 * UP, NOT BACK. router.back() returns the reader to wherever they came FROM,
 * which on this site is usually a search engine — most traffic lands deep, on
 * a block page. This walks the hierarchy the URL already encodes.
 */
export function parentOf(pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean);
  if (!parts.length) return null;                       // home has no up

  // A record sits under its town: /hdb/ang-mo-kio/406-ang-mo-kio-ave-10
  if (parts[0] === 'hdb' && parts.length === 3) {
    // .toUpperCase() first: titleCase only repairs text that is SHOUTING —
    // that is its whole job, and it leaves "ang mo kio" exactly as it found
    // it. The slug is lowercase, so it has to be shouted at before it can be
    // calmed down.
    return { href: `/hdb/${parts[1]}`, label: titleCase(parts[1].replace(/-/g, ' ').toUpperCase()) };
  }
  // A project sits under its index: /condo/the-sail-marina-bay
  if ((parts[0] === 'condo' || parts[0] === 'landed') && parts.length === 2) {
    return { href: `/${parts[0]}`, label: parts[0] === 'condo' ? 'Private projects' : 'Landed streets' };
  }
  // An article under its section: /insights/some-note, /guides/absd-tdsr-ssd
  if (parts.length === 2) {
    return { href: `/${parts[0]}`, label: SECTION[parts[0]] || titleCase(parts[0].toUpperCase()) };
  }
  // Anything one level deep goes home. The wordmark does too, but a wordmark
  // is a logo — people do not read it as a control, and this one says so.
  return { href: '/', label: 'Home' };
}

const SECTION = {
  hdb: 'HDB towns', condo: 'Private projects', landed: 'Landed streets',
  insights: 'Insights', guides: 'Guides', archive: 'Archive', tools: 'Tools',
};
