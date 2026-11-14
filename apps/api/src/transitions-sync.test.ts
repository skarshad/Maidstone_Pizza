import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, ORDER_TRANSITIONS } from '@mp/types';

// The order state machine exists twice: here in TypeScript (used by the API and
// the apps) and in Postgres (the guard trigger that has the final say). This
// test fails if the two ever drift apart.

const migration = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20261115090000_orders.sql', import.meta.url)),
  'utf8',
);

describe('order state machine: TypeScript and SQL agree', () => {
  it('has the same statuses in the same order', () => {
    const block = /create type public\.order_status as enum \(([\s\S]*?)\);/.exec(migration)?.[1];
    expect(block).toBeDefined();
    const sqlStatuses = [...block!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(sqlStatuses).toEqual([...ORDER_STATUSES]);
  });

  it('allows exactly the same transitions', () => {
    const block =
      /insert into public\.order_transitions \(from_status, to_status\) values([\s\S]*?);/.exec(
        migration,
      )?.[1];
    expect(block).toBeDefined();
    const sqlPairs = [...block!.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)]
      .map((m) => `${m[1]} -> ${m[2]}`)
      .sort();
    const tsPairs = Object.entries(ORDER_TRANSITIONS)
      .flatMap(([from, targets]) => targets.map((to) => `${from} -> ${to}`))
      .sort();
    expect(sqlPairs.length).toBeGreaterThan(0);
    expect(sqlPairs).toEqual(tsPairs);
  });
});
