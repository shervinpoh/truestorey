import './globals.css';
import Track from '../components/Track.jsx';
import NavHere from '../components/NavHere.jsx';
import SiteFooter from '../components/SiteFooter.jsx';

export const metadata = {
  // See the note in app/sitemap.js: a fallback that does not resolve is worse
  // than an ugly one, because it goes into every canonical and OG URL.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app'),
  title: {
    default: 'Truestorey — every block, in filed numbers',
    template: '%s',
  },
  description: 'Every filed HDB resale and private transaction in Singapore, by block and by project. Observed price ranges, what a sale would net, and what is within walking reach. Free, no sign-up.',
  openGraph: { siteName: 'Truestorey', locale: 'en_SG', type: 'website' },
};

export default function RootLayout({ children }) {
  const a = {
    name: process.env.NEXT_PUBLIC_AGENT_NAME,
    cea: process.env.NEXT_PUBLIC_CEA_REG,
    agency: process.env.NEXT_PUBLIC_AGENCY,
    lic: process.env.NEXT_PUBLIC_AGENCY_LICENCE,
    phone: process.env.NEXT_PUBLIC_AGENT_PHONE,
  };
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Archivo carries a width axis, so semi-condensed headlines are a
            variation setting rather than a second family — the `wdth` range is
            requested here or the axis is not served. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,400..800&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <Track />
        <NavHere />
        {children}
        <SiteFooter name={a.name} cea={a.cea} agency={a.agency} lic={a.lic} phone={a.phone} />
      </body>
    </html>
  );
}
