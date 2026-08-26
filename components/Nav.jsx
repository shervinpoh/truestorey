import Link from 'next/link';

/**
 * The global nav.
 *
 * This exists because search traffic does not land on the homepage — it lands
 * on a block page, deep in the site, and until now every one of those was a
 * dead end. Someone who arrived at Blk 275A had no way to discover the MOP
 * tracker, the market page or anything written. One nav, on every page, is
 * the cheapest fix for that in the whole build.
 *
 * Server component. `here` is the pathname prefix, used for aria-current —
 * which is also what the underline hangs off, so the styling and the
 * accessibility state can never disagree.
 */
/*
 * Landed used to be folded under a "Private" link that pointed at /condo, so
 * /landed existed and nothing on the site led to it — 786 streets unreachable
 * unless you typed the URL. Each property type now gets its own entry.
 *
 * Nothing is listed here that does not resolve. A nav link to a page that
 * does not exist yet is worse than a shorter nav.
 */
const LINKS = [
  { href: '/insights', label: 'Latest', match: ['/insights'] },
  { href: '/archive', label: 'Policy & data', match: ['/archive'] },
  { href: '/map', label: 'Map', match: ['/map'] },
  { href: '/hdb', label: 'HDB', match: ['/hdb'] },
  { href: '/condo', label: 'Condo', match: ['/condo'] },
  { href: '/landed', label: 'Landed', match: ['/landed'] },
  { href: '/market', label: 'Rates', match: ['/market'] },
  { href: '/mop', label: 'MOP', match: ['/mop'] },
  { href: '/tools', label: 'Tools', match: ['/tools', '/plan', '/floors', '/yield', '/blindspot', '/floorplan', '/neighbourhood'] },
  { href: '/guides', label: 'Guides', match: ['/guides'] },
  { href: '/about', label: 'About', match: ['/about'] },
];

export default function Nav({ here = '' }) {
  return (
    <nav className="gnav" aria-label="Primary">
      <div className="in">
        <Link href="/" className="mk">True<b>storey</b></Link>
        <ul>
          {LINKS.map(l => {
            const on = l.match.some(m => here === m || here.startsWith(m + '/'));
            return (
              <li key={l.href}>
                <Link href={l.href} className="n" aria-current={on ? 'page' : undefined}>{l.label}</Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
