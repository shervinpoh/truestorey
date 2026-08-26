import Link from 'next/link';
import { allGuides } from '../../lib/guides.js';
import Masthead from '../../components/Masthead.jsx';

export const metadata = {
  title: 'Guides — what buying, selling and renting in Singapore actually costs | Truestorey',
  description: 'The full guides, free and complete: stamp duties, financing rules, decoupling, and both sides of renting. No sign-up, no email wall, nothing gated.',
  alternates: { canonical: '/guides' },
};

export default function Page() {
  const guides = allGuides();
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Guides"
        sub="The whole thing, free. Every rule, every rate and every table, the same ones behind the numbers on this site." />

      <section className="pane">
        {guides.length === 0 ? (
          <div className="warn"><p style={{ margin: 0 }}>Not built yet. Run <code>npm run build:guides</code>.</p></div>
        ) : (
          <ul className="guidelist">
            {guides.map(g => (
              <li key={g.slug}>
                <Link href={g.href}>
                  <span className="n">{g.title}</span>
                  <span className="b">{g.blurb}</span>
                  <span className="s mono">{g.minutes} min read · nothing gated</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pane">
        <div className="note">
          <b>These are not lead magnets.</b> There is no form in front of them, no email wall and no
          shortened version. A guide that costs you an email address to read is not a guide, it is a
          price, and the whole argument of this site is that this layer should be free.
        </div>
        <div className="note">
          <b>What is worth a conversation is your version of it.</b> The guide tells you how ABSD
          works. Running it against your block, your lease, your CPF and your timeline is a different
          job, and that one genuinely needs a person. That is the only thing here you have to ask for.
        </div>
        <div className="note">
          <b>They are generated, not written twice.</b> Every guide is built from the same research
          base as the decks, so a figure cannot say one thing here and another in a meeting. Change a
          rate once and it lands in both.
        </div>
      </section>
    </main>
  );
}
