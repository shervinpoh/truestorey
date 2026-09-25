import Link from 'next/link';
import { NAV, SITUATIONS } from '../lib/nav.js';
import FollowWhatsApp from './FollowWhatsApp.jsx';

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
 * The first replacement copied the ENTIRE nav into columns. That solved the
 * empty ending and created a second site directory on every page: twelve tool
 * links in the footer immediately after /tools had deliberately hidden that
 * inventory behind three situations. The footer now keeps the hubs and those
 * same three paths. Every individual route remains in /tools and the sitemap;
 * a page ending should offer direction, not reproduce the sitemap visually.
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
  const lookups = NAV.find(g => g.group === 'Look up').items.filter(i =>
    ['/map', '/hdb', '/condo', '/landed'].includes(i.href));
  const tools = [NAV.find(g => g.group === 'Tools').items.find(i => i.href === '/tools'), ...SITUATIONS];
  const read = NAV.find(g => g.group === 'Read').items;
  const groups = [
    { group: 'Look up', items: lookups },
    { group: 'Tools', items: tools },
    { group: 'Read', items: read.filter(i => i.top) },
  ];
  const how = read.filter(i => !i.top);

  return (
    <footer className="site">
      <div className="shell wide">
        {/* First in the footer, above the directory, because the end of a page
            is where a reader who found it useful decides whether to come back.
            Renders nothing if the channel is not configured. */}
        <FollowWhatsApp where="footer" variant="band" />
        <nav className="fnav" aria-label="Footer">
          {groups.map(g => (
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

        <nav className="fsecondary" aria-label="How this site works">
          {how.map(l => <Link href={l.href} key={l.href}>{l.label}</Link>)}
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
