import { describe, expect, it } from 'vitest';
import type { Role } from '@mp/types';
import { createApp } from './app';
import { requireRole } from './auth';
import type { Deps } from './deps';

function makeApp(overrides: Partial<Deps> = {}) {
  const deps: Deps = {
    corsOrigins: ['https://shop.test'],
    // Tokens in tests look like "role:<role>"; anything else is invalid.
    verifyToken: async (token) => {
      const role = token.startsWith('role:') ? (token.slice(5) as Role) : null;
      return role ? { id: `user-${role}`, email: `${role}@example.test`, role } : null;
    },
    pingDatabase: async () => true,
    ...overrides,
  };
  const app = createApp(() => deps);
  // Stand-ins for routes that arrive in later phases, to prove the gates hold.
  app.get('/v1/kitchen/orders', (c) => c.json({ ok: true }));
  app.get('/v1/admin/menu', (c) => c.json({ ok: true }));
  return app;
}

const as = (role: string) => ({ headers: { Authorization: `Bearer role:${role}` } });

describe('health', () => {
  it('reports ok when the database answers', async () => {
    const res = await makeApp().request('/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('reports 503 when the database is down or throws', async () => {
    const down = await makeApp({ pingDatabase: async () => false }).request('/v1/health');
    expect(down.status).toBe(503);
    const throws = await makeApp({
      pingDatabase: async () => {
        throw new Error('boom');
      },
    }).request('/v1/health');
    expect(throws.status).toBe(503);
  });
});

describe('auth', () => {
  it('rejects anonymous and invalid tokens on /v1/me', async () => {
    const app = makeApp();
    expect((await app.request('/v1/me')).status).toBe(401);
    expect(
      (await app.request('/v1/me', { headers: { Authorization: 'Bearer garbage' } })).status,
    ).toBe(401);
  });

  it('returns the caller and role', async () => {
    const res = await makeApp().request('/v1/me', as('manager'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 'user-manager',
      email: 'manager@example.test',
      role: 'manager',
    });
  });

  it('gates kitchen routes to kitchen and above', async () => {
    const app = makeApp();
    expect((await app.request('/v1/kitchen/orders')).status).toBe(401);
    expect((await app.request('/v1/kitchen/orders', as('customer'))).status).toBe(403);
    expect((await app.request('/v1/kitchen/orders', as('kitchen'))).status).toBe(200);
    expect((await app.request('/v1/kitchen/orders', as('admin'))).status).toBe(200);
  });

  it('gates admin routes to manager and above', async () => {
    const app = makeApp();
    expect((await app.request('/v1/admin/menu', as('customer'))).status).toBe(403);
    expect((await app.request('/v1/admin/menu', as('kitchen'))).status).toBe(403);
    expect((await app.request('/v1/admin/menu', as('manager'))).status).toBe(200);
  });

  it('exports requireRole for per-route checks', () => {
    expect(typeof requireRole('admin')).toBe('function');
  });
});

describe('platform', () => {
  it('allows only configured CORS origins', async () => {
    const app = makeApp();
    const ok = await app.request('/v1/health', { headers: { Origin: 'https://shop.test' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://shop.test');
    const bad = await app.request('/v1/health', { headers: { Origin: 'https://evil.test' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sets secure headers', async () => {
    const res = await makeApp().request('/v1/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });

  it('serves an OpenAPI document covering the routes', async () => {
    const res = await makeApp().request('/openapi.json');
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/v1/health', '/v1/me']));
  });

  it('returns a JSON 404 without leaking internals', async () => {
    const res = await makeApp().request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found.' } });
  });

  it('fails requests, not startup, when configuration is missing', async () => {
    const app = createApp(() => {
      throw new Error('Invalid api environment variables');
    });
    const res = await app.request('/v1/health');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: 'internal', message: 'Something went wrong.' },
    });
  });
});
