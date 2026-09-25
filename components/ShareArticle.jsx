'use client';
import { useEffect, useState } from 'react';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';
import { WhatsAppMark } from './FollowWhatsApp.jsx';
import { shareTargets } from '../lib/share-targets.js';

/**
 * Share an article: the phone's own share sheet where there is one, and the
 * places a Singapore property link actually travels where there is not.
 *
 * Shervin, 26 Sep: a share icon on every article, because shares are traffic.
 * WhatsApp first — it is where a link moves in this market, and where the
 * share card (app/og) was rebuilt to preview. Then Telegram, X, Facebook,
 * LinkedIn, email and a plain copy.
 *
 * ── WHAT A SHARE SENDS ─────────────────────────────────────────────────────
 * The article's own URL and its title. Nothing about the reader, and no
 * tracking parameters bolted onto the link: the page it lands on is the page
 * it names. What is counted is that a share happened and by which route —
 * `share` { tool: 'article', how } — which is the event the privacy page
 * already describes.
 *
 * Brand marks are monochrome and take the button's colour, for the same
 * reason the WhatsApp follow button is not WhatsApp green: colour on this site
 * means a price that moved.
 */

const PATHS = {
  telegram: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  facebook: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
};

const Mark = ({ d }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d={d} /></svg>
);
const Stroke = ({ children }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const ShareIcon = () => <Stroke><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></Stroke>;
const MailIcon = () => <Stroke><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Stroke>;
const LinkIcon = () => <Stroke><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></Stroke>;

const ICON = {
  whatsapp: <WhatsAppMark size={17} />, telegram: <Mark d={PATHS.telegram} />, x: <Mark d={PATHS.x} />,
  facebook: <Mark d={PATHS.facebook} />, linkedin: <Mark d={PATHS.linkedin} />, email: <MailIcon />,
};

/**
 * @param variant 'compact' — a row of icons under the byline;
 *                'full'    — the close of the piece, with a line of invitation.
 */
export default function ShareArticle({ url, title, summary = '', variant = 'compact' }) {
  const [native, setNative] = useState(false);
  const [copied, setCopied] = useState(false);
  /* navigator.share exists on phones and on Safari; asking before render
     would differ between server and client, so it is asked after. */
  useEffect(() => { setNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);

  const sent = how => track(EVENTS.SHARE, { tool: 'article', how });
  const shareNative = async () => {
    try { await navigator.share({ title, text: summary || title, url }); sent('native'); }
    catch { /* dismissed; nothing was shared */ }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); sent('copy'); setTimeout(() => setCopied(false), 2200); }
    catch { window.prompt('Copy this link', url); }
  };

  return (
    <div className={`sharearticle ${variant}`}>
      {variant === 'full' && (
        <p className="sharearticle-say">
          <b>Know someone weighing this up?</b> Send it to them — it is free to read, with nothing to sign up for.
        </p>
      )}
      <div className="sharearticle-row" role="group" aria-label="Share this article">
        {native && (
          <button type="button" className="sharearticle-main" onClick={shareNative}>
            <ShareIcon /> Share
          </button>
        )}
        {shareTargets({ url, title, summary }).map(s => (
          <a key={s.how} className="sharearticle-btn" href={s.href} target={s.how === 'email' ? undefined : '_blank'}
            rel="noopener noreferrer" onClick={() => sent(s.how)} aria-label={`Share on ${s.label}`} title={s.label}>
            {ICON[s.how]}{variant === 'full' && <span>{s.label}</span>}
          </a>
        ))}
        <button type="button" className="sharearticle-btn" onClick={copy} aria-label="Copy link" title="Copy link">
          <LinkIcon />{(variant === 'full' || copied) && <span>{copied ? 'Copied' : 'Copy link'}</span>}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>
    </div>
  );
}
