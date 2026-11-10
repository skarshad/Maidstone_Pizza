import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-card',
  secondary: 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700 shadow-card',
  outline: 'border-2 border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-cream-100',
  ghost: 'text-red-500 hover:bg-red-50',
};

const buttonSizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 text-base',
  lg: 'min-h-14 px-7 text-lg',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
    'transition-[background-color,color,transform] duration-150 ease-brand active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-50',
    buttonVariants[variant],
    buttonSizes[size],
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cx(buttonClasses(variant, size), className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-xl bg-white shadow-card ring-1 ring-ink-900/5', className)}
      {...props}
    />
  );
}

type BadgeTone = 'red' | 'green' | 'neutral';

const badgeTones: Record<BadgeTone, string> = {
  red: 'bg-red-50 text-red-700',
  green: 'bg-green-50 text-green-700',
  neutral: 'bg-cream-200 text-ink-900',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Sunburst motif echoing the rays in the logo. Decorative only.
 * Rays fan across the top half, like the logo's rising slice.
 */
export function Sunburst({
  className,
  rays = 13,
  spin = false,
}: {
  className?: string;
  rays?: number;
  spin?: boolean;
}) {
  const wedges = Array.from({ length: rays }, (_, i) => {
    const angle = -180 + (180 / (rays - 1)) * i;
    return <polygon key={i} points="26,-3.2 100,0 26,3.2" transform={`rotate(${angle})`} />;
  });
  return (
    <svg
      viewBox="-100 -100 200 104"
      aria-hidden="true"
      focusable="false"
      className={cx('fill-current', className)}
    >
      <g className={spin ? 'origin-center animate-rays' : undefined}>{wedges}</g>
      <path d="M -22 0 A 22 22 0 0 1 22 0 Z" />
    </svg>
  );
}

/** Segmented arc divider echoing the green ring tiles in the logo. Decorative only. */
export function RingDivider({
  className,
  segments = 9,
}: {
  className?: string;
  segments?: number;
}) {
  const gap = 6;
  const width = (600 - gap * (segments - 1)) / segments;
  return (
    <svg
      viewBox="0 0 600 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cx('h-3 w-full fill-current', className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <rect key={i} x={i * (width + gap)} y="0" width={width} height="14" rx="2" />
      ))}
    </svg>
  );
}
