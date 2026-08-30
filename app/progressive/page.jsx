import { Suspense } from 'react';
import Masthead from '../../components/Masthead.jsx';
import Progressive from '../../components/Progressive.jsx';

export const metadata = {
  title: 'Paying for a home still being built — the progressive payment ladder | Truestorey',
  description: 'What you pay, in what order, for a property under construction — the statutory schedule quoted from the Housing Developers Rules, with what the bank draws and what the instalment climbs to. Free, nothing saved.',
  alternates: { canonical: '/progressive' },
};

export default function Page() {
  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Paying for a home still being built"
        sub="The nine stages a developer may bill you for, in the order the law sets them — and what your loan and your instalment are doing at each one." />
      <section className="pane">
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <Progressive />
        </Suspense>
      </section>
    </main>
  );
}
