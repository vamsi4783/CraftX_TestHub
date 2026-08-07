// ─── PNG test fixtures ────────────────────────────────────────────────────────
// Programmatic PNG generation — no file I/O, no AI.

import { PNG } from 'pngjs';

/** Create a solid-colour PNG of the given dimensions. */
export function solidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png  = new PNG({ width, height });
  const size = width * height * 4;
  for (let i = 0; i < size; i += 4) {
    png.data[i]     = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return Buffer.from(PNG.sync.write(png));
}

/** Create a PNG with a coloured rectangle drawn over a white background. */
export function rectPng(
  width: number, height: number,
  rx: number, ry: number, rw: number, rh: number,
  r: number, g: number, b: number,
): Buffer {
  const png   = new PNG({ width, height });
  const total = width * height * 4;
  // white background
  for (let i = 0; i < total; i += 4) {
    png.data[i] = png.data[i + 1] = png.data[i + 2] = 255;
    png.data[i + 3] = 255;
  }
  // coloured rect
  for (let y = ry; y < Math.min(ry + rh, height); y++) {
    for (let x = rx; x < Math.min(rx + rw, width); x++) {
      const idx        = (y * width + x) * 4;
      png.data[idx]     = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return Buffer.from(PNG.sync.write(png));
}

/** 10×10 white PNG. */
export const WHITE_10x10 = () => solidPng(10, 10, 255, 255, 255);

/** 10×10 black PNG. */
export const BLACK_10x10 = () => solidPng(10, 10, 0, 0, 0);

/** 10×10 red PNG. */
export const RED_10x10   = () => solidPng(10, 10, 255, 0, 0);

/** 20×10 white PNG (different width to 10×10). */
export const WHITE_20x10 = () => solidPng(20, 10, 255, 255, 255);
