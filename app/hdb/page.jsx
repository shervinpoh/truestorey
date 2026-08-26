import { allTowns, getIndex } from '../../lib/data/query.js';
import { titleCase } from '../../lib/name.js';
import Masthead from '../../components/Masthead.jsx';
import TownTiles from '../../components/TownTiles.jsx';

export const metadata = {
  title: 'HDB resale prices by town — every block in Singapore | Truestorey',
  description: 'Filed HDB resale transactions for every town and every block, from HDB via data.gov.sg. Median price, median psf and the transactions behind them.',
  alternates: { canonical: '/hdb' },
};

export default function Page() {
  const towns = allTowns();
  const i = getIndex();
  const blocks = towns.reduce((a, t) => a + t.blockCount, 0);
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="HDB, by town"
        sub={`${blocks.toLocaleString('en-SG')} blocks with a filed resale since ${i.hdb?.period?.from ?? ''}. Open a town, then a block \u2014 the block is where the numbers mean something.`} />
      <section className="pane">
        <TownTiles placeholder="Filter towns\u2026"
          items={towns.map(t => ({
            key: t.slug, href: t.href, n: titleCase(t.name), value: t.medianPsf,
            s: `$${t.medianPsf} psf median`,
            b: `${t.blockCount.toLocaleString('en-SG')} blocks`,
          }))} />
        <p className="prov">{i.hdb?.source} \u00b7 {i.hdb?.period?.from} to {i.hdb?.period?.to} \u00b7 accessed {i.hdb?.accessedAt}</p>
      </section>
    </main>
  );
}
