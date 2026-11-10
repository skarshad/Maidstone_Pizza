import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Maidstone Pizza',
    short_name: 'Maidstone Pizza',
    start_url: '/',
    display: 'standalone',
    background_color: '#FBEFD5',
    theme_color: '#FBEFD5',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/brand/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
