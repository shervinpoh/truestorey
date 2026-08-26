import fs from 'node:fs';
import path from 'node:path';
import { frontmatter, readingMinutes } from './md.js';

const DIR = () => path.join(process.cwd(), 'content', 'guides');

/**
 * The guides — the four decks as pages.
 *
 * These files are GENERATED. `npm run build:guides` extracts them from the
 * verified research base that the python-pptx deck scripts also read, which is
 * the whole point: a client who reads the ABSD guide and then sits through the
 * deck must not find two different numbers. Editing a file in content/guides
 * by hand breaks that and will be overwritten on the next build.
 *
 * The order below is the reading order, not the deck order. Someone arriving
 * from a block page wants the cost guide first; renting is where they end up
 * later, not where they start.
 */
const ORDER = ['absd-tdsr-ssd', 'new-launch-vs-resale', 'decoupling', 'renting'];

let _all = null;

export function allGuides() {
  if (_all) return _all;
  const dir = DIR();
  if (!fs.existsSync(dir)) { _all = []; return _all; }

  _all = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const { data, body } = frontmatter(raw);
      const slug = data.slug || f.replace(/\.md$/, '');
      return {
        slug,
        href: `/guides/${slug}`,
        title: data.title || slug,
        blurb: data.blurb || '',
        deck: Number(data.deck) || null,
        tool: data.toolHref ? { href: data.toolHref, label: data.toolLabel || 'Run the numbers' } : null,
        source: data.source || null,
        generated: data.generated || null,
        sections: String(data.sections || '').split(/,\s*/).filter(Boolean),
        minutes: readingMinutes(body),
        body,
      };
    })
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.slug), ib = ORDER.indexOf(b.slug);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  return _all;
}

export function guide(slug) {
  return allGuides().find(g => g.slug === slug) || null;
}
