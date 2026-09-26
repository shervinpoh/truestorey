import { shareCard } from '../../lib/og.js';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import Ledger from '../../components/Ledger.jsx';
import { priceIndices } from '../../lib/data/query.js';
import { configured as mailConfigured } from '../../lib/email.js';
import FromBack from '../../components/FromBack.jsx';

export const metadata = {
  ...shareCard('/cost'),
  title: 'What owning it actually costs — the ledger before the property does anything | Truestorey',
  description: 'Stamp duty, interest, commission, and the CPF refund with the interest it accrues while you live there — and the price a sale must clear to return your own money, line by line. Free, nothing saved.',
  alternates: { canonical: '/cost' },
};

export default function Page() {
  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="What owning it actually costs"
        sub="What a home costs to hold, and the price a sale must clear to return your money." />
      <FromBack label="the property" />
      <ToolIntro href="/cost" example="figures" lean />
      <ToolUse id="cost" />
      <section className="pane">
        <Ledger indices={priceIndices()} canEmail={mailConfigured()} />
      </section>
    </main>
  );
}
