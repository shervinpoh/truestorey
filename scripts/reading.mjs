/**
 * Refresh the reading list from the command line.
 *
 *   npm run reading
 *
 * You should not normally need this. The Briefing page refreshes any source
 * older than six hours when you open it, which is a better guarantee than a
 * schedule: a cron on a sleeping laptop does not run, and a page you are
 * looking at always does.
 */
import { refreshReading, readingList } from '../lib/consult/reading.js';

const store = await refreshReading();
for (const s of store.sources) {
  console.log(s.ok ? `  ok    ${s.name.padEnd(28)} ${s.items} items, ${s.added} new`
                   : `  FAIL  ${s.name.padEnd(28)} ${s.error}${s.lastGood ? ` · last good ${s.lastGood.slice(0, 16)}` : ''}`);
}
const { items } = readingList(store, { limit: 10 });
console.log(`\n${Object.keys(store.items).length} items held. Most recent:\n`);
for (const i of items) console.log(`  ${(i.sourceName || '').slice(0, 18).padEnd(19)} ${i.title.slice(0, 68)}`);
console.log('\nOpen the panel to read them: npm run consult → Briefing.');
