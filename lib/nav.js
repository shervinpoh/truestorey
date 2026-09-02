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
      { href: '/map', label: 'Map', match: ['/map'], top: true, sub: 'Look up a place',
        blurb: 'Every block and project, plotted by median psf',
        plain: 'What does it cost where I want to live?',
        get: 'Every block and project plotted by its filed middle price per square foot.' },
      { href: '/hdb', label: 'HDB', panelLabel: 'HDB, by town', match: ['/hdb'], top: true, sub: 'Look up a place',
        blurb: 'Every town, every block with a filed resale' },
      { href: '/condo', label: 'Condo', panelLabel: 'Condos and apartments', match: ['/condo'], top: true, sub: 'Look up a place',
        blurb: 'By project, grouped by district' },
      { href: '/landed', label: 'Landed', match: ['/landed'], top: true, sub: 'Look up a place',
        blurb: 'By street — URA does not name landed projects' },
      { href: '/mop', label: 'MOP', panelLabel: 'Which flats can start selling', match: ['/mop'], top: true, sub: 'What the market is doing',
        blurb: 'Blocks reaching their fifth year, by town and year',
        plain: 'Which flats near me can start selling?',
        get: 'Every block reaching the end of its five-year minimum occupation period, by town and year.' },
      { href: '/market', label: 'Rates', panelLabel: 'Rates and the index', match: ['/market'], top: true, sub: 'What the market is doing',
        blurb: 'SORA and the HDB Resale Price Index' },
    ],
  },
  {
    group: 'Tools',
    /* Rendered as the three situations rather than as this list. The list is
       still the truth for the footer, the sitemap and /tools' full index — see
       SITUATIONS below for why the MENU cannot be the same shape as the
       inventory. */
    guided: true,
    items: [
      // The desktop row carries the index; the panel and the footer carry the
      // tools themselves, which are otherwise two taps deep on the surface
      // where taps cost the most.
      { href: '/tools', label: 'Tools', panelLabel: 'All tools', top: true,
        match: ['/tools', '/plan', '/cost', '/floors', '/yield', '/blindspot', '/floorplan', '/neighbourhood'],
        blurb: 'Everything below, in one place' },
      { href: '/plan', label: 'Can I afford it', match: ['/plan'], home: true,
        blurb: 'TDSR, the LTV ceiling, the cash CPF cannot cover, both stamp duties',
        plain: 'What can I afford, and what do I need upfront?',
        use: "Before you commit to a price — or when a bank's number and your own disagree.",
        need: 'Your household income, any loans you are already paying, and a price in mind.',
        get: 'The largest loan the rules allow, the cash a CPF account cannot cover, and both stamp duties.' },
      { href: '/progressive', label: 'Buying off the plan', match: ['/progressive'], home: true,
        blurb: 'The nine stages a developer bills you for, and what the instalment does',
        plain: 'How much will I pay while it is being built?',
        use: 'For a home still under construction, where you pay in stages instead of all at once.',
        need: 'The price, how much you are borrowing, and the rate you have been quoted.',
        get: 'The nine stages the law sets, what the bank pays at each, and what your instalment climbs to.' },
      { href: '/cost', label: 'What owning it costs', match: ['/cost'], home: true,
        blurb: 'Duties, interest, commission and the CPF interest accruing the whole time',
        plain: 'What will this home cost me to hold?',
        use: 'When you want the cost of OWNING a home rather than the price of buying one.',
        need: 'The price, roughly when you bought or will buy, your deposit, and your loan rate.',
        get: 'Every duty, interest and commission — and the price a sale must clear to return your own cash.' },
      { href: '/lease', label: 'What a lease is worth', match: ['/lease'],
        blurb: 'The table the State uses to price a lease renewal, and the cost of holding',
        plain: 'What is a shorter lease worth?',
        use: 'On a leasehold home with fewer years left, or when weighing two leases against each other.',
        need: 'The years remaining on the lease.',
        get: 'The table the State itself applies to a lease, and what one more year of holding costs.' },
      { href: '/land', label: 'What the land cost', match: ['/land'],
        blurb: 'Every GLS site awarded since 1993 — the tender, the rate, the bids',
        plain: 'What did the land underneath cost?',
        use: 'When you want the floor under a launch price, or the history of a site.',
        need: 'Nothing. Browse or filter by area.',
        get: 'Every government land sale awarded since 1993, the winning tender, and every losing bid that was published.' },
      { href: '/blindspot', label: 'Blindspot', match: ['/blindspot'], home: true,
        blurb: 'Six checks against filed transactions, scored to a published rubric',
        plain: 'What should I check before I make an offer?',
        use: 'On one address you are seriously considering, once you know the asking price.',
        need: 'The address, the asking price and the floor area.',
        get: 'Six checks against filed public records, scored by a formula published on the page. Never a valuation.' },
      { href: '/compare', label: 'Compare', match: ['/compare'],
        blurb: 'Two or three blocks side by side, in a link you can send',
        plain: 'How do two or three places compare?',
        use: 'When you have a shortlist and want them beside each other rather than in three tabs.',
        need: 'Two or three blocks or projects.',
        get: 'Their filed prices, ranges and lease side by side, in a link you can send to someone.' },
      { href: '/floors', label: 'What a higher floor is worth', match: ['/floors'], home: true,
        blurb: 'Measured within a building, not across the country',
        plain: 'Is the higher floor worth what they are asking?',
        use: 'When a higher unit costs more and you want to know what height actually fetches.',
        need: 'A block or project.',
        get: 'The premium measured inside that one building — not averaged across the country.' },
      { href: '/yield', label: 'Rental yields', match: ['/yield'], home: true,
        blurb: 'Filed rents over filed prices, matched on unit size',
        plain: 'What rental return are these prices producing?',
        use: 'When you want to know what filed rents come to against filed prices.',
        need: 'Nothing. Pick a district or a project.',
        get: 'A gross return only. Never a net one — the running costs it would need are not published anywhere.' },
      // These two existed only on /tools. Nothing in the nav led to either, so
      // the only way to find them was to already know they were there.
      { href: '/floorplan', label: 'Read a floor plan', match: ['/floorplan'],
        blurb: 'Layout efficiency and the wall questions for your ID and a QP',
        plain: 'What should I notice in this floor plan?',
        use: 'Before a renovation quote, on a plan you already have.',
        need: 'A floor plan image.',
        get: 'How much of the area is usable, and the wall questions to put to your designer and an engineer.' },
      { href: '/neighbourhood', label: 'What has been announced nearby', match: ['/neighbourhood'],
        blurb: 'Live retrieval on any town or project, every claim linked',
        plain: 'What has been announced near this address?',
        use: 'When you want to know what is changing around a home before you commit to it.',
        need: 'A town, a project or an address.',
        get: 'A live search of primary sources with every claim linked. Singapore only, by design.' },
    ],
  },
  {
    group: 'Read',
    items: [
      { href: '/insights', label: 'Latest', match: ['/insights'], top: true,
        blurb: 'Notes and deep dives, built on the same figures' },
      { href: '/guides', label: 'Guides', match: ['/guides'], top: true,
        blurb: 'Every rule, every rate, every table. Nothing gated',
        plain: 'How do the rules actually work?',
        get: 'Every rule, rate and table written out, with its source. Nothing behind an email.' },
      { href: '/archive', label: 'Policy & data', match: ['/archive'], top: true,
        blurb: 'Primary sources, indexed and linked' },
      { href: '/about', label: 'About', match: ['/about'], top: true,
        blurb: 'Who publishes this, and under what registration' },
    ],
  },
];

/**
 * The three situations somebody is actually in when they arrive.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The Tools menu had twelve destinations in it and had to scroll on an
 * ordinary desktop window, so the last few could not be seen without first
 * discovering that it scrolled. On a phone all eleven tools ran as one
 * unexplained list. That is complete, and completeness is not guidance:
 * choosing between "Blindspot", "What the land cost" and "Rental yields"
 * requires already knowing what this site calls things.
 *
 * So the first choice is not a tool. It is which of these three sentences is
 * true of the reader, and each one is answerable without knowing a single
 * property acronym — which is the whole test. TDSR, LTV, CPF, MOP and GLS are
 * all accurate and all of them make a first-time visitor decode the site
 * before it helps them. They belong in the detail, not the doorway.
 *
 * ── THREE PRIMARY, THE REST STILL REACHABLE ────────────────────────────────
 * `primary` is capped at three. A situation that reveals eight tools has
 * reproduced the problem one level down. Everything else stays in `more`, in
 * the full index, in the footer and in the sitemap — nothing is deleted and
 * every route remains directly reachable. Removing a specialist tool on taste
 * is refused until tool use is actually measured; see NEXT.md §6.
 *
 * A situation may point at any route, not only a tool: someone who already
 * owns wants /mop, which lives under Look up.
 */
export const SITUATIONS = [
  {
    id: 'buying',
    href: '/tools/buying',
    label: "I'm buying",
    sub: 'Work out what you can carry, and what it costs after the price.',
    title: 'Buying a home in Singapore — what you can carry, and what it costs after the price',
    intro: 'The price is the number everyone quotes. What decides whether a purchase works is the '
         + 'loan the rules will actually allow you, the cash a CPF account cannot cover, and what '
         + 'the thing costs to hold once it is yours.',
    primary: ['/plan', '/cost', '/progressive'],
    more: ['/guides', '/land', '/lease'],
  },
  {
    id: 'owning',
    href: '/tools/owning',
    label: "I own, or I'm selling",
    sub: 'When you can sell, what you would walk away with, and what holding costs.',
    title: 'Selling a home in Singapore — when you can sell, and what you would walk away with',
    intro: 'Two dates govern a sale and neither is on your listing: when the minimum occupation '
         + 'period ends, and when seller\u2019s stamp duty stops applying. After that it is '
         + 'arithmetic — the loan, the CPF refund with its accrued interest, and the commission.',
    primary: ['/tools?calc=sell', '/cost', '/mop'],
    more: ['/tools?calc=duty', '/tools?calc=loan', '/lease', '/yield'],
  },
  {
    id: 'checking',
    href: '/tools/checking',
    label: "I'm checking one specific home",
    sub: 'You have an address. Everything the filed records say about it.',
    title: 'Checking a specific home — everything the filed records say about one address',
    intro: 'You have an address and a price somebody is asking for it. These read the filed '
         + 'transactions back: what has actually sold there, what the lease is doing, how often '
         + 'anything changes hands, and what has been approved next door.',
    primary: ['/blindspot', '/compare', '/floors'],
    more: ['/floorplan', '/neighbourhood', '/yield', '/map'],
  },
];

/**
 * The four embedded calculators on /tools, addressable.
 *
 * They used to be reachable only by opening /tools and clicking past "When can
 * I sell", so nothing could ever link to the stamp-duty answer directly. The
 * id is a URL parameter now (`/tools?calc=duty`), which is what lets a
 * situation above point at one.
 */
export const QUICK = [
  { id: 'sell', label: 'When can I sell?',
    get: 'The date the minimum occupation period ends, and when seller’s stamp duty stops applying.' },
  { id: 'afford', label: 'What could I borrow?',
    get: 'A borrowing ceiling from income alone — including the discount applied to variable income.' },
  { id: 'duty', label: 'What is the stamp duty?',
    get: 'Both buyer’s duties on one price, banded, with the rate each band used.' },
  { id: 'loan', label: 'What does the loan cost over time?',
    get: 'Total interest, and how little of an early instalment touches what you borrowed.' },
];

const FLAT = () => NAV.flatMap(g => g.items);

/** Look up one nav item by href. A `?calc=` link resolves to /tools. */
export const itemFor = href => {
  const base = String(href).split('?')[0];
  const quick = String(href).includes('?calc=')
    ? QUICK.find(q => href.endsWith(`calc=${q.id}`))
    : null;
  const item = FLAT().find(i => i.href === base) || null;
  // A quick calculator borrows /tools' route but carries its own words, so a
  // reader is never promised "everything in one place" and shown a duty table.
  return quick ? { ...item, href, label: quick.label, plain: quick.label, get: quick.get } : item;
};

/** A situation's recommended starts and its longer list, resolved to items. */
export const situationTools = id => {
  const s = SITUATIONS.find(x => x.id === id);
  if (!s) return null;
  return {
    ...s,
    primaryItems: s.primary.map(itemFor).filter(Boolean),
    moreItems: s.more.map(itemFor).filter(Boolean),
  };
};

/**
 * A group's items as labelled runs, when it has them.
 *
 * `Look up` held six entries and rendered them as one flat list, which said
 * they were six of the same kind of thing. They are not: four are ways into
 * the transaction data — the map, HDB, private, landed — and two are about the
 * market rather than about any address. "Rates and the index" sitting in the
 * same undifferentiated run as "Condos and apartments" is a small lie about
 * the shape of the site, and it is the reason that list read as long.
 *
 * The fix is not to hide two of them. Nothing here is hard to understand and
 * nothing deserved to be one tap further away; what it needed was to stop
 * claiming a flatness it does not have. Two labelled runs of four and two, no
 * route moved, no tap added.
 *
 * Groups with no `sub` on their items come back as a single unlabelled run, so
 * Tools and Read are untouched.
 */
export function runsOf(group) {
  const out = [];
  for (const item of group.items) {
    const label = item.sub || null;
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
}

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
