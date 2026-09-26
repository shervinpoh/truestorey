import { shareCard } from '../../lib/og.js';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import LandView from '../../components/LandView.jsx';
import { glsAwards, glsLanded, hdbSitesLinked } from '../../lib/data/query.js';
import PageFigure from '../../components/PageFigure.jsx';

export const metadata = {
  ...shareCard('/land'),
  title: 'What developers paid for the land — every awarded GLS site since 1993 | Truestorey',
  description: 'Every Government Land Sales site URA has awarded, with the winning tender, the rate per square metre and the number of bids. The floor under any launch price, published and sourced.',
  alternates: { canonical: '/land' },
};

export default function Page() {
  const ura = glsAwards();
  const hdb = hdbSitesLinked();
  const d = withLanded(merge(ura, hdb), glsLanded());
  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="What developers paid for the land"
        sub="Every Government Land Sales site URA has awarded since 1993 — the winning tender, the rate, and how many wanted it." />
      <ToolIntro href="/land" compact />
      <ToolUse id="land" />

      {(ura?.sites?.length || hdb?.sites?.length) && (
        <PageFigure
          label="Government land sale sites awarded"
          value={((ura?.sites?.length || 0) + (hdb?.sites?.length || 0)).toLocaleString('en-SG')}
          unit="sites"
          support={`${(ura?.sites?.length || 0).toLocaleString('en-SG')} from URA and ${(hdb?.sites?.length || 0).toLocaleString('en-SG')} from HDB, with the winning tender, the rate, and every losing bid the agency published.`}
          note="What a developer paid for land is not what anything built on it is worth. The two are separated by years, a construction cost and a market nobody has seen yet."
          /* The latest award, not only the access date. The page read
             "accessed 24 Sep" while serving URA's 8 Sep sheet, because the
             ingest re-downloaded a stale link: an access date says the site
             looked, not that it found anything new. */
          source={`${ura?.source || 'URA Government Land Sales'} · latest award on file ${String(ura?.latestAward || ura?.sites?.[0]?.award || '').slice(0, 10)} · checked ${String(ura?.accessedAt || '').slice(0, 10)}`} />
      )}

      <section className="pane">
        {d ? <LandView data={d} /> : (
          <div className="warn">
            <p style={{ marginTop: 0 }}><b>The land sales data has not been downloaded yet.</b> In Terminal:</p>
            <p><code>npm run ingest:gls-awards</code></p>
            <p style={{ marginBottom: 0 }}>It reads one spreadsheet from URA and needs no key.</p>
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * URA's landed housing plots, as rows of their own use. Their rate is per m²
 * of SITE area, so it travels as `psmSite` and never enters psmGfaOrGpr: the
 * "Every use" tab shows a dash for them, and only the Landed tab, which
 * relabels its column, shows the site rate.
 */
function withLanded(d, landed) {
  if (!d || !landed?.sites?.length) return d;
  const sites = [...d.sites, ...landed.sites.map(s => ({ ...s, vendor: 'URA', psmGfaOrGpr: null }))]
    .sort((a, b) => (a.award < b.award ? 1 : -1));
  return { ...d, sites, landed: { count: landed.sites.length, fromYear: landed.counts.fromYear,
    toYear: landed.counts.toYear, rateNote: landed.rateNote } };
}

/**
 * URA's sheet and HDB's PDFs, as one series.
 *
 * They are the same programme sold by two agencies, so a reader asking "what
 * did land cost" wants both. The vendor is kept on every row because the two
 * sources do not carry the same columns — only HDB names the project a site
 * became, and only URA's rate column exists at all.
 */
function merge(ura, hdb) {
  if (!ura) return null;
  if (!hdb?.sites?.length) return { ...ura, sites: ura.sites.map(s => ({ ...s, vendor: 'URA' })) };
  const sites = [
    ...ura.sites.map(s => ({ ...s, vendor: 'URA' })),
    ...hdb.sites.map(s => ({
      ...s,
      use: s.kind,
      planningArea: null,
      // HDB does not publish a rate column. Leaving it null is the honest
      // answer; deriving price/GFA here would invent a basis URA's own column
      // is ambiguous about, and the two would then be silently compared.
      psmGfaOrGpr: null,
    })),
  ].sort((a, b) => (a.award < b.award ? 1 : -1));
  return {
    ...ura, sites,
    counts: {
      awarded: sites.length,
      fromYear: sites.at(-1).award.slice(0, 4),
      toYear: sites[0].award.slice(0, 4),
    },
    hdb: { source: hdb.source, sourcePage: hdb.sourcePage, note: hdb.note,
           transcribed: hdb.transcribed, sites: hdb.counts.sites, withProject: hdb.counts.withProject,
           withBidDetail: hdb.counts.withBidDetail,
           // How many of those names resolved to a record here, which is how
           // many rows are actually clickable. Naming a project and being able
           // to link to it are different claims — see lib/land.js.
           linked: new Set(hdb.sites.filter(s => s.record).map(s => s.record.href)).size,
           bids: hdb.sites.reduce((a, s) => a + (s.bidDetail?.length || 0), 0) },
  };
}
