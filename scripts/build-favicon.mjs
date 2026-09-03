/**
 * Rasterise assets/icon.svg into assets/favicon.ico.
 *
 * The SVG stays the single source of truth; this exists because browsers still
 * probe /favicon.ico and will not accept SVG there. Run `pnpm build:favicon`
 * after editing the icon.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The classic favicon ladder. Anything larger belongs in the SVG, which
// browsers prefer anyway when it is offered.
const SIZES = [16, 32, 48, 64];

/** Pack PNGs into an ICO container. Windows Vista and every modern browser read PNG-in-ICO. */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, data }, index) => {
    const entry = index * 16;
    // 256 is stored as 0 - the field is a single byte.
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette size
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));

const svg = readFileSync(join(root, 'assets/icon.svg'), 'utf8');
const images = SIZES.map((size) => ({
  size,
  data: Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()),
}));

const ico = buildIco(images);
writeFileSync(join(root, 'assets/favicon.ico'), ico);
console.log(`wrote assets/favicon.ico (${SIZES.join(', ')}px, ${ico.length} bytes)`);
