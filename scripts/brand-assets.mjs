// Generates every derived brand asset from the supplied logo.
// The logo is only ever resized or placed on a matching cream canvas:
// never redrawn, recoloured, cropped or distorted.
//
//   pnpm brand:assets
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'assets/brand/maidstone-pizza-logo.png');
const CREAM = '#FBEFD5'; // sampled from the logo background

async function out(path, pipeline) {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await pipeline.toFile(file);
  console.log('  wrote', path);
}

const square = (size) => sharp(SOURCE).resize(size, size, { fit: 'contain', background: CREAM });

/** Logo centred on a cream canvas, scaled to `logoSize` px. */
async function onCanvas(width, height, logoSize, background = CREAM) {
  const logo = await sharp(SOURCE).resize(logoSize, logoSize).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background } }).composite([
    { input: logo, gravity: 'centre' },
  ]);
}

/** ICO container holding PNG images (supported by every current browser). */
async function ico(sizes) {
  const images = await Promise.all(sizes.map((s) => square(s).ensureAlpha().png().toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map((img, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i] % 256, 0);
    e.writeUInt8(sizes[i] % 256, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

console.log('Web apps');
const favicon = await ico([16, 32, 48]);
for (const app of ['web', 'admin', 'kitchen']) {
  const base = `apps/${app}`;
  await mkdir(join(root, base, 'src/app'), { recursive: true });
  await writeFile(join(root, base, 'src/app/favicon.ico'), favicon);
  console.log('  wrote', `${base}/src/app/favicon.ico`);
  await out(`${base}/src/app/icon.png`, square(512).png());
  await out(`${base}/src/app/apple-icon.png`, square(180).png());
  await out(`${base}/public/brand/icon-192.png`, square(192).png());
  await out(`${base}/public/brand/icon-512.png`, square(512).png());
  // Maskable icons keep the whole badge inside the central 80% safe zone.
  await out(`${base}/public/brand/icon-maskable-512.png`, (await onCanvas(512, 512, 400)).png());
  await out(`${base}/public/brand/logo.png`, square(800).png({ compressionLevel: 9 }));
}

console.log('Social, email, print');
const og = (await onCanvas(1200, 630, 540)).png();
await out('apps/web/src/app/opengraph-image.png', og);
await out('assets/brand/generated/og-image.png', og.clone());
await out('assets/brand/generated/email-header.png', (await onCanvas(1200, 360, 300)).png());
// 1-bit black and white for 80mm thermal printers (576 dots wide; logo at 384).
await out(
  'assets/brand/generated/receipt-logo-mono.png',
  sharp(SOURCE).resize(384, 384).greyscale().threshold(150).png({ palette: true, colours: 2 }),
);

console.log('Mobile (used in Phase 8)');
await out('assets/brand/generated/mobile/icon-1024.png', square(1024).png());
// Android adaptive icon: foreground must sit in the central 66% of the canvas.
await out(
  'assets/brand/generated/mobile/adaptive-foreground.png',
  (await onCanvas(1024, 1024, 640, { r: 0, g: 0, b: 0, alpha: 0 })).png(),
);
await out('assets/brand/generated/mobile/splash.png', (await onCanvas(1284, 2778, 760)).png());

console.log('Done.');
