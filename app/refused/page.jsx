import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import { GROUPS, ALL } from '../../lib/refusals.js';

export const metadata = {
  title: 'What this site refuses to tell you, and why | Truestorey',
  description: 'Fifteen things Truestorey has been asked for and declined — a valuation, a launch-price projection, a project score, walking times, a shaded school radius — each with the reason and the file that enforces it.',
  alternates: { canonical: '/refused' },
};

/**
 * The shortest honest answer to "why does that site have more features?"
 *
 * A reader comparing three property sites sees a shorter list here and cannot
 * tell a gap from a decision. Every entry below was specifically proposed — by
 * a written brief, by a competitor's product, or by the obvious reading of the
 * data — and turned down for a reason that still holds. Nothing that is merely
 * unbuilt appears here: a backlog is not a principle, and padding it with
 * "could but haven't" would make the whole page worthless.
 *
 * Each entry names the file whose comment carries the full argument, so this
 * can be checked rather than believed. That is the same contract as every
 * figure on the site.
 */
export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }]}
        title="What this site refuses to tell you"
        sub={`${ALL.length} things it has been asked for and turned down, each with the reason and the file that enforces it.`} />

      <section className="pane">
        <p className="lede" style={{ maxWidth: '68ch' }}>
          Every property site in Singapore has a longer feature list than this one. Some of that is
          work not done yet. Most of it is on this page, and none of it is here because it was
          difficult.
        </p>
        <p className="lede" style={{ maxWidth: '68ch', marginTop: 12 }}>
          A refusal is only worth anything if you can check it, so each one names the file whose
          comment carries the argument. Nothing that is simply unbuilt is listed — a backlog is not
          a principle.
        </p>
      </section>

      {GROUPS.map(g => (
        <section className="pane" key={g.id} id={g.id}>
          <h2 className="sh"><span>{g.title}</span></h2>
          <p className="lede" style={{ maxWidth: '66ch', marginTop: 0 }}>{g.lede}</p>
          <ul className="refusals">
            {g.items.map(i => (
              <li key={i.what}>
                <h3>{i.what}</h3>
                <p className="asked"><b>Asked for:</b> {i.asked}</p>
                <p className="why">{i.why}</p>
                {i.instead && <p className="instead"><b>What is there instead:</b> {i.instead}</p>}
                <p className="prov">
                  <span className="ruletag">{i.rule}</span>
                  <span className="mono">{i.where}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="pane">
        <div className="note">
          <b>Two of these are not refusals but corrections.</b> The repeat-sales tool and the
          school radius were both built before the objection was found — one was deleted after it
          produced a confident answer out of fifteen different families&rsquo; homes, the other
          after the claim it made turned out to be stronger than the measurement behind it. Getting
          it wrong first is the ordinary way this list grows.
        </div>
        <div className="sh" style={{ marginTop: 22 }}><span>What is there instead</span></div>
        <ul className="idx">
          <li><Link href="/blindspot"><span className="n">Six checks against filed records</span>
            <span className="s">Scored by a formula printed on the page, and it says so when a check could not run</span></Link></li>
          <li><Link href="/land"><span className="n">What the land cost</span>
            <span className="s">Every government land sale since 1993, the winning tender and every losing bid — the floor under a launch price, without projecting one</span></Link></li>
          <li><Link href="/cost"><span className="n">What owning it costs</span>
            <span className="s">Every duty, interest and commission, against what the same home actually lets for</span></Link></li>
          <li><Link href="/about"><span className="n">Who publishes this, and under what registration</span>
            <span className="s">Everything here goes out under one licensed agent&rsquo;s number</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
