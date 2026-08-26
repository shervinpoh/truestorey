import { draftArticles, configured } from '../../lib/supabase/rest.js';
import { textOf } from '../../lib/sanitize.js';
import Masthead from '../../components/Masthead.jsx';
import StudioQueue from '../../components/StudioQueue.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Studio — drafts waiting', robots: { index: false, follow: false } };

export default async function Page() {
  if (!configured()) {
    return (
      <main className="shell">
        <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Studio" />
        <div className="warn"><p style={{ margin: 0 }}>
          Supabase is not configured on this deployment. Set <code>SUPABASE_URL</code> and{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>.
        </p></div>
      </main>
    );
  }

  const rows = await draftArticles();
  const drafts = rows.map(r => ({ ...r, words: textOf(r.content_html).split(/\s+/).filter(Boolean).length }));

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Studio"
        sub={`${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting. Nothing here is on the site.`} />
      <section className="pane">
        <StudioQueue drafts={drafts} />
      </section>
      <section className="pane">
        <div className="note">
          <b>Why this page exists.</b> The pipeline can research, draft and format a piece, and it
          cannot be accountable for it. Everything on the site goes out under a CEA registration
          number, and CEA PG 02-11 s3.1 requires market claims to be substantiated by whoever makes
          them. So the last step is a person reading it.
        </div>
        <div className="note">
          <b>Rule 9 still applies.</b> Link a source, never reproduce it. If a draft reads like a
          rewritten news article rather than a reading of the filed data, that is the one to send
          back.
        </div>
      </section>
    </main>
  );
}
