import Link from 'next/link';
import Masthead from '../../../components/Masthead.jsx';

export const metadata = { title: 'Updates confirmed | Truestorey', robots: { index: false } };

/**
 * Where the confirmation link lands. Four states, each said plainly — a link
 * that has expired or been used already must not look like a success, because
 * a reader who believes they are subscribed and is not will never find out.
 */
export default async function Page({ searchParams }) {
  const q = await searchParams;
  const state = q?.state || 'ok';
  const block = q?.b || 'your block';

  const copy = {
    ok:    ['You are on the list.', <>Updates for <b>{block}</b> start with the next transaction filed there. Nothing is sent when nothing has been filed, so a quiet month means a quiet month.</>],
    bad:   ['That link has expired or has already been used.', <>Confirmation links work once. Open the block again and ask for updates a second time — it takes a moment.</>],
    off:   ['Updates are not switched on for this deployment.', <>Nothing was saved and nothing will be sent. This is a configuration gap, not a decision about you.</>],
    error: ['Something went wrong confirming that.', <>Nothing was changed. Try the link again, and if it still fails the sign-up can simply be repeated.</>],
  }[state] || null;

  const [title, body] = copy || copy_default();

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title={title} />
      <section className="pane">
        <div className="note">{body}</div>
        <div className="note">
          <b>You can stop at any time.</b> Every update carries a one-click link that ends it, and
          ending it deletes the record rather than flagging it. No reply to anybody is needed.
        </div>
        <ul className="idx" style={{ marginTop: 16 }}>
          <li><Link href="/hdb"><span className="n">Look up another block</span><span className="s">Every filed transaction, by town</span></Link></li>
          <li><Link href="/mop"><span className="n">When flats can start selling</span><span className="s">Blocks reaching their fifth year, by town and year</span></Link></li>
        </ul>
      </section>
    </main>
  );
}

const copy_default = () => ['That link did not work.', 'Nothing was changed.'];
