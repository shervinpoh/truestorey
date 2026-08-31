import Masthead from '../../components/Masthead.jsx';
import Ledger from '../../components/Ledger.jsx';

export const metadata = {
  title: 'What owning it actually costs — the ledger before the property does anything | Truestorey',
  description: 'Stamp duty, interest, commission, and the CPF interest accruing against your home the whole time you live in it. What a sale must clear to return your own money, and what it would take to have kept pace with the CPF Ordinary Account rate. Free, nothing saved.',
  alternates: { canonical: '/cost' },
};

export default function Page() {
  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="What owning it actually costs"
        sub="Every price conversation is about what a home is worth. This one is about what it costs to hold, whatever it turns out to be worth." />
      <section className="pane">
        <Ledger />
      </section>
    </main>
  );
}
