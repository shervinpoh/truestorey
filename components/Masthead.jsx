import Link from 'next/link';

/**
 * Page head: breadcrumb, title, standfirst.
 *
 * The wordmark used to live here and now lives in the global nav, so it is
 * gone from this component — two wordmarks on one screen is how a page starts
 * looking assembled rather than designed. The "working name" tag is gone too.
 *
 * Server component. No state.
 */
export default function Masthead({ crumbs = [], title, sub, kicker }) {
  return (
    <header className="mast">
      {crumbs.length > 0 && (
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={c.href}>{i > 0 && <span aria-hidden="true"> / </span>}<Link href={c.href}>{c.label}</Link></span>
          ))}
        </nav>
      )}
      {kicker && <span className="lab" style={{ display: 'block', marginBottom: 8 }}>{kicker}</span>}
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </header>
  );
}
