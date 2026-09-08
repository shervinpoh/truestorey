import Masthead from '../../components/Masthead.jsx';
import { EVENTS } from '../../lib/analytics.js';
import { CONSENT_COPY } from '../../lib/consent.js';

export const metadata = {
  title: 'Privacy — what is collected, which is almost nothing',
  description:
    'No cookies, no IP address, no fingerprinting, no third-party analytics. What Truestorey '
    + 'records, why there is no consent banner, and what happens to a lead or a block watch.',
};

/**
 * The position lib/analytics.js already took, said out loud to a reader.
 *
 * Everything here is a description of code that exists, not a policy written
 * in the hope the code matches it. If the analytics allowlist changes, this
 * page becomes wrong — which is why the event list below is rendered FROM the
 * allowlist rather than typed beside it.
 */
export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }]}
        title="Privacy"
        sub="No cookies, no IP address, no fingerprinting, and no banner asking you to accept any." />

      <section className="pane">
        <p className="lede">
          A site whose promise is &ldquo;free, no sign-up&rdquo; cannot open with a cookie banner.
          There is no banner here because there is nothing to consent to: the analytics are
          first-party and deliberately non-personal, so no PDPA consent notice is required.
        </p>

        <h2 className="sh"><span>What is not collected</span></h2>
        <ul className="bul">
          <li><b>No cookies.</b> None, of any kind.</li>
          <li><b>No IP address</b> is stored, not even hashed.</li>
          <li><b>No user agent, no screen fingerprint.</b> Only a coarse phone / tablet / desktop
            class, from the window width.</li>
          <li><b>No third-party analytics.</b> No Google Analytics, no tag manager, no pixels.</li>
          <li><b>Nothing you type into a calculator.</b> A price, a salary, a loan, a floor area,
            an address you are researching &mdash; none of it leaves your browser. The tools run
            entirely on your device.</li>
        </ul>

        <h2 className="sh"><span>What is recorded</span></h2>
        <p className="hint">
          A random id per browser tab, held in <code>sessionStorage</code> and destroyed when the
          tab closes. It exists to join one visit&rsquo;s steps into a funnel, is meaningless on its
          own, and cannot be tied back to a person. These are the only event types that exist:
        </p>
        <div className="tablewrap">
          <table className="ledgertable">
            <tbody>
              {Object.entries(EVENTS).map(([k, v]) => (
                <tr key={v}><td className="mono">{v}</td><td>{DESCRIPTIONS[k] || ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Anything the browser sends that is not on that list is discarded before it reaches disk,
          so an accidental extra field cannot leak. Search queries are recorded as typed &mdash; if
          you would not put something in a search box on a public site, do not put it in this one.
        </p>

        <h2 className="sh"><span>If you give an email address</span></h2>
        <p>
          Two places ask for one: the enquiry form and a block watch. Both are optional and neither
          gates anything &mdash; every figure and every tool works without an address.
        </p>
        <ul className="bul">
          <li><b>Consent is per-channel and never bundled.</b> PDPA s14(2) makes bundled consent
            void. The tick is separate and can be left unticked while still sending an enquiry.</li>
          <li><b>Email only.</b> No phone number is collected and no call or message will come from
            this site. A field asking for a number it promised never to use was removed rather than
            reworded.</li>
          <li><b>An inbound message is not consent.</b> Writing does not opt you in; only the tick
            does.</li>
          <li><b>A block watch stops in one click,</b> from a link in every message it sends.</li>
        </ul>
        {CONSENT_COPY?.email && (
          <div className="note">
            <b>The exact wording you are agreeing to:</b> &ldquo;{CONSENT_COPY.email}&rdquo;
          </div>
        )}

        <h2 className="sh"><span>Where it is kept</span></h2>
        <p className="hint">
          Events and any address you give are stored in a database operated for this site alone and
          are not sold, shared, or used to build a profile. The site is served from Vercel, which
          receives the request as any web host does. Data sources are queried at build time, not by
          your browser, so looking something up here does not tell a government API who asked.
        </p>

        <h2 className="sh"><span>Asking what is held, or removing it</span></h2>
        <p>
          Under PDPA you may ask what personal data is held about you and ask for it to be deleted.
          Given the above, the only thing that can exist is an email address you typed yourself.
          Ask through <a href="/about">the contact on the about page</a> and it will be removed.
        </p>
      </section>
    </main>
  );
}

/* Beside the generated list rather than inside it: lib/analytics.js is the
   authority on which events exist, and this page is only the plain English. An
   event added there with no line here shows as blank, which is a visible gap
   rather than a silent omission. */
const DESCRIPTIONS = {
  VIEW: 'A page was opened — the path, a coarse device class, and the referring site if any.',
  SEARCH: 'A search ran — the query and how many results it found.',
  SEARCH_EMPTY: 'A search found nothing — the query, so the gap can be fixed.',
  SEARCH_PICK: 'A result was chosen — the query and which page.',
  RECORD: 'A block or project page was opened.',
  PROCEEDS: 'A sale-proceeds calculator was used. No figures, only that it ran.',
  LEAD_START: 'The first keystroke in the enquiry form. No content.',
  LEAD_SUBMIT: 'An enquiry was sent, and whether the consent box was ticked. No name, email or message.',
  TOOL_RUN: 'A tool was actually used — its name only, once per tab.',
  SITUATION: 'A guided path was taken from the tools page.',
  VITALS: 'How fast the page was: load, layout stability, response to the first interaction.',
};
