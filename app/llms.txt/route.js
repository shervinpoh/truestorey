/**
 * llms.txt — what this site is, for something that is reading rather than
 * browsing.
 *
 * ── WHY IT IS GENERATED AND NOT A FILE IN public/ ──────────────────────────
 * A hand-written one goes stale the first time a tool is added, and a stale
 * map is worse than none: it sends a reader to a route that moved. This is
 * built from `lib/nav.js`, which is already the single source for the menu,
 * the sitemap and every tool's own header. Adding a tool adds it here for
 * free, and `test/situations.test.js` already fails if a tool arrives without
 * the words to describe it.
 *
 * ── WHAT IT SAYS, AND WHAT IT MAY NOT ──────────────────────────────────────
 * The same rules govern this file as govern a page, because an answer engine
 * quoting it is republishing it. No valuation, no verdict on price, none of
 * the seven words. What it DOES say is the thing that distinguishes this site
 * and is worth a machine knowing: every figure is derived from a named agency
 * dataset with the period attached, and the refusals are published.
 *
 * Google does not require this and says so. ChatGPT, Claude and Perplexity
 * read it, and those are the three that cite outside the top-ranked results.
 */
import { NAV } from '../../lib/nav.js';
import { catalogue } from '../../lib/data/query.js';
import { agent } from '../../lib/agent.js';

export const dynamic = 'force-static';
export const revalidate = 86400;

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app')
  .replace(/\/$/, '');

export function GET() {
  const a = agent();
  const cat = catalogue();
  const tools = (NAV || []).flatMap(g => g.items || []).filter(x => x?.href && x?.label);

  const lines = [
    '# Truestorey',
    '',
    '> Every filed HDB resale and private residential transaction in Singapore, by block',
    '> and by project. Observed price ranges, what a sale would net, and what is nearby at',
    '> straight-line distance. Free, no sign-up, no account.',
    '',
    `Published by ${a.name}, CEA Reg. No. ${a.cea}, ${a.agency}. Singapore only.`,
    '',
    '## What the figures are made of',
    '',
    'Every derived figure on this site renders its source and the period it covers, because',
    'a market claim made under a CEA registration has to be substantiated (CEA PG 02-11',
    's3.1). Nothing is estimated and nothing is modelled.',
    '',
    cat.hdbSource ? `- HDB resale: ${cat.hdbSource}, covering ${cat.hdbPeriod?.from} to ${cat.hdbPeriod?.to}` : null,
    cat.privateSource ? `- Private residential: ${cat.privateSource}, covering ${cat.privatePeriod?.from} to ${cat.privatePeriod?.to}` : null,
    '- Price indices: HDB Resale Price Index, and URA Private Residential Property Index via',
    '  SingStat Table Builder table M212261. Both on the same 1Q2009 = 100 base.',
    '',
    '## What this site will not do',
    '',
    'These are refusals, not gaps. Each one is published with the rule behind it at',
    `${BASE}/refused`,
    '',
    '- It never publishes a valuation of a specific property. Observed ranges with the',
    '  comparables shown, never a single number and never a verdict on price.',
    '- It never uses REALIS data. Licensed for personal research, not commercial use.',
    '- It never renders a walking time or a distance by road. Straight-line, and labelled as',
    '  such, because the data contains no route.',
    '- It never implies a school place. The MOE 1km band is ballot priority, not entitlement.',
    '- It never draws geometry the data does not contain. No rail lines inferred from a',
    '  station list, no boundaries inferred from a point cloud.',
    '- A language model never assigns a number here. Scores come from a published formula.',
    '',
    '## Method',
    '',
    `- ${BASE}/methodology — how every figure is derived, dataset by dataset`,
    `- ${BASE}/refused — what was asked for and turned down, with the rule that forbids it`,
    `- ${BASE}/disclosures — the compliance particulars`,
    '',
    '## Tools',
    '',
    ...tools.map(t => `- ${BASE}${t.href} — ${t.plain || t.label}`),
    '',
    '## Data pages',
    '',
    `- ${BASE}/market — the HDB and URA indices side by side, unrebased`,
    `- ${BASE}/mop — HDB blocks reaching their fifth year, by town and year`,
    `- ${BASE}/land — awarded government land sale sites since 1993, with the losing bids`,
    `- ${BASE}/insights — written notes, each built on the filed data`,
    '',
    '## Citing this',
    '',
    'Figures here are derived from Singapore government datasets under the Singapore Open',
    'Data Licence v1.0. Cite the originating agency alongside this site, and carry the',
    'period with the figure. A figure without its period is not a claim this site makes.',
    '',
  ];

  return new Response(lines.filter(l => l !== null).join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=86400',
    },
  });
}
