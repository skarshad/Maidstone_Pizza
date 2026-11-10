import { describe, expect, it } from 'vitest';
import { safeNextPath } from './paths';
import { userFromClaims } from './server';

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/account')).toBe('/account');
    expect(safeNextPath('/orders/12?tab=1')).toBe('/orders/12?tab=1');
  });

  it('rejects anything that could leave the site', () => {
    for (const bad of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ]) {
      expect(safeNextPath(bad, '/home')).toBe('/home');
    }
  });
});

describe('userFromClaims', () => {
  it('reads id, email and role', () => {
    expect(userFromClaims({ sub: 'u1', email: 'a@b.test', user_role: 'kitchen' })).toEqual({
      id: 'u1',
      email: 'a@b.test',
      role: 'kitchen',
    });
  });

  it('defaults unknown or missing roles to customer', () => {
    expect(userFromClaims({ sub: 'u1', user_role: 'root' })?.role).toBe('customer');
    expect(userFromClaims({ sub: 'u1' })?.role).toBe('customer');
  });

  it('returns null without a subject', () => {
    expect(userFromClaims({})).toBeNull();
    expect(userFromClaims(null)).toBeNull();
  });
});
