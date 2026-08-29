import Link from 'next/link';
import { NAV } from '../lib/nav.js';

/**
 * The footer.
 *
 * It used to be two centred lines of 9px mono, which meant every page on the
 * site ended in several hundred pixels of white and then a disclaimer. Three
 * things were wrong with that. The void read as an unfinished page. Search
 * traffic lands deep — on a block page, from Google — and the bottom of that
 * page is where a reader who has finished looks for what else is here, and
 * found nothing. And the compliance line, which is the one thing that has to
 * be on every page, sat alone in the emptiest part of the design, which is
 * where the eye has already stopped.
 *
 * So: the same list the nav renders, in columns. Thirteen thousand pages that
 * previously linked almost nowhere now each link to every section.
 *
 * Deliberately NOT here: dataset freshness. It would have to be read from
 * data/index.json, and this component renders inside the root layout, which
 * would put a runtime data read into every route in the app — including the
 * dynamic ones, whose serverless bundles are traced by following imports the
 * tracer cannot resolve for this data layer. That failure has already been had
 * twice and it only shows up in production. Provenance stays per-page, on the
 * .prov line beside the figures it belongs to, which is what CEA PG 02-11 s3.1
 * asks for anyway.
 *
 * Server component. No state, no reads.
 */
export default function SiteFooter({
  name, cea, agency, lic, phone,
}) {
  return (
    <footer className="site">
      <div className="shell wide">
        <nav className="fnav" aria-label="Footer">
          {NAV.map(g => (
            <div className="fcol" key={g.group}>
              <span className="lab">{g.group}</span>
              <ul>
                {g.items.map(l => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.panelLabel || l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="fcol fsay">
            <span className="lab">Truestorey</span>
            <p>Every filed HDB resale and private transaction in Singapore, by
              block and by project — derived from public government data, with
              the source and the period printed beside every figure.</p>
            <p className="ffree">Free to use. No sign-up, no account, no cookies.</p>
          </div>
        </nav>

        {/* CEA PG 02-11 s7.1 — particulars required on every page. Do not remove. */}
        <p className="lab flegal">
          {name} · CEA Reg. No. {cea} · {agency} · Licence No. {lic} · {phone}<br />
          Figures are derived from public government data and are not a valuation or an offer.
        </p>
      </div>
    </footer>
  );
}
