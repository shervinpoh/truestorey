import Link from 'next/link';
import Masthead from '../../../components/Masthead.jsx';

export const metadata = { title: 'Updates stopped | Truestorey', robots: { index: false } };

/** Withdrawal, confirmed in as few words as it takes. */
export default async function Page({ searchParams }) {
  const q = await searchParams;
  const bad = q?.state === 'bad';
  const block = q?.b;

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]}
        title={bad ? 'That link has already been used' : 'Stopped.'} />
      <section className="pane">
        <div className="note">
          {bad
            ? <>Nothing is being sent to you from that link — either it has been used already or the
              subscription was ended earlier. Either way, no updates are going out.</>
            : <><b>No more updates{block ? <> for {block}</> : null}.</b> The record has been
              deleted, not flagged — your address and the block are gone from the table rather
              than sitting in it marked inactive.</>}
        </div>
        <p className="hint">
          Everything on this site stays free and needs no sign-up. Nothing was ever held back for
          subscribers, so nothing closes off now.
        </p>
        <ul className="idx" style={{ marginTop: 16 }}>
          <li><Link href="/hdb"><span className="n">Look up a block</span><span className="s">Every filed transaction, by town</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
