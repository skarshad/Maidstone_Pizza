/**
 * Maidstone Pizza design tokens.
 *
 * Base brand colours were sampled from assets/brand/maidstone-pizza-logo.png
 * (run `node scripts/sample-logo-colours.mjs`), not picked by eye. Tints and
 * shades are derived from those. theme.css mirrors these values for Tailwind;
 * tokens.test.ts fails if the two drift apart or a text pairing misses WCAG AA.
 */
export const colors = {
  cream: {
    50: '#FEFAF0',
    100: '#FBEFD5', // logo background
    200: '#F6E3BB',
    300: '#EBD19C',
  },
  cheese: '#FDE9BD', // pizza slice fill in the logo
  red: {
    50: '#FBEAE7',
    100: '#F4C9C3',
    500: '#BF2F21', // logo red: primary / CTA
    600: '#A3271B',
    700: '#84200F',
  },
  green: {
    50: '#E6F0E9',
    100: '#C5DCCB',
    500: '#28633B', // logo green: secondary / success
    600: '#1F4F2F',
    700: '#173B23',
  },
  ink: {
    900: '#151515', // logo lettering
    700: '#3D3A35',
    500: '#625C52',
    300: '#A39C8F',
  },
  white: '#FFFFFF',
  amber: { 500: '#B45309', 400: '#F59E0B' },
  /** Kitchen display: dark, high contrast. */
  kitchen: {
    bg: '#0E0E0E',
    surface: '#1C1C1C',
    border: '#3A3A3A',
    text: '#FFFFFF',
    muted: '#C9C9C9',
    red: '#FF6B5B',
    green: '#5FD08A',
    amber: '#FFC14D',
  },
} as const;

/** Text/background pairs used in the UI. Each must meet WCAG AA (4.5:1). */
export const textPairs: ReadonlyArray<{ name: string; fg: string; bg: string; min?: number }> = [
  { name: 'ink on cream', fg: colors.ink[900], bg: colors.cream[100] },
  { name: 'ink on cream-50', fg: colors.ink[900], bg: colors.cream[50] },
  { name: 'body ink-700 on cream', fg: colors.ink[700], bg: colors.cream[100] },
  { name: 'muted ink-500 on cream', fg: colors.ink[500], bg: colors.cream[100] },
  { name: 'muted ink-500 on white', fg: colors.ink[500], bg: colors.white },
  { name: 'white on red (CTA)', fg: colors.white, bg: colors.red[500] },
  { name: 'white on red hover', fg: colors.white, bg: colors.red[600] },
  { name: 'red text on cream', fg: colors.red[500], bg: colors.cream[100] },
  { name: 'red text on white', fg: colors.red[500], bg: colors.white },
  { name: 'red-700 on red-50 (badge)', fg: colors.red[700], bg: colors.red[50] },
  { name: 'white on green', fg: colors.white, bg: colors.green[500] },
  { name: 'green text on cream', fg: colors.green[500], bg: colors.cream[100] },
  { name: 'green-700 on green-50 (badge)', fg: colors.green[700], bg: colors.green[50] },
  { name: 'amber text on cream', fg: colors.amber[500], bg: colors.cream[50] },
  { name: 'kitchen text', fg: colors.kitchen.text, bg: colors.kitchen.bg, min: 7 },
  { name: 'kitchen muted', fg: colors.kitchen.muted, bg: colors.kitchen.surface, min: 7 },
  { name: 'kitchen red on surface', fg: colors.kitchen.red, bg: colors.kitchen.surface },
  { name: 'kitchen green on surface', fg: colors.kitchen.green, bg: colors.kitchen.surface },
  { name: 'kitchen amber on surface', fg: colors.kitchen.amber, bg: colors.kitchen.surface },
];

export const fonts = {
  display: 'Playfair Display',
  body: 'DM Sans',
} as const;

/** Shared type scale (px). Web uses rem equivalents in theme.css. */
export const typeScale = {
  xs: { size: 12, lineHeight: 16 },
  sm: { size: 14, lineHeight: 20 },
  base: { size: 16, lineHeight: 24 },
  lg: { size: 18, lineHeight: 28 },
  xl: { size: 22, lineHeight: 30 },
  '2xl': { size: 28, lineHeight: 34 },
  '3xl': { size: 36, lineHeight: 42 },
  '4xl': { size: 48, lineHeight: 52 },
  '5xl': { size: 64, lineHeight: 66 },
} as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const shadows = {
  card: '0 1px 2px rgba(21,21,21,0.06), 0 6px 20px rgba(21,21,21,0.08)',
  raised: '0 2px 4px rgba(21,21,21,0.08), 0 14px 34px rgba(21,21,21,0.14)',
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 360,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;
