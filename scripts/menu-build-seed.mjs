// Stage 2 of the menu import: turn the faithful capture (data/menu.source.json)
// plus the owner decisions (data/menu.overrides.json) into the normalised seed
// (data/menu.seed.json) that pnpm menu:seed loads into the database.
//
// Pure and offline: no network. Fails loudly instead of guessing when the
// source has a price it cannot read.
//
//   pnpm menu:build
import { readFileSync, writeFileSync } from 'node:fs';

const source = JSON.parse(readFileSync('data/menu.source.json', 'utf8'));
const overrides = JSON.parse(readFileSync('data/menu.overrides.json', 'utf8'));

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function pence(value, what) {
  const match = /^(\d+)\.(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) throw new Error(`Cannot read a price for ${what}: "${value}"`);
  return Number(match[1]) * 100 + Number(match[2]);
}

const SIZE_KEYS = { 1: 'small', 2: 'medium', 3: 'large' };
const warnings = [];
const renamed = [];
const brandFlags = [];

// ---- shared pizza option groups, read from the pizza pages ------------------
const pizzas = source.categories.find((c) => c.slug === 'pizzas').items;

function sameAcrossPizzas(read, what) {
  const values = new Set(pizzas.map((p) => JSON.stringify(read(p))));
  if (values.size !== 1) throw new Error(`${what} differs between pizzas; cannot share one group`);
  return JSON.parse([...values][0]);
}

const bases = sameAcrossPizzas(
  (p) => p.page.selects.pizza_base.map((o) => o.label.replace(/^Base:\s*/, '')),
  'Base list',
);
const crusts = sameAcrossPizzas(
  (p) =>
    p.page.selects.stuffed_base.map((o) => ({
      name: o.label.replace(/^Crust:\s*/, ''),
      prices: Object.fromEntries(
        Object.entries(SIZE_KEYS).map(([n, key]) => [
          key,
          pence(p.page.fields[`stuffed_${o.value}_${n}`], `stuffed crust ${o.label} (${key})`),
        ]),
      ),
    })),
  'Stuffed crust list or prices',
);
const toppingPrices = sameAcrossPizzas(
  (p) =>
    Object.fromEntries(
      Object.entries(SIZE_KEYS).map(([n, key]) => [
        key,
        pence(p.page.fields[`topping_price_${n}`], `extra topping (${key})`),
      ]),
    ),
  'Extra topping prices',
);

const zero = { small: 0, medium: 0, large: 0 };
const baseOptions = [];
for (const base of bases) {
  if (/^stuffed$/i.test(base)) {
    for (const crust of crusts) {
      baseOptions.push({
        slug: slugify(`stuffed-${crust.name}`),
        name: `Stuffed crust: ${crust.name}`,
        prices: crust.prices,
      });
    }
  } else {
    baseOptions.push({ slug: slugify(base), name: base, prices: zero });
  }
}

const optionGroups = [
  {
    slug: 'pizza-base',
    name: 'Base',
    min_select: 1,
    max_select: 1,
    options: baseOptions,
  },
  {
    slug: 'pizza-toppings',
    name: 'Extra toppings',
    min_select: 0,
    max_select: null,
    derived: true,
    options: overrides.toppings.names.map((name) => ({
      slug: slugify(name),
      name,
      prices: toppingPrices,
    })),
  },
];

// ---- items ------------------------------------------------------------------
function variantsFor(item, categorySlug) {
  const sizes = item.page.selects.pizza_size;
  if (sizes) {
    return sizes.map((option) => {
      const key = SIZE_KEYS[option.value];
      const label = /^Size:\s*(.*?)\s*-\s*£/.exec(option.label)?.[1];
      if (!key || !label) throw new Error(`Unreadable size on ${item.name}: ${option.label}`);
      const price = pence(item.page.fields[`price_${option.value}`], `${item.name} ${key}`);
      const shown = pence(/£(\d+\.\d{2})/.exec(option.label)?.[1], `${item.name} ${key} label`);
      if (price !== shown) throw new Error(`${item.name} ${key}: page shows two different prices`);
      return { slug: key, name: label, price_pence: price };
    });
  }
  const price = pence(item.page.fields.price_0, `${item.name} (${categorySlug})`);
  if (price !== item.from_price_pence) {
    throw new Error(`${item.name}: listing and item page prices differ`);
  }
  return [{ slug: 'standard', name: 'Standard', price_pence: price }];
}

const categories = [];
const items = [];
const deals = [];
const seenSlugs = new Set();

for (const category of source.categories) {
  const sellable = category.items.filter((i) => !i.is_deal);
  for (const deal of category.items.filter((i) => i.is_deal)) {
    deals.push({
      source_id: deal.source_id,
      source_category: category.name,
      name: deal.name,
      description: deal.listing_description,
      from_price_pence: deal.from_price_pence,
    });
  }
  if (sellable.length === 0) continue; // e.g. Special Offers: handled as promotions in Phase 5

  categories.push({ slug: category.slug, name: category.name, sort_order: categories.length + 1 });

  sellable.forEach((item, index) => {
    if (overrides.exclude.includes(item.name)) return;
    const rename = overrides.rename[item.name];
    const name = (rename?.name ?? item.name).trim();
    if (rename) renamed.push({ from: item.name, to: name, reason: rename.reason });

    const brand = overrides.third_party_brands.find((b) =>
      `${item.name} ${item.listing_description}`.toLowerCase().includes(b.toLowerCase()),
    );
    if (brand) brandFlags.push({ name, brand });

    const slug = slugify(name);
    if (seenSlugs.has(slug)) throw new Error(`Duplicate item slug: ${slug}`);
    seenSlugs.add(slug);

    const description = (
      overrides.description[item.name] ??
      item.page.description ??
      item.listing_description
    )
      .replace(/\s*\n\s*/g, ' ')
      .trim();
    if (/go\s?go/i.test(`${name} ${description}`)) {
      warnings.push(`"${name}" still mentions the source brand.`);
    }

    const isPizza = Boolean(item.page.selects.pizza_size);
    const isCreateYourOwn = item.name === overrides.create_your_own.source_name;
    const allowed = isPizza ? Number(item.page.fields.toppings_allowed) : 0;
    const freeToppings = isCreateYourOwn ? overrides.create_your_own.free_toppings : 0;

    items.push({
      slug,
      name,
      source_id: item.source_id,
      category: category.slug,
      sort_order: index + 1,
      description,
      tags: item.labels.map((label) => {
        const tag = overrides.tag_map[label];
        if (!tag) throw new Error(`Unmapped label "${label}" on ${item.name}`);
        return tag;
      }),
      variants: variantsFor(item, category.slug),
      option_groups: isPizza
        ? [
            { group: 'pizza-base', max_select: null, free_select: 0 },
            {
              group: 'pizza-toppings',
              // CYO: the source's own limit. Other pizzas: extras beyond the recipe.
              max_select: isCreateYourOwn ? allowed : overrides.extra_toppings_beyond_recipe,
              free_select: freeToppings,
            },
          ]
        : [],
      // The source publishes no allergen data. Never guess: these stay empty and
      // unconfirmed until the owner supplies them.
      allergens: [],
      allergens_confirmed: false,
      image: null,
    });
  });
}

const seed = {
  note: 'Generated by pnpm menu:build from menu.source.json and menu.overrides.json. Do not edit by hand.',
  currency: 'GBP',
  source_captured_at: source.captured_at,
  categories,
  option_groups: optionGroups,
  items,
  deals,
  review: { renamed, third_party_brands: brandFlags, warnings },
};

writeFileSync('data/menu.seed.json', JSON.stringify(seed, null, 2) + '\n');

console.log(
  `${categories.length} categories, ${items.length} items, ` +
    `${items.reduce((n, i) => n + i.variants.length, 0)} variants, ` +
    `${optionGroups.reduce((n, g) => n + g.options.length, 0)} options, ${deals.length} deals (reference only).`,
);
for (const r of renamed) console.log(`renamed: ${r.from} -> ${r.to}`);
for (const w of warnings) console.warn(`WARNING: ${w}`);
