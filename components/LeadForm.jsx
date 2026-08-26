'use client';
import { useRef, useState } from 'react';
import { CONSENT_COPY } from '../lib/consent.js';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

const INTENT = ['Selling', 'Buying', 'Both', 'Just looking'];
const WHEN   = ['Within 3 months', '3–6 months', '6–12 months', 'No fixed date'];

/**
 * Lead capture. Name and mobile are the only required fields — everything else
 * is optional, because a lead you can call beats a complete row you never got.
 *
 * Compliance, do not weaken:
 *  · consent is EMAIL ONLY as of 24 Aug 2026 — no phone, no WhatsApp
 *  · the tick is optional; an unticked form still saves, with consent "No"
 *  · the wording comes from lib/consent.js, the same file the server logs from
 *  · submitting is NOT consent; an untickd form still saves, with consent "No"
 */
export default function LeadForm({ context = null }) {
  const [v, setV] = useState({
    name: '', mobile: '', email: '', unit: '',
    intent: '', timeline: '', consentEmail: false, website: '',
  });
  const [state, setState] = useState('idle');   // idle | sending | done | error
  const [err, setErr] = useState(null);

  const started = useRef(false);
  const set = k => e => {
    if (!started.current) { started.current = true; track(EVENTS.LEAD_START, { href: context?.href || '' }); }
    setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  };
  const ready = v.name.trim().length > 1 && v.mobile.replace(/\D/g, '').length >= 8;

  async function submit(e) {
    e.preventDefault();
    if (!ready || state === 'sending') return;
    setState('sending'); setErr(null);
    try {
      const r = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: v.name.trim(),
          mobile: v.mobile,
          email: v.email.trim(),
          website: v.website,                       // honeypot — must stay empty
          intent: v.intent,
          timeline: v.timeline,
          source: context ? `Website · ${context.label}` : 'Website',
          propertyType: context?.kind === 'HDB' ? 'HDB' : context?.kind === 'PRIVATE' ? 'Private' : '',
          addressOrProject: context?.label || '',
          district: context?.district || '',
          consentEmail: v.consentEmail,
          consentPhone: false,   // withdrawn 24 Aug 2026 — email only
          computed: { summary: buildSummary(context, v) },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save.');
      setState('done');
      // Only whether consent was given, never the name, number or email.
      track(EVENTS.LEAD_SUBMIT, { href: context?.href || '', consent: v.consentEmail });
    } catch (e2) { setErr(e2.message); setState('error'); }
  }

  if (state === 'done') return (
    <div className="gate">
      <h2>Got it — I&apos;ll come back to you.</h2>
      <p style={{fontSize:14,margin:'0 0 8px'}}>
        I&apos;ll work through {context ? context.label : 'your place'} properly and send you the numbers,
        with the comparables I used so you can check my working.
      </p>
      <p className="lab" style={{textTransform:'none',letterSpacing:0,fontSize:12}}>
        {v.consentEmail
          ? 'Thanks for the opt-in — you can withdraw it any time by replying to any message.'
          : 'You didn’t opt in to updates, so I’ll only reply about this one enquiry.'}
      </p>
    </div>
  );

  return (
    <form className="gate" onSubmit={submit} noValidate>
      <h2>Three things this can&apos;t know</h2>
      <ol>
        <li><b>Your actual floor, facing and renovation</b>Public data gives a storey band, never your unit.</li>
        <li><b>Whether you sell or buy first</b>Changes your ABSD, timeline and bridging cost — often by five figures.</li>
        <li><b>Your real CPF accrued interest</b>The figure here is an estimate. Yours is in your CPF statement right now.</li>
      </ol>
      <p style={{fontSize:14,margin:'0 0 14px'}}>
        Tell me those and I&apos;ll run your actual numbers — no charge, no obligation.
      </p>

      <div className="f2">
        <div>
          <label className="lab" htmlFor="lf-name">Name</label>
          <input id="lf-name" value={v.name} onChange={set('name')} autoComplete="name" required />
        </div>
        <div>
          <label className="lab" htmlFor="lf-mob">Mobile</label>
          <input id="lf-mob" value={v.mobile} onChange={set('mobile')} inputMode="tel"
                 autoComplete="tel" placeholder="9123 4567" required />
        </div>
      </div>

      <div className="fld">
        <label className="lab" htmlFor="lf-email">Email — optional</label>
        <input id="lf-email" type="email" value={v.email} onChange={set('email')} autoComplete="email" />
      </div>

      <div className="fld">
        <label className="lab" htmlFor="lf-unit">Your floor or stack</label>
        <input id="lf-unit" value={v.unit} onChange={set('unit')} placeholder="e.g. 11th floor, facing the park" />
        <p className="hint" style={{margin:'5px 0 0',fontSize:12}}>Optional — but it&apos;s the single biggest thing the public data can&apos;t see.</p>
      </div>

      <div className="fld">
        <span className="lab" style={{display:'block',marginBottom:5}}>What are you weighing up?</span>
        <div className="seg">
          {INTENT.map(x => (
            <button type="button" key={x} aria-pressed={v.intent===x}
              onClick={()=>setV({...v, intent: v.intent===x ? '' : x})}>{x}</button>
          ))}
        </div>
      </div>

      <div className="fld">
        <span className="lab" style={{display:'block',marginBottom:5}}>Rough timing</span>
        <div className="seg">
          {WHEN.map(x => (
            <button type="button" key={x} aria-pressed={v.timeline===x}
              onClick={()=>setV({...v, timeline: v.timeline===x ? '' : x})}>{x}</button>
          ))}
        </div>
      </div>

      {/* Honeypot. Real people never fill this; bots fill everything. */}
      <div aria-hidden="true" style={{position:'absolute',left:'-9999px',width:1,height:1,overflow:'hidden'}}>
        <label htmlFor="lf-web">Website</label>
        <input id="lf-web" tabIndex={-1} autoComplete="off" value={v.website} onChange={set('website')} />
      </div>

      <div style={{marginTop:18,paddingTop:14,borderTop:'1px solid var(--line)'}}>
        <span className="lab" style={{display:'block',marginBottom:8}}>Staying in touch — optional</span>
        <div className="cons">
          <input type="checkbox" id="lf-ce" checked={v.consentEmail} onChange={set('consentEmail')} />
          <label htmlFor="lf-ce">{CONSENT_COPY.email}</label>
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Leave it unticked and the form still sends — you get the reply to what you asked, and
          nothing after it. No phone calls and no WhatsApp come from this form.
        </p>
      </div>

      {state === 'error' && (
        <div className="warn" style={{marginTop:14}}>
          <p style={{margin:0}}>{err} You can also WhatsApp me directly — the number is at the foot of the page.</p>
        </div>
      )}

      <button className="cta" type="submit" disabled={!ready || state==='sending'}>
        {state==='sending' ? 'Sending…' : 'Run my actual numbers'}
      </button>
      <p className="lab" style={{marginTop:10,textTransform:'none',letterSpacing:0,fontSize:11,lineHeight:1.6}}>
        Ticking neither box is fine — the tools work either way, and I&apos;ll still reply to this enquiry.
        I don&apos;t sell or share your details.
      </p>
    </form>
  );
}

function buildSummary(c, v) {
  if (!c) return v.unit ? `Floor/stack: ${v.unit}` : '';
  const bits = [
    `${c.label}`,
    c.kind === 'HDB' ? c.town : `D${c.district} ${c.segment || ''}`.trim(),
    c.minPsf && c.maxPsf ? `observed $${c.minPsf}–$${c.maxPsf} psf` : null,
    c.medianPsf ? `median $${c.medianPsf} psf` : null,
    c.n ? `n=${c.n}` : null,
    v.unit ? `floor/stack: ${v.unit}` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}
