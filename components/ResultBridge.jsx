import Link from 'next/link';

/**
 * The human handoff after a finished result.
 *
 * This is deliberately not a lead form. The calculator has already done its
 * job and nothing is held back; this is the point where a reader may decide
 * that the assumptions need a person. WhatsApp is initiated by the reader,
 * carries no figures automatically, and sends nothing until they press send
 * there. That keeps the handoff useful even when the CRM or email sender is
 * unavailable, without turning a result into an acquisition wall.
 */
export default function ResultBridge({
  tool,
  nextHref,
  nextLabel,
  body = 'Tell me the actual floor, facing and what you are weighing up. I’ll tell you which assumption I would verify first.',
}) {
  const raw = String(process.env.NEXT_PUBLIC_AGENT_PHONE || '').replace(/\D/g, '');
  const phone = raw.length === 8 ? `65${raw}` : raw;
  const message = encodeURIComponent(`Hi Shervin, I used Truestorey’s ${tool} and want to check the assumptions.`);
  const whatsapp = phone ? `https://wa.me/${phone}?text=${message}` : null;

  return (
    <aside className="resultbridge" aria-label="Continue with Shervin">
      <div className="resultbridge-mark" aria-hidden="true">
        <span>SHERVIN&rsquo;S</span><span>CHECK</span>
      </div>
      <div className="resultbridge-copy">
        <span className="lab">Where the public record stops</span>
        <h2>The numbers stop here. The actual home does not.</h2>
        <p>{body}</p>
        <div className="resultbridge-actions">
          {whatsapp && (
            <a className="cta" href={whatsapp} target="_blank" rel="noopener noreferrer">
              Ask Shervin what to verify
            </a>
          )}
          {nextHref && nextLabel && <Link className="resultbridge-next" href={nextHref}>{nextLabel} →</Link>}
        </div>
        {whatsapp && (
          <p className="resultbridge-privacy">
            Opens WhatsApp with a short draft. No figures are included and nothing is sent until you send it.
          </p>
        )}
      </div>
    </aside>
  );
}
