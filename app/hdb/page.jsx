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
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="HDB, by town"
        sub={`${blocks.toLocaleString('en-SG')} blocks with a filed resale since ${i.hdb?.period?.from ?? ''}. Open a town, then a block — the block is where the numbers mean something.`} />
      <section className="pane">
        {/* Real characters, not backslash escapes. Neither a JSX attribute nor
            JSX text is a JS string literal, so neither processes them — this
            file, /condo, /landed and /hdb/[town] all shipped a provenance line
            with the escape sequence for a middot printed where the middot
            should be — on the one line CEA PG 02-11 s3.1 is about. Escapes
            survive only inside a template literal, which is why the `sub`
            above read correctly and everything below it did not.
            test/jsx-escapes.test.js now fails on a new one. */}
        <TownTiles placeholder="Filter towns…"
          items={towns.map(t => ({
            key: t.slug, href: t.href, n: titleCase(t.name), value: t.medianPsf,
            s: `$${t.medianPsf} psf median`,
            b: `${t.blockCount.toLocaleString('en-SG')} blocks`,
          }))} />
        <p className="prov">{i.hdb?.source} · {i.hdb?.period?.from} to {i.hdb?.period?.to} · accessed {i.hdb?.accessedAt}</p>
      </section>
    </main>
  );
}
