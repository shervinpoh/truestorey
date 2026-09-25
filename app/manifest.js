/**
 * Add to Home Screen.
 *
 * Shervin, 26 Sep: make it somewhere people come back to. On a phone the
 * shortest way back is an icon, and a site with a manifest can be saved as
 * one — opening full-screen, straight to the tools people use most. There is
 * no service worker and no offline copy: every figure here is only worth
 * showing current, so an installed icon opens the live site.
 */
export default function manifest() {
  return {
    name: 'Truestorey — Singapore property, in filed numbers',
    short_name: 'Truestorey',
    description: 'Every filed HDB and private sale in Singapore, by block and by project, and the free tools that read them.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F5F2',
    theme_color: '#164F52',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-icon/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Check a home', url: '/blindspot', description: 'Blindspot: six checks on an asking price' },
      { name: 'Price map', url: '/map' },
      { name: 'All tools', url: '/tools' },
    ],
  };
}
