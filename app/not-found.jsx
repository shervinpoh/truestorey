import Link from 'next/link';
import Masthead from '../components/Masthead.jsx';
import Search from '../components/Search.jsx';

export const metadata = {
  title: 'Not found | Truestorey',
  // A 404 that gets indexed is a 404 that competes with the page the reader
  // actually wanted.
  robots: { index: false, follow: true },
};

/**
 * The 404.
 *
 * There wasn't one. Next's default rendered instead: a black full-bleed page
 * with its own type, the site nav still stuck to the top of it, and no way
 * onward. On a site of thirteen thousand generated URLs that is not an edge
 * case — it is what a stale link, a truncated share, a guessed block number
 * and every dropped trailing segment all resolve to.
 *
 * So it is a real page, and it does the one thing that helps: the same
 * typeahead that would have found the block in the first place, then the four
 * indexes, in case the reader would rather browse than guess again. No
 * apology and no illustration; someone who is lost wants the search box.
 *
 * READS NOTHING FROM data/, ON PURPOSE. It first printed the page count, which
 * meant calling allUrls(). This file is not only the root 404: it is also what
 * renders when notFound() is thrown inside a route segment, and every record
 * route sets dynamicParams = true, so on Vercel it renders inside THAT route's
 * serverless function at request time. The data layer resolves its filenames
 * at runtime, which the tracer cannot follow, so whether data/urls.json was in
 * the bundle came down to @vercel/nft's fallback of shipping all of data/ —
 * the fallback next.config.mjs exists to constrain. It would have worked until
 * someone tightened the excludes, and then the 404 page would have been the
 * thing that 500s, in production only, on the one page nobody tests.
 *
 * A count is decoration here. The search box is the value, and it fetches.
 */
export default function NotFound() {
  return (
    <main className="shell">
      <Masthead
        crumbs={[{ href: '/', label: 'Home' }]}
        kicker="404"
        title="That page isn't here"
        sub="The address may have changed, or the block may have no filed resale for it to be built from — a block only gets a page once a sale has actually been filed there."
      />

      <section className="pane">
        <div className="sh"><span>Look up any block or project</span></div>
        <div style={{ marginTop: 14 }}><Search autoFocus /></div>
      </section>

      <section className="pane">
        <div className="sh"><span>Or browse</span></div>
        <ul className="idx">
          <li><Link href="/map"><span className="n">The price map</span>
            <span className="s">Every block and project, plotted by median psf</span></Link></li>
          <li><Link href="/hdb"><span className="n">HDB, by town</span>
            <span className="s">26 towns, every block with a filed resale</span></Link></li>
          <li><Link href="/condo"><span className="n">Condos and apartments</span>
            <span className="s">By project, grouped by district</span></Link></li>
          <li><Link href="/landed"><span className="n">Landed</span>
            <span className="s">By street — URA does not name landed projects</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
