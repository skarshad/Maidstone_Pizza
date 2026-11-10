import { describe, expect, it } from 'vitest';
import { parseEnv, publicEnvSchema, serverEnvSchema } from './env';

const server = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'anon',
  SUPABASE_SECRET_KEY: 'service-secret-value',
};

describe('env validation', () => {
  it('accepts a valid server env and splits CORS origins', () => {
    const env = parseEnv(
      serverEnvSchema,
      { ...server, CORS_ORIGINS: 'https://a.test, https://b.test' },
      'api',
    );
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('lists every missing variable by name', () => {
    expect(() => parseEnv(serverEnvSchema, { SUPABASE_URL: 'nope' }, 'api')).toThrowError(
      /SUPABASE_URL[\s\S]*SUPABASE_PUBLISHABLE_KEY[\s\S]*SUPABASE_SECRET_KEY/,
    );
  });

  it('treats empty strings as missing', () => {
    expect(() =>
      parseEnv(serverEnvSchema, { ...server, SUPABASE_SECRET_KEY: '' }, 'api'),
    ).toThrowError(/SUPABASE_SECRET_KEY/);
  });

  it('never includes values in the error', () => {
    try {
      parseEnv(serverEnvSchema, { ...server, SUPABASE_URL: 'not-a-url-secret' }, 'api');
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain('not-a-url-secret');
      expect(String(e)).not.toContain('service-secret-value');
    }
  });

  it('public schema only contains NEXT_PUBLIC_ names', () => {
    for (const key of Object.keys(publicEnvSchema.shape)) {
      expect(key.startsWith('NEXT_PUBLIC_')).toBe(true);
    }
  });
});
