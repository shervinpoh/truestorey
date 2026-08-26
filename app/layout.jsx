import './globals.css';
import Track from '../components/Track.jsx';
import NavHere from '../components/NavHere.jsx';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.sg'),
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
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <Track />
        <NavHere />
        {children}
        {/* CEA PG 02-11 s7.1 — particulars required on every page. Do not remove. */}
        <footer className="site">
          <div className="shell">
            <span className="lab">
              {a.name} · CEA Reg. No. {a.cea} · {a.agency} · Licence No. {a.lic} · {a.phone}<br />
              Figures are derived from public government data and are not a valuation or an offer.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
