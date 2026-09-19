import { NextResponse } from 'next/server';
import { configured as mailConfigured, send } from '../../../lib/email.js';
import { MAX_BODY, ipOf, isBot, makeThrottle, readJson } from '../../../lib/formguard.js';
import {
  COST_SHARE, COST_DEFAULTS, PLAN_SHARE, PLAN_DEFAULTS,
  PROGRESSIVE_SHARE, PROGRESSIVE_DEFAULTS, decodeShare,
} from '../../../lib/share.js';
import { renderCostReport } from '../../../lib/report/cost.js';
import { renderPlanReport } from '../../../lib/report/plan.js';
import { renderProgressiveReport } from '../../../lib/report/progressive.js';
import { rentFor, recordByHref } from '../../../lib/data/query.js';
import { agent } from '../../../lib/agent.js';

/**
 * "Email me this report" — the half of lib/consent.js's promise that had never
 * existed (NEXT.md §8.2).
 *
 * ── IT SENDS A COPY. IT DOES NOT COLLECT ANYONE ────────────────────────────
 * The address is used once, to send the thing the reader asked for, and is
 * written nowhere: no CRM row, no database, no analytics field. So there is no
 * consent to record and nothing to unsubscribe from, and the page says so in
 * those words.
 *
 * That is deliberate and it is not the whole of §8.2. The section also wants a
 * row in the Property CRM — but the only consent wording this site has ever
 * shown is "Email me the full report AND monthly updates on my block", and
 * making a copy of your own arithmetic conditional on agreeing to monthly
 * updates is precisely the bundled consent PDPA s14(2) voids. A separate tick,
 * with its own wording and its own CONSENT_COPY_VERSION, is Shervin's to
 * approve; `lib/crm.js` is not configured in production today either. Until
 * both exist this route stays transactional, which needs no tick at all.
 *
 * ── THE FIGURES ARE NEVER POSTED ───────────────────────────────────────────
 * The body carries the share fragment and an address. The fragment is decoded
 * by the same validator the page uses and the ledger is recomputed here — see
 * lib/report/cost.js. An endpoint that emails numbers it was handed is a way
 * to send anything to anyone from a verified domain under a CEA registration.
 */
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* Two windows, because they stop different things. The per-connection one
   stops a loop; the per-address one stops this route being used to post the
   same inbox over and over, which is the only real abuse it enables. */
const byIp = makeThrottle({ windowMs: 60 * 60 * 1000, max: 10 });
const byAddress = makeThrottle({ windowMs: 24 * 60 * 60 * 1000, max: 5 });

const TOOLS = {
  cost: { schema: COST_SHARE, defaults: COST_DEFAULTS, path: '/cost', render: renderCostReport },
  plan: { schema: PLAN_SHARE, defaults: PLAN_DEFAULTS, path: '/plan', render: renderPlanReport },
  progressive: {
    schema: PROGRESSIVE_SHARE, defaults: PROGRESSIVE_DEFAULTS, path: '/progressive',
    render: renderProgressiveReport,
  },
};

export async function POST(req) {
  if (!mailConfigured()) {
    // The form is not rendered when this is false, so reaching here is a direct
    // POST. It still answers honestly rather than pretending to have sent one.
    return NextResponse.json({ error: 'Email is not configured on this site.' }, { status: 503 });
  }

  const read = await readJson(req, { max: MAX_BODY });
  if (read.error) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.body;
  if (isBot(body)) return NextResponse.json({ ok: true });

  const tool = TOOLS[String(body.tool || '')];
  if (!tool) return NextResponse.json({ error: 'Unknown report.' }, { status: 400 });

  const email = String(body.email || '').trim().slice(0, 160);
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 });
  }
  if (byIp(ipOf(req)) || byAddress(email.toLowerCase())) {
    return NextResponse.json(
      { error: 'That is a lot of copies of one report. Try again later.' }, { status: 429 });
  }

  const got = decodeShare(tool.schema, String(body.hash || ''));
  if (!got) return NextResponse.json({ error: 'That result could not be read.' }, { status: 400 });
  const values = { ...tool.defaults, ...got.values };

  /* The rent comparison, when the reader named a home — read here rather than
     posted, like every other figure. A missing one drops the section; it never
     fails the send. */
  let market = null;
  if (values.home) {
    const rec = recordByHref(values.home);
    if (rec) {
      const rent = rentFor(values.home, {
        beds: values.beds || null,
        district: rec.district || null,
        propertyType: rec.landed ? undefined : 'Non-landed Properties',
      });
      if (rent) market = { rent };
    }
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app').replace(/\/$/, '');
  const { subject, text, html } = tool.render({
    values,
    market,
    link: `${siteUrl}${tool.path}#${String(body.hash).replace(/^#/, '')}`,
    agent: agent(),
    siteUrl,
  });

  const sent = await send({ to: email, subject, text, html });
  if (!sent || sent.error) {
    console.error('report send failed:', sent?.error || 'no transport');
    return NextResponse.json({ error: 'The email could not be sent. Nothing was saved.' }, { status: 502 });
  }
  /* ── THE PROVIDER'S ID IS THE ONLY HANDLE ON A DELIVERY ──────────────────
     Accepted is not delivered: Resend answers with an id and the message can
     still bounce, or land in spam, after the request is over. The first real
     send arrived nowhere and there was nothing to look up, because this line
     did not exist. The id and the tool only — never the address, which this
     route promises to store nowhere, and a log is storage. */
  console.log(`report sent · tool=${body.tool} · resend=${sent.id || 'no id'}`);
  return NextResponse.json({ ok: true });
}
