import { allUrls } from '../lib/data/query.js';
import { allInsights } from '../lib/insights.js';
import { NAV } from '../lib/nav.js';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.sg';

/**
 * Every block, project and town index. Google caps a single sitemap at 50,000
 * URLs; we are at ~13,300, so one file is fine — revisit if the period widens.
 * Busiest first, because urls.json is already sorted that way.
 *
 * ── THE TOOL PAGES COME FROM THE NAV, NOT FROM A SECOND LIST ───────────────
 * They used to be a hardcoded array of six paths, and it had drifted badly:
 * /plan, /blindspot, /compare, /floors, /yield, /neighbourhood, /floorplan,
 * /progressive, /lease and /land were all missing — every calculator on the
 * site, on a site whose entire strategy is being findable. A tool nobody can
 * find is a tool that does not exist.
 *
 * Driving it from lib/nav.js means adding a tool to the nav adds it here, and
 * the two cannot drift again. External links are filtered out; nothing else
 * needs to know about them.
 */
const navPaths = () => [...new Set(
  NAV.flatMap(g => g.items.map(i => i.href)).filter(h => h.startsWith('/')))];
export default function sitemap() {
  const { builtAt, urls } = allUrls();
  const lastModified = new Date(builtAt || Date.now());
  return [
    { url: BASE, priority: 1.0, changeFrequency: 'weekly', lastModified },
    ...[...new Set(['/market', '/mop', '/insights', '/hdb', '/condo', '/landed',
                    '/tools', '/about', ...navPaths()])].map(p => ({
      url: BASE + p, priority: 0.9, changeFrequency: 'weekly', lastModified })),
    ...allInsights().map(p => ({
      url: BASE + p.href, priority: 0.8, changeFrequency: 'monthly',
      lastModified: new Date(p.date) })),
    ...urls.map(u => ({
      url: BASE + u.href,
      lastModified,
      changeFrequency: 'monthly',
      priority: u.href.split('/').length === 3 && u.href.startsWith('/hdb/') ? 0.7 : 0.6,
    })),
  ];
}
