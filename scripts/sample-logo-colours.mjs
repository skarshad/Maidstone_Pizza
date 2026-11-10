// Prints the dominant colours of the supplied logo, used to define design tokens.
import sharp from 'sharp';

const src = new URL('../assets/brand/maidstone-pizza-logo.png', import.meta.url);
const { data, info } = await sharp(
  src.pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll('%20', ' '),
)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const bins = new Map();
for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  const key = `${r >> 4},${g >> 4},${b >> 4}`;
  const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
  bin.n++;
  bin.r += r;
  bin.g += g;
  bin.b += b;
  bins.set(key, bin);
}
const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
const total = info.width * info.height;
[...bins.values()]
  .sort((a, b) => b.n - a.n)
  .slice(0, 14)
  .forEach((bin) => {
    const colour = `#${hex(bin.r / bin.n)}${hex(bin.g / bin.n)}${hex(bin.b / bin.n)}`;
    console.log(colour.toUpperCase(), `${((bin.n / total) * 100).toFixed(1)}%`);
  });
