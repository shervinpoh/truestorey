import { archive } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import Archive from '../../components/Archive.jsx';

export const metadata = {
  title: 'Policy and data archive — Singapore residential property | Truestorey',
  description: 'Every official announcement and data release that moves Singapore residential property, dated and linked to its primary source.',
  alternates: { canonical: '/archive' },
};

export default function Page() {
  const a = archive();
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Policy and data archive"
        sub="Every official announcement and data release that moves Singapore residential property — dated, and linked to where it was published. Facts here; what they mean is in the notes." />
      <section className="pane">
        {!a?.entries?.length ? (
          <div className="note"><b>Not built yet.</b> Run <code>npm run ingest:archive</code>.</div>
        ) : (
          <>
            <Archive entries={a.entries} counts={a.counts} />
            <div className="note" style={{ marginTop: 26 }}>
              <b>Primary sources only.</b> Everything here is a government announcement or a public
              dataset, linked to the original. Nothing is a rewrite of another publication&apos;s
              reporting — partly because that would be their work rather than mine, and partly because
              an archive of primary sources is simply better than one assembled from everyone
              else&apos;s coverage of them.
            </div>
            <p className="prov">
              {a.counts?.manual} entries added by hand · {a.counts?.derived} derived from the datasets ·
              rebuilt {String(a.builtAt).slice(0, 10)}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
