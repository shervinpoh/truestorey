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
 * rest of the site.
 *
 * It was ALL method and no person: it opened "About this site" above a page
 * count, a town count and an archive count. That is a good answer to "can I
 * trust these numbers" and no answer at all to "who is telling me this",
 * which is the question the word "about" makes a reader expect — and an odd
 * gap on a site published under one named agent's registration.
 *
 * So the order is inverted. Who, then why, then the three principles, then
 * the particulars, then the method that used to be the whole page. The method
 * sections are unchanged: they were never the problem.
 *
 * THE PRINCIPLES ARE NOT ASPIRATIONS. Each one names the thing in the product
 * that already enforces it, because a stated value with no mechanism behind it
 * is marketing, and this site's entire argument is that claims are worth less
 * than disclosed arithmetic against a cited source. Saying so and then
 * printing three unfalsifiable virtues would lose the argument on its own
 * page.
 *
 * The first-person copy is a DRAFT for Shervin to approve or rewrite. Nothing
 * biographical is asserted anywhere on it — no history, no track record, no
 * story — because none of that is in this repository, and inventing a
 * person's background is not a thing to do on their behalf. A portrait
 * belongs at the top and there is none in the repo yet.
 */
export default function Page() {
  const cat = catalogue();
  const urls = allUrls().urls || [];
  const a = archive();
  const name = process.env.NEXT_PUBLIC_AGENT_NAME || 'Shervin Poh';

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title={`Hi, I’m ${name.split(' ')[0]}`}
        sub="I am a licensed agent, and this is the site I wanted to exist." />

      <section className="pane">
        {/* ─────────────────────────────────────────────────────────────────
            PLACEHOLDER ORIGIN — written to be replaced.

            Shervin asked for something to stand here until he writes his own.
            It is deliberately an origin for the SITE and not a biography of
            the person: every sentence below is checkable against this
            repository or against what HDB and URA publish, and not one of
            them asserts anything about his history, his track record or his
            clients. A model writing a person's past from nothing is how a bio
            becomes a fabrication, and this one goes out under a real CEA
            registration number.

            When the real version arrives, replace the two paragraphs. Keep
            the property that makes this safe: say why the SITE exists, and
            let the person say the rest in his own words.
            ───────────────────────────────────────────────────────────────── */}
        <p className="lede" style={{ maxWidth: '68ch' }}>
          The data has always been public. HDB publishes every filed resale; URA publishes every
          private transaction. What has never been public is the <em>working</em> — those figures
          reach most people as a spreadsheet nobody can read, or from behind a subscription, or
          as one confident valuation with the arithmetic taken out of it.
        </p>
        <p className="lede" style={{ maxWidth: '68ch' }}>
          Truestorey is the working. Nothing here is a number I am asking you to take on trust:
          it is a number with its source, its period and its limits printed beside it, and where
          something could not be measured the page says so instead of quietly rounding it to
          nothing. It is free, there is no account, and no tier holds anything back — that is the
          position, not an introductory offer.
        </p>

        <div className="sh" style={{ marginTop: 22 }}><span>Three rules I hold this site to</span></div>
        <div className="note"><b>If the source cannot be shown, it does not publish.</b> Every
          derived figure on the site prints the dataset and the period beside it. Where a check
          could not run, the page says so rather than scoring it as nothing to worry about.</div>
        <div className="note"><b>A range is more honest than a single valuation.</b> Nothing here
          will ever give you one number for what a home is worth, because no public dataset can
          see your floor, your facing, your renovation or your lease.</div>
        <div className="note"><b>A useful tool should not need your phone number.</b> There is no
          number field on this site. Consent is per channel, it is never bundled, and an enquiry
          is not consent to be called.</div>

        <p className="prov" style={{ marginTop: 16 }}>
          {name}{process.env.NEXT_PUBLIC_CEA_REG ? ` · CEA Reg. No. ${process.env.NEXT_PUBLIC_CEA_REG}` : ''}
          {process.env.NEXT_PUBLIC_AGENCY ? ` · ${process.env.NEXT_PUBLIC_AGENCY}` : ''}
        </p>
      </section>

      <section className="pane">
        <div className="sh"><span>What the site is made of</span></div>
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
