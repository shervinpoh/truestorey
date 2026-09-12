import './globals.css';
import Track from '../components/Track.jsx';
import NavHere from '../components/NavHere.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { agent } from '../lib/agent.js';
import { ldJson, organisation } from '../lib/schema.js';
import Theme from '../components/Theme.jsx';

export const metadata = {
  // See the note in app/sitemap.js: a fallback that does not resolve is worse
  // than an ugly one, because it goes into every canonical and OG URL.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app'),
  title: {
    default: 'Truestorey — every block, in filed numbers',
    template: '%s',
  },
  description: 'Every filed HDB resale and private transaction in Singapore, by block and by project. Observed price ranges, what a sale would net, and what is nearby at straight-line distance. Free, no sign-up.',
  openGraph: { siteName: 'Truestorey', locale: 'en_SG', type: 'website' },
};

export default function RootLayout({ children }) {
  const a = agent();
  return (
    <html lang="en">
      <head>
        {/* Before the body paints, or the reader who chose dark gets a white
            flash on every navigation — which is the one thing choosing dark is
            meant to avoid. It reads only what this site wrote: no
            prefers-color-scheme, because following the operating system is the
            behaviour that was deliberately removed. See components/Theme.jsx. */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{if(localStorage.getItem('truestorey-theme')==='dark')`
          + `document.documentElement.setAttribute('data-theme','dark')}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Archivo carries a width axis, so semi-condensed headlines are a
            variation setting rather than a second family — the `wdth` range is
            requested here or the axis is not served. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,400..800&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {/* Who publishes this and under what registration. The CEA number goes
            in as an identifier with its issuer named, because it is the one
            authority signal on this site a reader can independently check. */}
        <script type="application/ld+json"
          dangerouslySetInnerHTML={ldJson(organisation(a))} />
        <Track />
        <NavHere />
        {children}
        <SiteFooter name={a.name} cea={a.cea} agency={a.agency} lic={a.lic} phone={a.phone} />
        {/* A preference, so it sits with the particulars rather than competing
            with navigation that was measured to fit four choices. */}
        <div className="themebar"><Theme /></div>
      </body>
    </html>
  );
}
