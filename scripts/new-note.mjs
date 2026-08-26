/**
 * Scaffold today's short note.
 *
 *   npm run note                      what moved, as a file to write into
 *   npm run note -- --slug=amk-psf    name it yourself
 *   npm run note -- --deep            scaffold a long piece instead
 *
 * A daily cadence does not fail because writing two sentences is hard. It
 * fails because opening an empty file and remembering what changed is
 * friction, and friction wins. So this does the remembering: it reads the same
 * datasets `npm run brief` reads, works out what actually moved, and writes a
 * dated file with the facts already in it as commented prompts.
 *
 * It never writes prose. Not a sentence, not a headline — the frontmatter
 * title is left as a placeholder on purpose. The whole value of this site is
 * that the writing is his, and a machine-drafted opener is exactly the thing
 * that would make it read like everyone else's.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'content', 'insights');

const argv = process.argv.slice(2);
const opt = n => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || null;
const deep = argv.includes('--deep');

const read = async (f, fb = null) => {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, 'data', f), 'utf8')); }
  catch { return fb; }
};

const fmt = n => Number(n).toLocaleString('en-SG');

async function facts() {
  const out = [];
  const idx = await read('hdb-index.json');
  if (idx?.points?.length) {
    // The column is `index`. Reading `.value` here silently printed
    // "undefined" into a scaffold — the kind of thing that ends up published.
    const v = p => (p?.index ?? p?.value);
    const last = idx.points.at(-1), prev = idx.points.at(-2);
    const yr = idx.points.find(p => p.quarter === shiftQ(last.quarter, -4));
    out.push(`HDB Resale Price Index ${last.quarter}: ${v(last)}` +
      (prev ? ` · ${pct(v(last), v(prev))} on the quarter` : '') +
      (yr ? ` · ${pct(v(last), v(yr))} on the year` : ''));
  }

  const sora = await read('sora.json');
  if (sora?.latest) {
    const age = Math.round((Date.now() - new Date(sora.accessedAt || 0)) / 86400000);
    out.push(`SORA ${sora.latest.sora}% as at ${sora.latest.date}` +
      (sora.yoyPts != null ? ` · ${sora.yoyPts >= 0 ? '+' : ''}${sora.yoyPts.toFixed(2)}pt on the year` : '') +
      (age > 7 ? ` — STALE, fetched ${age} days ago, re-run npm run ingest:sora before quoting it` : ''));
  }

  const m = await read('mop.json');
  if (m?.towns) {
    const yr = m.generatedForYear;
    const rows = Object.values(m.towns)
      .map(t => ({ town: t.town, units: Object.values(t.byYear).filter(y => y.year === yr).reduce((a, y) => a + (y.units || 0), 0) }))
      .filter(r => r.units).sort((a, b) => b.units - a.units).slice(0, 3);
    if (rows.length) out.push(`Reaching year five in ${yr}: ${rows.map(r => `${r.town} ${fmt(r.units)} units`).join(', ')}`);
  }

  const near = await read('near/manifest.json');
  if (near?.records) out.push(`${fmt(near.records.placed)} records carry amenities; ${fmt(near.records.skipped)} could not be placed`);

  const cons = await fs.readFile(path.join(ROOT, 'lib', 'calc', 'constants.js'), 'utf8').catch(() => '');
  const rev = /RATES_REVIEWED\s*=\s*['"]([\d-]+)['"]/.exec(cons)?.[1];
  if (rev) {
    const days = Math.round((Date.now() - new Date(rev)) / 86400000);
    if (days > 30) out.push(`⚠ RATES_REVIEWED is ${days} days old — check for a cooling measure before publishing anything about affordability`);
  }
  return out;
}

const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%` : '—');
function shiftQ(q, n) {
  const [y, k] = String(q).split('-Q').map(Number);
  if (!y || !k) return null;
  const t = (y * 4 + (k - 1)) + n;
  return `${Math.floor(t / 4)}-Q${(t % 4) + 1}`;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const slug = opt('slug') || `${today}-${deep ? 'draft' : 'note'}`;
  const file = path.join(DIR, `${slug}.md`);

  if (!argv.includes('--force')) {
    try {
      await fs.access(file);
      console.error(`${path.relative(ROOT, file)} already exists.`);
      console.error('Pass --slug=something-else, or --force to overwrite it.');
      process.exit(1);
    } catch { /* nothing there, carry on */ }
  }

  const f = await facts();
  const body = [
    '---',
    'title: ',
    `date: ${today}`,
    `kind: ${deep ? 'deep' : 'note'}`,
    'summary: ',
    'towns: []',
    'blocks: []',
    'tags: []',
    '---',
    '',
    ...(f.length ? [
      '<!-- WHAT MOVED, as at ' + today + '. Delete this block before publishing.',
      ...f.map(x => '     · ' + x),
      '',
      '     Shortcodes read the live data, so a figure you write with one never',
      '     goes stale:  {{index}}  {{sora}}  {{mop}}  {{mop:TAMPINES}}',
      '                  {{town:bishan}}  {{block:/hdb/bishan/275a-bishan-st-24}}',
      '-->',
      '',
    ] : ['<!-- No datasets on disk yet — run npm run data:all -->', '']),
    deep
      ? '<!-- The long one. Take a position, show the arithmetic, give both sides. -->'
      : '<!-- Two or three sentences. What changed, and what it means for someone who owns one. -->',
    '',
  ].join('\n');

  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(file, body);

  console.log(`\n${path.relative(ROOT, file)}\n`);
  if (f.length) { console.log('What moved:'); for (const x of f) console.log('  · ' + x); console.log(''); }
  console.log('The title is blank on purpose — a drafted headline is how this starts');
  console.log('sounding like everyone else. Two sentences of yours beats ten of anyone else’s.\n');
  console.log('It stays a draft while the date is in the future. Today’s date publishes it.');
}

main().catch(e => { console.error(`NOTE FAILED: ${e.message}`); process.exit(1); });
