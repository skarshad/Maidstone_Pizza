import type { Metadata } from 'next';
import { Abril_Fatface, Chonburi, DM_Serif_Display } from 'next/font/google';
import Image from 'next/image';
import {
  Badge,
  Button,
  Card,
  RingDivider,
  Sunburst,
  colors,
  contrastRatio,
  textPairs,
  typeScale,
} from '@mp/ui';

export const metadata: Metadata = { title: 'Design system', robots: { index: false } };

// Candidate display faces, loaded on this page only, for comparison with the logo wordmark.
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400' });
const abril = Abril_Fatface({ subsets: ['latin'], weight: '400' });
const chonburi = Chonburi({ subsets: ['latin'], weight: '400' });

const swatchGroups = Object.entries(colors).flatMap(([group, value]) =>
  typeof value === 'string' ? [] : [[group, value as Record<string, string>] as const],
);

export default function DesignPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-10">
      <header>
        <h1 className="text-4xl">Design system</h1>
        <p className="mt-2 max-w-2xl text-ink-700">
          Tokens live in <code>packages/ui</code>. Base colours are sampled from the logo file;
          every text pairing below is checked against WCAG AA in the test suite.
        </p>
      </header>

      <section aria-labelledby="colours">
        <h2 id="colours" className="text-2xl">
          Colour
        </h2>
        <div className="mt-4 space-y-4">
          {swatchGroups.map(([group, steps]) => (
            <div key={group}>
              <h3 className="font-sans text-sm font-semibold uppercase tracking-wide text-ink-500">
                {group}
              </h3>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {Object.entries(steps).map(([step, hex]) => (
                  <li key={step}>
                    <div
                      className="h-16 rounded-md ring-1 ring-ink-900/10"
                      style={{ backgroundColor: hex }}
                    />
                    <p className="mt-1 text-xs font-semibold">
                      {group}-{step}
                    </p>
                    <p className="text-xs text-ink-500">{hex}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="contrast">
        <h2 id="contrast" className="text-2xl">
          Contrast
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {textPairs.map((pair) => (
            <li
              key={pair.name}
              className="flex items-center justify-between rounded-md px-4 py-3 ring-1 ring-ink-900/10"
              style={{ backgroundColor: pair.bg, color: pair.fg }}
            >
              <span className="font-semibold">{pair.name}</span>
              <span className="tabular-nums">{contrastRatio(pair.fg, pair.bg).toFixed(1)}:1</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="type">
        <h2 id="type" className="text-2xl">
          Typography
        </h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-[auto_1fr]">
          <Image
            src="/brand/logo.png"
            alt="Maidstone Pizza logo, for comparison with the display typefaces"
            width={220}
            height={220}
            className="rounded-full"
          />
          <ul className="space-y-3">
            <li>
              <p className="text-xs font-semibold uppercase tracking-wide text-green-500">
                Chosen: Playfair Display 900
              </p>
              <p className="font-display text-5xl font-black">Maidstone Pizza</p>
            </li>
            <li>
              <p className="text-xs uppercase tracking-wide text-ink-500">DM Serif Display</p>
              <p className={`${dmSerif.className} text-5xl`}>Maidstone Pizza</p>
            </li>
            <li>
              <p className="text-xs uppercase tracking-wide text-ink-500">Abril Fatface</p>
              <p className={`${abril.className} text-5xl`}>Maidstone Pizza</p>
            </li>
            <li>
              <p className="text-xs uppercase tracking-wide text-ink-500">Chonburi</p>
              <p className={`${chonburi.className} text-5xl`}>Maidstone Pizza</p>
            </li>
          </ul>
        </div>
        <ul className="mt-8 space-y-2">
          {Object.entries(typeScale).map(([name, { size, lineHeight }]) => (
            <li key={name} className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 text-xs text-ink-500">
                {name} · {size}/{lineHeight}
              </span>
              <span style={{ fontSize: size, lineHeight: `${lineHeight}px` }}>
                Hand-stretched and stone baked
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="buttons">
        <h2 id="buttons" className="text-2xl">
          Buttons and badges
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button>Add to basket</Button>
          <Button variant="secondary">Checkout</Button>
          <Button variant="outline">View menu</Button>
          <Button variant="ghost">Remove</Button>
          <Button size="lg">View basket · £24.98</Button>
          <Button disabled>Sold out today</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="green">Vegetarian</Badge>
          <Badge tone="red">Spicy</Badge>
          <Badge>Contains milk</Badge>
        </div>
      </section>

      <section aria-labelledby="cards">
        <h2 id="cards" className="text-2xl">
          Cards
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {['Margherita', 'Pepperoni', 'Garden Veg'].map((name) => (
            <Card key={name} className="overflow-hidden">
              {/* Branded placeholder used until real food photography is supplied. */}
              <div className="relative flex aspect-[4/3] items-end justify-center overflow-hidden bg-cheese">
                <Sunburst className="w-4/5 text-red-500/80" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl">{name}</h3>
                  <p className="font-semibold text-red-500">from £9.99</p>
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  Sample card. Real menu arrives in Phase 2.
                </p>
                <Button className="mt-4 w-full">Choose</Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="motifs">
        <h2 id="motifs" className="text-2xl">
          Motifs
        </h2>
        <div className="mt-4 grid items-end gap-6 sm:grid-cols-2">
          <Sunburst className="w-full text-red-500" />
          <div className="space-y-4">
            <RingDivider className="text-green-500" />
            <RingDivider className="text-red-500" segments={5} />
          </div>
        </div>
      </section>

      <section aria-labelledby="kitchen" className="rounded-xl bg-kitchen-bg p-6 text-kitchen-text">
        <h2 id="kitchen" className="text-2xl">
          Kitchen theme
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(
            [
              ['New', 'text-kitchen-red', '#1042 · Delivery'],
              ['Preparing', 'text-kitchen-amber', '#1041 · Collection'],
              ['Ready', 'text-kitchen-green', '#1040 · Delivery'],
            ] as const
          ).map(([status, tone, label]) => (
            <div
              key={status}
              className="rounded-lg border border-kitchen-border bg-kitchen-surface p-4"
            >
              <p className={`text-sm font-bold uppercase tracking-wide ${tone}`}>{status}</p>
              <p className="mt-1 text-2xl font-bold">{label}</p>
              <p className="mt-2 text-kitchen-muted">2 × Pepperoni (large)</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
