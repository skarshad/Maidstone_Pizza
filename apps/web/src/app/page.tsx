import Image from 'next/image';
import Link from 'next/link';
import { Sunburst, buttonClasses } from '@mp/ui';

// Phase 1 landing page. Promotions, popular items, postcode check and opening
// hours arrive with the menu (Phase 2) and checkout (Phase 3).
export default function HomePage() {
  return (
    <section className="relative overflow-hidden">
      <Sunburst
        rays={17}
        className="pointer-events-none absolute -top-10 left-1/2 w-[140vmax] max-w-none -translate-x-1/2 rotate-180 text-red-500/[0.07]"
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-12 text-center sm:pt-20">
        <Image
          src="/brand/logo.png"
          alt="Maidstone Pizza logo"
          width={280}
          height={280}
          priority
          className="h-52 w-52 animate-pop rounded-full shadow-raised sm:h-72 sm:w-72"
        />
        <h1 className="mt-8 text-4xl leading-tight sm:text-6xl">
          Proper pizza, <span className="text-red-500">made fresh</span> in Maidstone
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-700">
          Hand-stretched dough, generous toppings, delivered hot or ready to collect. Online
          ordering opens soon.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login" className={buttonClasses('primary', 'lg')}>
            Create an account
          </Link>
          <Link href="/design" className={buttonClasses('outline', 'lg')}>
            Design system
          </Link>
        </div>
      </div>
    </section>
  );
}
