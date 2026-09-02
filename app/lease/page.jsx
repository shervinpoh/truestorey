import fs from 'node:fs';
import path from 'node:path';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import LeaseView from '../../components/LeaseView.jsx';
import { getIndex } from '../../lib/data/query.js';
import { parseRemaining } from '../../lib/calc/lease.js';

export const metadata = {
  title: 'What a lease is worth — Singapore’s leasehold relativity table | Truestorey',
  description: 'The table the State itself uses to price lease renewals and differential premium, all 99 years of it, with the cost of one more year of holding. Free, sourced, no sign-up.',
  alternates: { canonical: '/lease' },
};

export default function Page() {
  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="What a lease is worth"
        sub="The leasehold relativity table — what the State applies when it prices a lease renewal — and what one more year of holding costs on it." />
      <ToolIntro href="/lease" />
      <section className="pane">
        <LeaseView observed={observed()} />
      </section>
    </main>
  );
}

/**
 * Median filed psf by remaining-lease band.
 *
 * NOT A MEASUREMENT OF LEASE DECAY, and the page says so above the chart
 * rather than under it. Nothing is held constant here: a 40-year lease and an
 * 85-year lease are in different towns, different flat types and different
 * floors, so the gap between them is lease decay plus everything else. It is
 * shown because "what buyers actually paid at each remaining lease" is a real
 * fact this site holds and nobody else publishes beside the table — but it
 * answers a narrower question than it looks like it answers.
 *
 * Ten-year bands: at one-year resolution the medians are thin and jump around,
 * which would read as signal.
 */
function observed() {
  try {
    const p = path.join(process.cwd(), 'data', 'hdb.json');
    if (!fs.existsSync(p)) return null;
    const hdb = JSON.parse(fs.readFileSync(p, 'utf8'));
    const buckets = new Map();
    let n = 0;
    for (const r of hdb.rows) {
      const y = parseRemaining(r.remainingLease);
      if (y == null || !Number.isFinite(r.psf)) continue;
      const lo = Math.floor(y / 10) * 10;
      if (lo < 40 || lo > 90) continue;          // outside this, too few to publish
      if (!buckets.has(lo)) buckets.set(lo, []);
      buckets.get(lo).push(r.psf);
      n++;
    }
    const med = a => { const s = a.slice().sort((x, y2) => x - y2); return s[Math.floor(s.length / 2)]; };
    const bands = [...buckets.entries()]
      .sort((a, b) => b[0] - a[0])
      // A thin band is a band that says nothing. Dropped rather than drawn.
      .filter(([, v]) => v.length >= 200)
      .map(([lo, v]) => ({ band: `${lo}–${lo + 9}`, medianPsf: med(v), n: v.length }));
    if (!bands.length) return null;
    return {
      bands, n,
      source: hdb.source,
      period: `${hdb.monthsBack ?? 36} months of filed resales`,
      accessedAt: String(hdb.accessedAt).slice(0, 10),
    };
  } catch { return null; }
}
