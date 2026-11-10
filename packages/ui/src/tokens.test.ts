import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { colors, textPairs } from './tokens';

describe('contrast', () => {
  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });

  it.each(textPairs)('$name meets WCAG AA', ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min ?? 4.5);
  });
});

describe('theme.css mirrors tokens.ts', () => {
  const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8').toUpperCase();
  const flat: Array<[string, string]> = [];
  for (const [group, value] of Object.entries(colors)) {
    if (typeof value === 'string') flat.push([group, value]);
    else for (const [step, hex] of Object.entries(value)) flat.push([`${group}-${step}`, hex]);
  }

  it.each(flat)('--color-%s is %s', (name, hex) => {
    expect(css).toContain(`--COLOR-${name.toUpperCase()}: ${hex.toUpperCase()};`);
  });
});
