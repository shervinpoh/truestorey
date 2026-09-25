/**
 * Where an article share sends the reader, one URL per route.
 *
 * Kept out of components/ShareArticle.jsx so a test can pin the URLs: Node
 * does not strip JSX, and a transform would cost more than the three-
 * dependency rule is worth (CLAUDE.md, the Motion.jsx note).
 *
 * The link is the article's own URL. No tracking parameters are added: the
 * page a share lands on is the page it names.
 */
export function shareTargets({ url, title, summary = '' }) {
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  return [
    { how: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { how: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { how: 'x', label: 'X', href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { how: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { how: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { how: 'email', label: 'Email', href: `mailto:?subject=${t}&body=${encodeURIComponent(`${summary ? `${summary}\n\n` : ''}${url}`)}` },
  ];
}
