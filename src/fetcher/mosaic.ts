import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode';
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode';
import JPEG_DEC_WASM from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
import JPEG_ENC_WASM from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';
import decodePng, { init as initPngDecode } from '@jsquash/png/decode';
import PNG_WASM from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
import { MOSAIC_GAP, MOSAIC_MAX_HEIGHT, MOSAIC_QUALITY, MOSAIC_WIDTH } from '../constants';
import { fetchMediaBytes } from './media';

type Raster = ImageData;

let codecsReady: Promise<void> | undefined;

/**
 * The codecs normally fetch their own wasm, which Workers does not allow. Hand
 * them the modules the bundler compiled in instead, once per isolate.
 */
function initCodecs(): Promise<void> {
  codecsReady ??= (async () => {
    await Promise.all([
      initJpegDecode(JPEG_DEC_WASM),
      initJpegEncode(JPEG_ENC_WASM),
      initPngDecode(PNG_WASM),
    ]);
  })();
  return codecsReady;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

async function decodeImage(bytes: ArrayBuffer): Promise<Raster | null> {
  try {
    const image = isPng(new Uint8Array(bytes, 0, 4)) ? await decodePng(bytes) : await decodeJpeg(bytes);
    return image.width > 0 && image.height > 0 ? image : null;
  } catch {
    return null;
  }
}

/**
 * Draw `source` scaled to exactly (tileWidth x tileHeight) at (dx, dy).
 *
 * Nothing is cropped: dcinside posts mix wide banners with tall screenshots,
 * and cover-cropping those into a fixed tile leaves a few enormous letters.
 * Bilinear is enough at the downscale factors involved.
 */
function drawScaled(
  out: Uint8ClampedArray,
  outWidth: number,
  source: Raster,
  dx: number,
  dy: number,
  tileWidth: number,
  tileHeight: number,
): void {
  const stepX = source.width / tileWidth;
  const stepY = source.height / tileHeight;

  for (let y = 0; y < tileHeight; y++) {
    const sourceY = (y + 0.5) * stepY - 0.5;
    const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(sourceY)));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const wy = sourceY - y0;

    for (let x = 0; x < tileWidth; x++) {
      const sourceX = (x + 0.5) * stepX - 0.5;
      const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(sourceX)));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const wx = sourceX - x0;

      const i00 = (y0 * source.width + x0) * 4;
      const i01 = (y0 * source.width + x1) * 4;
      const i10 = (y1 * source.width + x0) * 4;
      const i11 = (y1 * source.width + x1) * 4;
      const target = ((dy + y) * outWidth + dx + x) * 4;

      for (let channel = 0; channel < 3; channel++) {
        const top = source.data[i00 + channel]! * (1 - wx) + source.data[i01 + channel]! * wx;
        const bottom = source.data[i10 + channel]! * (1 - wx) + source.data[i11 + channel]! * wx;
        out[target + channel] = top * (1 - wy) + bottom * wy;
      }
      out[target + 3] = 255;
    }
  }
}

interface Tile {
  y: number;
  height: number;
}

/**
 * Lay the photos out in a single column at a common width.
 *
 * This is the shape FxEmbed's mosaic service produces, and it is the only one
 * that shows every photo whole: dcinside attachments range from 619x59 banners
 * to full screenshots, so any fixed grid has to crop something away.
 */
function layout(images: Raster[]): { width: number; height: number; tiles: Tile[] } {
  let width = Math.min(MOSAIC_WIDTH, Math.max(...images.map((image) => image.width)));
  let heights = images.map((image) => Math.max(1, Math.round((width * image.height) / image.width)));
  let total = heights.reduce((sum, height) => sum + height, 0) + MOSAIC_GAP * (images.length - 1);

  // A column of tall screenshots can run to thousands of pixels; keep the sheet
  // within something Discord will display and the encoder will chew through.
  if (total > MOSAIC_MAX_HEIGHT) {
    const scale = MOSAIC_MAX_HEIGHT / total;
    width = Math.max(1, Math.round(width * scale));
    heights = images.map((image) => Math.max(1, Math.round((width * image.height) / image.width)));
    total = heights.reduce((sum, height) => sum + height, 0) + MOSAIC_GAP * (images.length - 1);
  }

  const tiles: Tile[] = [];
  let y = 0;
  for (const height of heights) {
    tiles.push({ y, height });
    y += height + MOSAIC_GAP;
  }
  return { width, height: total, tiles };
}

/**
 * Stitch up to four photos into one JPEG.
 *
 * Discord renders several og:image tags as a grid, and that layout has no site
 * row - no icon, project name or timestamp. One image keeps the normal layout,
 * so the grid has to be baked into the picture. This is what FxEmbed's separate
 * mosaic service does; here it happens in the Worker, with no image service.
 */
export async function buildMosaic(urls: string[]): Promise<Uint8Array | null> {
  const wanted = urls.slice(0, 4);
  if (wanted.length < 2) return null;

  const buffers = await Promise.all(wanted.map(fetchMediaBytes));
  await initCodecs();

  const images: Raster[] = [];
  for (const buffer of buffers) {
    if (!buffer) continue;
    const decoded = await decodeImage(buffer);
    if (decoded) images.push(decoded);
  }
  if (images.length < 2) return null;

  const { width, height, tiles } = layout(images);
  const canvas = new Uint8ClampedArray(width * height * 4);
  // Fill opaque black so any gap reads as a deliberate gutter.
  for (let i = 3; i < canvas.length; i += 4) canvas[i] = 255;

  images.forEach((image, index) => {
    const tile = tiles[index];
    if (tile) drawScaled(canvas, width, image, 0, tile.y, width, tile.height);
  });

  const encoded = await encodeJpeg({ data: canvas, width, height }, { quality: MOSAIC_QUALITY });
  return new Uint8Array(encoded);
}
