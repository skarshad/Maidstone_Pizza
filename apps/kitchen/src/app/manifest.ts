import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Maidstone Pizza Kitchen',
    short_name: 'MP Kitchen',
    start_url: '/',
    display: 'fullscreen',
    background_color: '#0E0E0E',
    theme_color: '#0E0E0E',
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
