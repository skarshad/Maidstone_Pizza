// Loads data/menu.seed.json into the Supabase project named in apps/api/.env.local.
//
// Safe to re-run. By default it only ADDS what is missing and never touches
// rows that already exist, so prices or names edited in the admin portal are
// kept. Pass --overwrite to reset names, descriptions and prices to the seed.
// It never changes published / sold-out state or allergen data.
//
//   pnpm menu:seed               add anything missing
//   pnpm menu:seed --dry-run     show what would happen
//   pnpm menu:seed --overwrite   also reset existing rows to the seed values
//
// Uses the secret key (server only), which bypasses RLS.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseEnv, serverEnvSchema } from '@mp/validation';

interface Seed {
  categories: Array<{ slug: string; name: string; sort_order: number }>;
  option_groups: Array<{
    slug: string;
    name: string;
    min_select: number;
    max_select: number | null;
    options: Array<{ slug: string; name: string; prices: Record<string, number> }>;
  }>;
  items: Array<{
    slug: string;
    name: string;
    source_id: number;
    category: string;
    sort_order: number;
    description: string;
    tags: string[];
    variants: Array<{ slug: string; name: string; price_pence: number }>;
    option_groups: Array<{ group: string; max_select: number | null; free_select: number }>;
  }>;
}

const dryRun = process.argv.includes('--dry-run');
const overwrite = process.argv.includes('--overwrite');

const seed = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/menu.seed.json', import.meta.url)), 'utf8'),
) as Seed;

for (const item of seed.items) {
  for (const variant of item.variants) {
    if (!Number.isInteger(variant.price_pence) || variant.price_pence < 0) {
      throw new Error(`${item.name} ${variant.slug}: price must be integer pence`);
    }
  }
}

const env = parseEnv(serverEnvSchema, process.env, 'api');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Target: ${env.SUPABASE_URL}`);
console.log(
  `Seed: ${seed.categories.length} categories, ${seed.items.length} items, ` +
    `${seed.option_groups.reduce((n, g) => n + g.options.length, 0)} options`,
);
console.log(
  dryRun ? 'Mode: dry run (no changes)' : overwrite ? 'Mode: overwrite' : 'Mode: add missing only',
);

type Row = Record<string, unknown>;

async function upsert(table: string, rows: Row[], onConflict: string): Promise<number> {
  if (rows.length === 0) return 0;
  if (dryRun) return rows.length;
  const { data, error } = await db
    .from(table)
    .upsert(rows, { onConflict, ignoreDuplicates: !overwrite })
    .select('*');
  if (error) throw new Error(`${table}: ${error.message}`);
  return data?.length ?? 0;
}

async function idsBySlug(table: string): Promise<Map<string, string>> {
  const { data, error } = await db.from(table).select('id, slug');
  if (error) throw new Error(`${table}: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.slug as string, r.id as string]));
}

function need(map: Map<string, string>, slug: string, what: string): string {
  const id = map.get(slug);
  if (!id) {
    if (dryRun) return `(new ${what} ${slug})`;
    throw new Error(`Missing ${what}: ${slug}`);
  }
  return id;
}

const report: Array<[string, number]> = [];

report.push([
  'categories',
  await upsert(
    'categories',
    seed.categories.map((c) => ({ slug: c.slug, name: c.name, sort_order: c.sort_order })),
    'slug',
  ),
]);
const categoryIds = await idsBySlug('categories');

report.push([
  'option_groups',
  await upsert(
    'option_groups',
    seed.option_groups.map((g, i) => ({
      slug: g.slug,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      sort_order: i + 1,
    })),
    'slug',
  ),
]);
const groupIds = await idsBySlug('option_groups');

report.push([
  'options',
  await upsert(
    'options',
    seed.option_groups.flatMap((g) =>
      g.options.map((o, i) => ({
        group_id: need(groupIds, g.slug, 'option group'),
        slug: o.slug,
        name: o.name,
        sort_order: i + 1,
      })),
    ),
    'group_id,slug',
  ),
]);

const { data: optionRows, error: optionError } = await db
  .from('options')
  .select('id, slug, group_id');
if (optionError) throw new Error(`options: ${optionError.message}`);
const optionId = (groupSlug: string, slug: string) => {
  const groupId = groupIds.get(groupSlug);
  const row = (optionRows ?? []).find((o) => o.group_id === groupId && o.slug === slug);
  if (!row && !dryRun) throw new Error(`Missing option: ${groupSlug}/${slug}`);
  return (row?.id as string | undefined) ?? `(new option ${slug})`;
};

report.push([
  'option_prices',
  await upsert(
    'option_prices',
    seed.option_groups.flatMap((g) =>
      g.options.flatMap((o) =>
        Object.entries(o.prices).map(([variant_slug, price_pence]) => ({
          option_id: optionId(g.slug, o.slug),
          variant_slug,
          price_pence,
        })),
      ),
    ),
    'option_id,variant_slug',
  ),
]);

report.push([
  'menu_items',
  await upsert(
    'menu_items',
    seed.items.map((item) => ({
      category_id: need(categoryIds, item.category, 'category'),
      slug: item.slug,
      name: item.name,
      description: item.description,
      sort_order: item.sort_order,
      source_ref: String(item.source_id),
    })),
    'slug',
  ),
]);
const itemIds = await idsBySlug('menu_items');

report.push([
  'item_variants',
  await upsert(
    'item_variants',
    seed.items.flatMap((item) =>
      item.variants.map((v, i) => ({
        item_id: need(itemIds, item.slug, 'item'),
        slug: v.slug,
        name: v.name,
        price_pence: v.price_pence,
        sort_order: i + 1,
      })),
    ),
    'item_id,slug',
  ),
]);

report.push([
  'item_option_groups',
  await upsert(
    'item_option_groups',
    seed.items.flatMap((item) =>
      item.option_groups.map((g, i) => ({
        item_id: need(itemIds, item.slug, 'item'),
        group_id: need(groupIds, g.group, 'option group'),
        sort_order: i + 1,
        max_select: g.max_select,
        free_select: g.free_select,
      })),
    ),
    'item_id,group_id',
  ),
]);

report.push([
  'item_dietary_tags',
  await upsert(
    'item_dietary_tags',
    seed.items.flatMap((item) =>
      item.tags.map((tag) => ({ item_id: need(itemIds, item.slug, 'item'), tag_code: tag })),
    ),
    'item_id,tag_code',
  ),
]);

for (const [table, count] of report) {
  console.log(`  ${table.padEnd(20)} ${count} ${dryRun ? 'would be sent' : 'written'}`);
}
console.log(
  dryRun
    ? 'Dry run complete.'
    : 'Done. Allergens are not seeded: the source publishes none. Enter them in the admin portal.',
);
