import { allUrls } from '../lib/data/query.js';
import { allInsights } from '../lib/insights.js';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.sg';

/**
 * Every block, project and town index. Google caps a single sitemap at 50,000
 * URLs; we are at ~13,300, so one file is fine — revisit if the period widens.
 * Busiest first, because urls.json is already sorted that way.
 */
export default function sitemap() {
  const { builtAt, urls } = allUrls();
  const lastModified = new Date(builtAt || Date.now());
  return [
    { url: BASE, priority: 1.0, changeFrequency: 'weekly', lastModified },
    ...['/market', '/mop', '/insights', '/hdb', '/condo', '/landed'].map(p => ({
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
