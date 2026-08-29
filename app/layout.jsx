import './globals.css';
import Track from '../components/Track.jsx';
import NavHere from '../components/NavHere.jsx';
import SiteFooter from '../components/SiteFooter.jsx';

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
        <SiteFooter name={a.name} cea={a.cea} agency={a.agency} lic={a.lic} phone={a.phone} />
      </body>
    </html>
  );
}
