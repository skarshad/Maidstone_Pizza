import type { Metadata, Viewport } from 'next';
import { DM_Sans, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['800', '900'],
  variable: '--font-display-face',
  display: 'swap',
});
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body-face', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Maidstone Pizza Admin', template: '%s | Maidstone Pizza Admin' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#FFFFFF' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-white text-ink-900">{children}</body>
    </html>
  );
}
