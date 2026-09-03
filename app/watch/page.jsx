import Masthead from '../../components/Masthead.jsx';
import WatchList from '../../components/WatchList.jsx';
import { configured as mailConfigured } from '../../lib/email.js';

export const metadata = {
  title: 'Blocks you are watching | Truestorey',
  description: 'The blocks this browser is watching for new filed transactions. Kept on your device, with no account.',
  alternates: { canonical: '/watch' },
  robots: { index: false },
};

/**
 * The page that was missing between confirming a watch and hearing from one.
 *
 * A reader could subscribe, get an email, click a link, and then never see
 * the subscription mentioned again anywhere on the site. It existed on the
 * server and nowhere a person could look.
 *
 * noindex, because it is about one browser and is empty for everybody else —
 * a search result promising "blocks you are watching" that renders nothing is
 * worse than no result.
 */
export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]}
        title="Blocks you are watching"
        sub="Kept in this browser, with no account and nothing sent anywhere." />
      <section className="pane">
        <WatchList canWatch={mailConfigured()} />
      </section>
    </main>
  );
}
