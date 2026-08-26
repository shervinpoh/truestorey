import { topics } from '../../lib/insights.js';
import { feed } from '../../lib/articles.js';
import Masthead from '../../components/Masthead.jsx';
import Feed from '../../components/Feed.jsx';
import Follow from '../../components/Follow.jsx';

export const metadata = {
  title: 'Notes and deep dives — Singapore property | Truestorey',
  description: 'Short notes when something moves, longer pieces most weeks. Written against the filed data rather than the press release.',
  alternates: { canonical: '/insights' },
};

export default async function Page() {
  // Files and pipeline rows in one chronological feed. If Supabase is down or
  // unconfigured, this quietly returns the files alone rather than erroring.
  const posts = await feed();
  const tops = topics();
  const notes = posts.filter(p => p.kind === 'note').length;

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Notes and deep dives"
        sub="Short notes when something actually moves. Longer pieces most weeks. Every figure is pulled live from the filed data, so nothing here goes stale without the number going with it." />

      <section className="pane">
        {posts.length === 0 ? (
          <div className="note">
            <b>Nothing published yet.</b> Run <code>npm run note</code> to scaffold today&apos;s entry
            from whatever moved in the data, then write the two sentences that matter.
          </div>
        ) : (
          <>
            <Feed posts={posts} topics={tops} />
            {notes === 0 && (
              <div className="note" style={{ marginTop: 24 }}>
                <b>No short notes yet.</b> The long pieces carry the argument, but the notes are what
                make this worth checking. <code>npm run note</code> scaffolds one from what changed today.
              </div>
            )}
          </>
        )}
        <Follow />
      </section>
    </main>
  );
}
