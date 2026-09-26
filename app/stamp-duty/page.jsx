import { shareCard } from '../../lib/og.js';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import { Duty, RatesSources } from '../../components/Tools.jsx';
import { RATES_REVIEWED } from '../../lib/calc/constants.js';

export const metadata = {
  ...shareCard('/stamp-duty'),
  title: 'Stamp duty on a price — BSD and ABSD, band by band | Truestorey',
  description: 'Buyer’s Stamp Duty and Additional Buyer’s Stamp Duty on one price, band by band, at the rates in force. Free, no sign-up.',
  alternates: { canonical: '/stamp-duty' },
};

/**
 * Both buyer’s stamp duties on one price.
 *
 * ── WHY IT HAS ITS OWN PAGE ────────────────────────────────────────────────
 * It lived only as a tab on /tools, linked as /tools?calc=duty. Shervin, 26
 * Sep: "stamp duty on a price" and "when can I sell" in the Tools menu
 * "bring me to the same page" — both opened the top of /tools, under the
 * heading "Tools", with the calculator a screen further down. Every other
 * tool in the menu is a page of its own; now this one is too. The tab on
 * /tools stays, and old /tools?calc= links still open it.
 */
export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Stamp duty on a price"
        sub="Both buyer’s stamp duties on one price, band by band, at the rates in force." />
      <ToolIntro href="/stamp-duty" example="figures" lean shares={false} />
      <ToolUse id="stamp-duty" />
      <section className="pane">
        <Duty />
        <p className="prov" style={{ marginTop: 26 }}><RatesSources ratesReviewed={RATES_REVIEWED} /></p>
      </section>
    </main>
  );
}
