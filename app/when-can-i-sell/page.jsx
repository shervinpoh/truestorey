import { shareCard } from '../../lib/og.js';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import { Sell, RatesSources } from '../../components/Tools.jsx';
import { RATES_REVIEWED } from '../../lib/calc/constants.js';

export const metadata = {
  ...shareCard('/when-can-i-sell'),
  title: 'When can I sell? — the MOP date and Seller’s Stamp Duty | Truestorey',
  description: 'The date your minimum occupation period ends, and when Seller’s Stamp Duty stops applying, from the date you bought. Free, no sign-up.',
  alternates: { canonical: '/when-can-i-sell' },
};

/**
 * The two dates that govern a sale.
 *
 * ── WHY IT HAS ITS OWN PAGE ────────────────────────────────────────────────
 * It lived only as a tab on /tools, linked as /tools?calc=sell. Shervin, 26
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
        title="When can I sell?"
        sub="The date the minimum occupation period ends, and when Seller’s Stamp Duty stops applying." />
      <ToolIntro href="/when-can-i-sell" example="figures" lean shares={false} />
      <ToolUse id="when-can-i-sell" />
      <section className="pane">
        <Sell />
        <p className="prov" style={{ marginTop: 26 }}><RatesSources ratesReviewed={RATES_REVIEWED} /></p>
      </section>
    </main>
  );
}
