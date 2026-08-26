/**
 * Tower View — what a floor is worth.
 *
 *   npm run build:storey
 *
 * HDB publishes a storey range on every resale and URA publishes a floor range
 * on every non-landed sale. Both have been sitting in data/hdb.json and
 * data/private.json since the first ingest, unused. This turns them into the
 * one number an owner on the 3rd floor and an owner on the 30th both want.
 *
 * THE WHOLE DIFFICULTY IS CONFOUNDING, and it is worth spelling out because
 * getting it wrong produces a figure that looks authoritative and is wrong.
 *
 * Nationally, a 4-room on floors 34-36 sells for about 91% more per square
 * foot than a 4-room on floors 4-6. Almost none of that is height. A 4-room on
 * the 35th floor is at Pinnacle@Duxton or in Bidadari - it is central, new, and
 * long-leased. Comparing it to the national low-floor pool measures the estate,
 * not the storey.
 *
 * So two figures get built, and the honest one is the second:
 *
 *   BANDS      median psf per storey band within one town and one flat type.
 *              Descriptive. Still carries some estate mix inside a town.
 *
 *   WITHIN     the same building, compared with itself. For every block and
 *              flat type with enough low-floor AND high-floor sales, the ratio
 *              of the two medians. Holding the building constant removes the
 *              estate, the lease, the location and the flat model in one move,
 *              because all of them are shared by both sides of the ratio.
 *              Reported as a distribution across buildings, never as one
 *              number, and the count that came out NEGATIVE is published
 *              alongside - because in 57 of 885 HDB buildings the high floors
 *              genuinely sold for less, and a tool that hides that is selling
 *              a story rather than reporting a market.
 *
 * The bands are the source's own bands. No floor number is ever interpolated:
 * HDB says "10 TO 12" and this file will never turn that into "floor 11".
 * B1-B5 is dropped rather than treated as floor zero.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const read = async f => JSON.parse(await fs.readFile(path.join(ROOT, 'data', f), 'utf8'));

/* Sample bars. Deliberately not generous - a floor premium computed off four
 * sales is noise wearing a percentage sign, and this site's whole position is
 * that it does not publish those. */
const BAR = {
  band: 8,        // sales before a storey band gets a published median
  side: 3,        // sales on each side before one BUILDING contributes a ratio
  group: 15,      // sales on each side before a town/district gets its own ratio
};

/* HDB bands are three storeys wide, URA's are five, so the low/high cuts are
 * not the same number. Both mean the same thing: the bottom of a block, and
 * high enough that a lift and a view are actually in play. */
const CUT = {
  hdb: { lo: 6, hi: 13 },
  private: { lo: 5, hi: 16 },
};

/* Keys are joined with a pipe. Town names carry spaces (ANG MO KIO) and so do
 * flat types (4 ROOM), so a space separator silently shatters both. */
const SEP = '|';

const med = v => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };
const pct = (s, p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
const r1 = x => Math.round(x * 1000) / 10;

/** "10 TO 12" and "11-15" both mean a range. B1-B5 and "-" mean no floor. */
function midOf(range) {
  if (!range || range === '-' || /^B/i.test(range)) return null;
  const m = /^(\d+)\s*(?:TO|-)\s*(\d+)$/i.exec(String(range).trim());
  return m ? (Number(m[1]) + Number(m[2])) / 2 : null;
}

/** The band table for one pool of sales: median psf per band, lowest first. */
function bandsOf(rows) {
  const g = new Map();
  for (const r of rows) {
    const e = g.get(r.range) || { mid: r.mid, psf: [] };
    e.psf.push(r.psf); g.set(r.range, e);
  }
  return [...g]
    .filter(([, e]) => e.psf.length >= BAR.band)
    .sort((a, b) => a[1].mid - b[1].mid)
    .map(([range, e]) => [range, e.mid, Math.round(med(e.psf)), e.psf.length]);
}

/**
 * The distribution of within-building premiums across a set of buildings.
 * `neg` is not a diagnostic - it is part of the answer and gets rendered.
 */
function within(units) {
  const v = units.map(e => med(e.hi) / med(e.lo) - 1).sort((a, b) => a - b);
  if (!v.length) return null;
  return { n: v.length, neg: v.filter(x => x < 0).length, p25: r1(pct(v, 0.25)), p50: r1(pct(v, 0.5)), p75: r1(pct(v, 0.75)) };
}

const usable = (e, bar) => e.lo.length >= bar && e.hi.length >= bar;

function build({ rows, cut, groupOf, typeOf, unitOf }) {
  const sales = rows
    .map(r => ({ ...r, mid: midOf(r.range) }))
    .filter(r => r.mid != null && Number.isFinite(r.psf) && r.psf > 0);

  const bucket = (map, key, r, meta) => {
    let e = map.get(key);
    if (!e) { e = { lo: [], hi: [], rows: [], ...meta }; map.set(key, e); }
    e.rows.push(r);
    if (r.mid <= cut.lo) e.lo.push(r.psf);
    else if (r.mid >= cut.hi) e.hi.push(r.psf);
  };

  const byUnit = new Map(), byGroup = new Map(), byType = new Map();
  for (const r of sales) {
    const g = groupOf(r), t = typeOf(r), u = unitOf(r);
    bucket(byUnit, u + SEP + t, r, { group: g, type: t, unit: u });
    bucket(byGroup, g + SEP + t, r, { group: g, type: t });
    bucket(byType, t, r, { type: t });
  }

  // Every building that clears the bar, indexed by href so a record page can
  // look up its own without loading anybody else's.
  const clear = [...byUnit.values()].filter(e => usable(e, BAR.side));
  const units = {};
  for (const e of clear) {
    (units[e.unit] ||= {})[e.type] = {
      lo: [Math.round(med(e.lo)), e.lo.length],
      hi: [Math.round(med(e.hi)), e.hi.length],
      prem: r1(med(e.hi) / med(e.lo) - 1),
    };
  }

  const groups = {};
  for (const e of byGroup.values()) {
    const bands = bandsOf(e.rows);
    if (!bands.length) continue;
    (groups[e.group] ||= {})[e.type] = {
      n: e.rows.length,
      psf: Math.round(med(e.rows.map(r => r.psf))),
      bands,
      within: within(clear.filter(u => u.group === e.group && u.type === e.type)),
      spread: usable(e, BAR.group) ? r1(med(e.hi) / med(e.lo) - 1) : null,
    };
  }

  const national = {};
  for (const e of byType.values()) {
    national[e.type] = {
      n: e.rows.length,
      psf: Math.round(med(e.rows.map(r => r.psf))),
      bands: bandsOf(e.rows),
      within: within(clear.filter(u => u.type === e.type)),
    };
  }

  return { national, groups, units };
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const hdbRaw = await read('hdb.json');
  const privRaw = await read('private.json');
  const idx = await read('index.json').catch(() => ({}));

  const hdb = build({
    rows: hdbRaw.rows.map(r => ({ range: r.storeyRange, psf: r.psf, town: r.town, type: r.flatType, block: r.block, street: r.street })),
    cut: CUT.hdb,
    groupOf: r => r.town,
    typeOf: r => r.type,
    unitOf: r => `/hdb/${slug(r.town)}/${slug(r.block + ' ' + r.street)}`,
  });

  // Landed rows carry no floor and URA files them all under one placeholder
  // project name, so they are dropped rather than pooled into a fake project.
  const priv = build({
    rows: privRaw.rows
      .filter(r => r.project && r.project !== 'LANDED HOUSING DEVELOPMENT')
      .map(r => ({ range: r.floorRange, psf: r.psf, district: r.district, type: r.propertyType, project: r.project })),
    cut: CUT.private,
    groupOf: r => r.district,
    typeOf: r => r.type,
    unitOf: r => `/condo/${slug(r.project)}`,
  });

  const out = {
    builtAt: new Date().toISOString(),
    bars: BAR, cuts: CUT,
    source: {
      hdb: hdbRaw.source, hdbAccessed: hdbRaw.accessedAt,
      private: privRaw.source, privateAccessed: privRaw.accessedAt,
      period: idx.hdb?.period,
    },
    hdb, private: priv,
  };

  await fs.writeFile(path.join(ROOT, 'data', 'storey.json'), JSON.stringify(out));
  const kb = Math.round((await fs.stat(path.join(ROOT, 'data', 'storey.json'))).size / 1024);
  console.log(`data/storey.json - ${kb}KB`);
  for (const [name, d] of [['hdb', hdb], ['private', priv]]) {
    console.log(`  ${name}: ${Object.keys(d.national).length} types, ${Object.keys(d.groups).length} ${name === 'hdb' ? 'towns' : 'districts'}, ${Object.keys(d.units).length} buildings clear the bar`);
    for (const [t, v] of Object.entries(d.national)) {
      if (!v.within) continue;
      console.log(`    ${t.padEnd(22)} within-building p50 ${v.within.p50 > 0 ? '+' : ''}${v.within.p50}%  (${v.within.n} buildings, ${v.within.neg} negative)`);
    }
  }
}

main().catch(e => { console.error(`BUILD STOREY FAILED: ${e.message}\n${e.stack}`); process.exit(1); });
