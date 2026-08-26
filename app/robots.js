const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.sg';
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
