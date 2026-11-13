// Stage 1 of the menu import: capture the source menu faithfully.
//
// Reads the category listings and every item page on the source site and
// writes data/menu.source.json, a plain record of what the site shows
// (names, descriptions, sizes, prices, bases, crust and topping prices).
// Nothing is renamed or interpreted here; that happens in menu-build-seed.mjs.
//
// Pages are cached in .cache/menu-import so re-runs do not hit the site again.
// Pass --refresh to fetch everything again.
//
//   pnpm menu:import
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = 'https://www.pizzagogo.co.uk';
const CATEGORIES = [
  ['pizzas', 'Pizzas'],
  ['sides-starters', 'Sides & Starters'],
  ['pastas', 'Pastas'],
  ['special-offers', 'Special Offers'],
  ['desserts', 'Desserts'],
  ['drinks', 'Drinks'],
  ['dips', 'Dips'],
];
const CACHE_DIR = '.cache/menu-import';
const OUT = 'data/menu.source.json';
const refresh = process.argv.includes('--refresh');
const DELAY_MS = 400;

mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPage(path) {
  const file = join(CACHE_DIR, path.replace(/[^a-z0-9]+/gi, '_') + '.html');
  if (!refresh && existsSync(file)) return readFileSync(file, 'utf8');
  const response = await fetch(ORIGIN + path, {
    headers: { 'user-agent': 'Mozilla/5.0 (menu-import)' },
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const html = await response.text();
  writeFileSync(file, html);
  await sleep(DELAY_MS);
  return html;
}

const ENTITIES = {
  '&amp;': '&',
  '&pound;': '£',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};
function text(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}
const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '');

/** "£14.99" or "14.99" to integer pence; null when absent or malformed. */
function toPence(value) {
  const match = /(\d+)\.(\d{2})\b/.exec(String(value ?? ''));
  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
}

function parseListing(html) {
  const cards = stripScripts(html).split(/<div class="menu_item [^"]*product_item" id="product_/);
  cards.shift();
  return cards.map((card) => {
    const pick = (re) => re.exec(card)?.[1] ?? null;
    const href = pick(/class="menu_link(?:_special)?" href="([^"]+)"/);
    return {
      source_id: Number(/^(\d+)/.exec(card)[1]),
      is_deal: /class="menu_link_special"/.test(card),
      path: href ? new URL(href).pathname : null,
      name: text(pick(/<p class="title"><a[^>]*>([\s\S]*?)<\/a>/) ?? ''),
      listing_description: text(pick(/<p class="desc"><a[^>]*>([\s\S]*?)<\/a>/) ?? ''),
      from_price_pence: toPence(text(pick(/class="product_min_price">([\s\S]*?)<\/div>/) ?? '')),
      image_url: pick(/class="menu_inner" style="background-image: url\('([^']+)'\)/),
      labels: [...card.matchAll(/class="pizza_flag[^"]*"><a href="#" title="([^"]+)"/g)].map(
        (m) => m[1],
      ),
      serves: text(pick(/class="menu_info_left">([\s\S]*?)<\/div>/) ?? '') || null,
      kcal: text(pick(/class="menu_info_right">([\s\S]*?)<\/div>/) ?? '') || null,
    };
  });
}

function parseItem(html) {
  const body = stripScripts(html);
  const start = body.indexOf('<h1');
  const main = start >= 0 ? body.slice(start) : body;
  const description = /<h1[^>]*>[\s\S]*?<\/h1>\s*<div class="">([\s\S]*?)<\/div>/.exec(main);

  const selects = {};
  for (const m of main.matchAll(/<select name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    if (selects[m[1]]) continue; // some pages repeat the block for mobile
    selects[m[1]] = [...m[2].matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map(
      (o) => ({ value: o[1], label: text(o[2]) }),
    );
  }

  const fields = {};
  for (const m of main.matchAll(/<input type="text" name="([^"]+)"[^>]*value="([^"]*)"/g)) {
    if (!(m[1] in fields)) fields[m[1]] = m[2];
  }

  return {
    name: text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(main)?.[1] ?? ''),
    description: description ? text(description[1]) : '',
    selects,
    fields,
    nutrition: {
      serves: text(/id="nutrition_serves">([\s\S]*?)<\/span>/.exec(main)?.[1] ?? '') || null,
      kcal: text(/id="nutrition_kcal">([\s\S]*?)<\/span>/.exec(main)?.[1] ?? '') || null,
      unit: /id="nutrition_kcal">[\s\S]*?<\/span>\s*kcal per slice/.test(main)
        ? 'per slice'
        : 'per item',
    },
    large_image_url: /class="enlarge_image" href="([^"]+)"/.exec(main)?.[1] ?? null,
  };
}

const categories = [];
for (const [slug, name] of CATEGORIES) {
  const listing = parseListing(await getPage(`/menu/${slug}`));
  const items = [];
  for (const card of listing) {
    if (!card.path) continue;
    const page = parseItem(await getPage(card.path));
    items.push({ ...card, page });
    process.stdout.write('.');
  }
  categories.push({ slug, name, items });
}
process.stdout.write('\n');

const allergenPage = text(stripScripts(await getPage('/allergen-nutritional-info')));
const allergenNotice =
  /Allergen information is being updated[^\n]*/.exec(allergenPage)?.[0] ?? null;

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: ORIGIN,
      captured_at: new Date().toISOString().slice(0, 10),
      note: 'Faithful capture of the source menu. Do not edit by hand; re-run pnpm menu:import.',
      allergen_page_notice: allergenNotice,
      categories,
    },
    null,
    2,
  ) + '\n',
);

for (const c of categories) console.log(`${c.name}: ${c.items.length} items`);
console.log(`Wrote ${OUT}`);
