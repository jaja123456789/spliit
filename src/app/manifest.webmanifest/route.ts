
export function GET() {
	return Response.json({
    name: 'Spliit',
    short_name: 'Spliit',
    description:
      'A minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
    start_url: '/spliit/groups',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#047857',
    icons: [
      {
        src: '/spliit/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/spliit/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/spliit/logo-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  });
}