/**
 * MOE's Primary 1 vacancies and balloting data, per school and phase.
 *
 *   npm run ingest:p1
 *
 * ── THE SOURCE ─────────────────────────────────────────────────────────────
 * moe.gov.sg/primary/p1-registration/past-vacancies-and-balloting-data. The
 * page is rendered from MOE's CMS and carries every school's phase rows in
 * its own HTML: vacancies, applicants, whether balloting was required, the
 * ballot counts, and MOE's sentence saying who was balloted. Read from the
 * agency's page, not from any of the sites that republish it.
 *
 * ── ONE YEAR AT A TIME, KEPT ───────────────────────────────────────────────
 * MOE shows only the most recent completed exercise on that page (2025, as at
 * September 2026) and replaces it the following year. There is no primary
 * source here for earlier years, so none is shown. Each run MERGES the year
 * it finds into data/p1.json and never drops a year already held, so the
 * history this site can show grows by one exercise a year from 2025.
 *
 * On failure it prints what it received and leaves data/p1.json as it was.
 */
import fs from 'node:fs/promises';

const URL_ = 'https://www.moe.gov.sg/primary/p1-registration/past-vacancies-and-balloting-data';
const OUT = new URL('../data/p1.json', import.meta.url);

export function parseMoe(html) {
  const s = String(html).replace(/\\"/g, '"');
  const rows = [];
  for (const m of s.matchAll(/"school_phase_item_id":(\{[^{}]*\})/g)) {
    try { rows.push(JSON.parse(m[1])); } catch { /* a fragment split across chunks; counted below */ }
  }
  const meta = {};
  for (const m of s.matchAll(/"school":(\{"school_name":"[^"]*","school_area":\d+,"slug":"[^"]*"\})/g)) {
    try { const o = JSON.parse(m[1]); meta[o.school_name] = { area: o.school_area, moeSlug: o.slug }; } catch { /* skip */ }
  }
  return { rows, meta };
}

export function shapeMoe({ rows, meta }) {
  const years = {};
  for (const r of rows) {
    if (!r.school_name || !r.year || !r.phase) continue;
    const y = (years[r.year] ||= {});
    const sc = (y[r.school_name] ||= { name: r.school_name, ...(meta[r.school_name] || {}), phases: {} });
    sc.phases[r.phase] = {
      vacancies: r.total_vacancies === '' ? null : Number(r.total_vacancies),
      applicants: r.total_applicants === '' ? null : Number(r.total_applicants),
      ballot: r.balloting_required === true ? true : r.balloting_required === false ? false : null,
      vacanciesBalloted: r.vacancies_balloted === '' ? null : Number(r.vacancies_balloted),
      applicantsBalloted: r.applicants_balloted === '' ? null : Number(r.applicants_balloted),
      copy: r.balloting_content_copy || '',
      remarks: r.remarks || '',
    };
  }
  return years;
}

async function main() {
  const res = await fetch(URL_, { headers: { 'User-Agent': 'truestorey/1.0 (+https://truestorey.vercel.app)' }, signal: AbortSignal.timeout(60000) });
  const html = await res.text();
  const parsed = parseMoe(html);
  const years = shapeMoe(parsed);
  const found = Object.keys(years);
  const count = found.length ? Object.keys(years[found[0]]).length : 0;
  /* MOE lists every primary school it runs — 179 in 2025. Far fewer means the
     page changed shape, not that schools closed. */
  if (!res.ok || !found.length || count < 150) {
    console.error(`MOE's page did not give the P1 data this expects (HTTP ${res.status}, ${parsed.rows.length} phase rows, years ${found.join(', ') || 'none'}, ${count} schools).`);
    console.error(`First 300 characters received: ${html.replace(/\s+/g, ' ').slice(0, 300)}`);
    console.error('data/p1.json left as it was.');
    process.exit(1);
  }
  let held = { years: {} };
  try { held = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* first run */ }
  const out = {
    source: 'Ministry of Education — P1 Registration Exercise: vacancies and balloting data',
    url: URL_,
    accessedAt: new Date().toISOString(),
    note: 'MOE publishes only the most recent exercise; earlier years are kept from earlier runs, never back-filled.',
    years: { ...(held.years || {}), ...years },
  };
  await fs.writeFile(OUT, JSON.stringify(out));
  console.log(`Wrote data/p1.json — ${found.join(', ')}: ${count} schools; years held: ${Object.keys(out.years).sort().join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
