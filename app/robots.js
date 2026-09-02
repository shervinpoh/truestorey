/* The fallback must be a domain that RESOLVES. These three files defaulted to
 * truestorey.sg while scripts/send-digest.mjs defaulted to the Vercel URL —
 * harmless while the variable is set, and actively damaging the moment it is
 * not, because robots.txt and every canonical would point search engines at a
 * domain that does not answer. The Vercel URL is where the site is today; when
 * a real domain is live, set NEXT_PUBLIC_SITE_URL and change all four. */
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app';
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
