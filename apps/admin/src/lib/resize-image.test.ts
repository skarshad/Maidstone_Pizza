import { describe, expect, it } from 'vitest';
import { fitWithin, formatBytes } from './resize-image';

describe('fitWithin', () => {
  it('scales a landscape phone photo down to the limit, keeping its shape', () => {
    expect(fitWithin(4032, 3024, 1200)).toEqual({ width: 1200, height: 900 });
  });

  it('scales a portrait photo by its height', () => {
    expect(fitWithin(3024, 4032, 1200)).toEqual({ width: 900, height: 1200 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1200, 1200, 1200)).toEqual({ width: 1200, height: 1200 });
  });

  it('never rounds a side down to zero', () => {
    expect(fitWithin(10000, 2, 1200)).toEqual({ width: 1200, height: 1 });
  });
});

describe('formatBytes', () => {
  it('shows KB for small files and MB for large ones', () => {
    expect(formatBytes(180 * 1024)).toBe('180 KB');
    expect(formatBytes(1668391)).toBe('1.6 MB');
    expect(formatBytes(10)).toBe('1 KB');
  });
});
