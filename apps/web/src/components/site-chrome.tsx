import Image from 'next/image';
import Link from 'next/link';
import { RingDivider, buttonClasses } from '@mp/ui';

// Static on purpose (no cookie read) so marketing and menu pages can be cached.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-900/10 bg-cream-100/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-3" aria-label="Maidstone Pizza home">
          <Image
            src="/brand/logo.png"
            alt=""
            width={44}
            height={44}
            priority
            className="rounded-full"
          />
          <span className="font-display text-xl font-black leading-none">Maidstone Pizza</span>
        </Link>
        <nav aria-label="Main">
          <Link href="/account" className={buttonClasses('outline')}>
            Account
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-ink-900 text-cream-100">
      <RingDivider className="text-green-500" />
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm">
        <p className="font-display text-lg font-black">Maidstone Pizza</p>
        {/* TODO(client): real address, phone, company number and opening hours before launch. */}
        <p className="mt-2 text-cream-200">Maidstone, Kent</p>
        <p className="mt-6 text-cream-300">
          Food allergies? Please contact us before ordering. Full allergen information is coming
          with the menu.
        </p>
      </div>
    </footer>
  );
}
