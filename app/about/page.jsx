import Link from 'next/link';
import { catalogue, allUrls, archive } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';

export const metadata = {
  title: 'About — who writes this and where the numbers come from | Truestorey',
  description: 'Who is behind Truestorey, what the data is, where it comes from, and the rules the site holds itself to.',
  alternates: { canonical: '/about' },
};

/**
 * The page a sceptical reader goes to before deciding whether to believe the
 * rest of the site. It is therefore mostly about method and limits, not about
 * him — anyone can claim expertise, and this site's whole argument is that
 * claims are worth less than disclosed arithmetic against a cited source.
 */
export default function Page() {
  const cat = catalogue();
  const urls = allUrls().urls || [];
  const a = archive();
  const name = process.env.NEXT_PUBLIC_AGENT_NAME || 'Shervin Poh';

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="About this site"
        sub={`Written by ${name}. Every figure comes from public government data, and every page shows which dataset and which period it came from.`} />

      <section className="pane">
        <div className="kpi3">
          <div><div className="v">{urls.length ? urls.length.toLocaleString('en-SG') : '13,269'}</div>
            <span className="lab">Pages</span></div>
          <div><div className="v">{cat.hdbTowns?.length || 0}</div><span className="lab">HDB towns</span></div>
          <div><div className="v">{a?.entries?.length || 0}</div><span className="lab">Archive entries</span></div>
        </div>
      </section>

      <section className="pane">
        <div className="sh"><span>Where the numbers come from</span></div>
        <div className="row"><span>HDB resale transactions<small>Every filed resale, by block</small></span>
          <span className="mono">data.gov.sg</span></div>
        <div className="row"><span>Private transactions<small>Condos, apartments and landed, by project or street</small></span>
          <span className="mono">URA Data Service</span></div>
        <div className="row"><span>Resale Price Index<small>Quarterly, back to 1990</small></span>
          <span className="mono">data.gov.sg</span></div>
        <div className="row"><span>Interest rates<small>SORA, daily</small></span><span className="mono">MAS</span></div>
        <div className="row"><span>Stations, schools, hawker centres, parks<small>Placed against every block</small></span>
          <span className="mono">LTA · MOE · NEA · NParks</span></div>
        <div className="row"><span>Coordinates<small>Every block and project geocoded</small></span>
          <span className="mono">OneMap · SLA</span></div>
        <p className="prov" style={{ marginTop: 14 }}>
          {cat.hdbSource} · {cat.hdbPeriod?.from} to {cat.hdbPeriod?.to}<br />
          {cat.privateSource} · {cat.privatePeriod?.from} to {cat.privatePeriod?.to}
        </p>
      </section>

      <section className="pane">
        <div className="sh"><span>What this site will not do</span></div>
        <div className="note"><b>It will never give you one valuation number.</b> Valuation tools
          routinely disagree by S$15,000 to S$80,000 on the same home, because none of them can see
          your floor, your facing, your renovation or your lease. Every page here shows the observed
          range and the transactions behind it, and lets you decide where inside it you sit.</div>
        <div className="note"><b>It will never tell you something is undervalued or a good deal.</b>
          Those are opinions dressed as findings. What you get instead is disclosed arithmetic against
          a cited source, and the arithmetic is on the page.</div>
        <div className="note"><b>It will never reproduce someone else&apos;s reporting.</b> The
          <Link href="/archive"> archive</Link> indexes primary sources — government announcements and
          public datasets — and links to them. Anything written here in my own voice is signed and
          dated, and is clearly separate from the facts it is built on.</div>
        <div className="note"><b>Distances are straight-line, and always say so.</b> What sits between
          two points — a canal, an expressway, a park connector — is in no dataset available to me, so
          a walking time would be a guess presented as a measurement. The one exception is the MOE 1km
          school band, which is measured as a straight line by MOE itself.</div>
      </section>

      <section className="pane">
        <div className="sh"><span>Free, and free of the usual strings</span></div>
        <p className="sub" style={{ maxWidth: '64ch' }}>
          No account, no sign-up, nothing held back for subscribers. The site sets no cookies and the
          analytics record no IP address and no personal data — which is why there is no consent
          banner in your way. If you fill in the contact form, that is the only point at which
          anything about you is stored, and you choose per channel whether I may contact you.
        </p>
      </section>

      <section className="pane">
        <div className="sh"><span>Start somewhere</span></div>
        <ul className="idx">
          <li><Link href="/insights"><span className="n">The latest writing</span>
            <span className="s">Short notes when something moves, longer pieces most weeks</span></Link></li>
          <li><Link href="/archive"><span className="n">The policy and data archive</span>
            <span className="s">Every official release, dated and linked</span></Link></li>
          <li><Link href="/hdb"><span className="n">Look up a block</span>
            <span className="s">Every HDB block and private project with a filed transaction</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
