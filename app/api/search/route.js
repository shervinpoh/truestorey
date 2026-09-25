import { NextResponse } from 'next/server';
import { search, searchEntries, asResult, allTowns } from '../../../lib/data/query.js';
import { lookupAddress } from '../../../lib/onemap.js';
import { resolveAddresses } from '../../../lib/address.js';
export const dynamic = 'force-dynamic';

const SOURCE = { name: 'OneMap, Singapore Land Authority', url: 'https://www.onemap.gov.sg/' };

/**
 * `resolve=1` asks OneMap when this site's own index finds nothing.
 *
 * Opt-in, not automatic, for two reasons. OneMap throttles after a handful of
 * requests, and every picker on the site calls this route on every keystroke;
 * only the main search box asks, and only once the reader has paused. And an
 * address leaving this server for a government API is a thing /privacy has to
 * describe — it should happen where a reader is plainly looking an address up,
 * not inside a calculator's "which home" field.
 *
 * `resolved` travels with the answer so the box can say which of three things
 * happened: OneMap matched a filed record, OneMap knows the address but no
 * filed sale is there, or OneMap could not be asked. The last two must never
 * read the same as "nothing matching that".
 */
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const q = p.get('q') || '';
  const kind = p.get('kind') || null;
  const limit = Math.min(Number(p.get('limit')) || 12, 30);
  /* An HDB town is a place people type first — "tampines", "punggol" — and
     the index holds blocks and projects, not towns, so the town page never
     came up. A town whose name starts with what was typed leads the list. */
  const term = q.trim().toLowerCase();
  /* Asked for by the header search only (towns=1): Blindspot's own search
     box needs a block or project, and a town handed to it is not a home. */
  const towns = p.get('towns') === '1' && term.length >= 3 && kind !== 'PRIVATE'
    ? allTowns().filter(t => t.name.toLowerCase().startsWith(term)).slice(0, 2)
      .map(t => ({ id: `T:${t.slug}`, kind: 'HDB', label: t.name, sub: `HDB town · ${t.blockCount.toLocaleString('en-SG')} blocks`, n: t.n, href: t.href || `/hdb/${t.slug}`, town: true }))
    : [];
  const results = [...towns, ...search(q, { kind, limit: Math.max(1, limit - towns.length) })];
  if (results.length || p.get('resolve') !== '1') return NextResponse.json({ results });

  const found = await lookupAddress(q);
  if (found.status === 'skipped') return NextResponse.json({ results });
  if (found.status !== 'ok') {
    return NextResponse.json({ results, resolved: { status: found.status, source: SOURCE } });
  }
  const { hits, addresses } = resolveAddresses(found.results, searchEntries(), { kind });
  return NextResponse.json({
    results: hits.slice(0, limit).map(({ entry, address }) => ({ ...asResult(entry), address })),
    resolved: { status: 'ok', source: SOURCE, addresses: addresses.slice(0, 5) },
  });
}
