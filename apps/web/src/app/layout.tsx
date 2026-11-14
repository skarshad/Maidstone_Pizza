import type { Metadata, Viewport } from 'next';
import { DM_Sans, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';
import { env } from '@/env';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { BasketProvider } from '@/lib/basket';
import './globals.css';

// Self-hosted at build time by next/font: no layout shift, no third-party requests.
const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['800', '900'],
  variable: '--font-display-face',
  display: 'swap',
});
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body-face', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'Maidstone Pizza | Fresh pizza delivery in Maidstone',
    template: '%s | Maidstone Pizza',
  },
  description:
    'Freshly made pizza, sides and desserts for delivery or collection in Maidstone, Kent. Order online from Maidstone Pizza.',
  applicationName: 'Maidstone Pizza',
  openGraph: { siteName: 'Maidstone Pizza', locale: 'en_GB', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#FBEFD5' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <BasketProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </BasketProvider>
      </body>
    </html>
  );
}
