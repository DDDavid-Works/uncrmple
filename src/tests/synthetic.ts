import type { Point, Quad, RasterImage } from "../types/repair";

function inside(poly: readonly Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const s = Math.sign(cross);
    if (s !== 0) {
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

export function solid(width: number, height: number, v: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** A light page (with a few dark "text" rows) over a dark, mildly gradient background. */
export function pagePhoto(width: number, height: number, page: Quad, bg = 60, paper = 235): RasterImage {
  const img = solid(width, height, bg);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (inside(page, x + 0.5, y + 0.5)) {
        const textRow = (y % 24) < 4 && x % 7 < 5;
        const v = textRow ? 40 : paper;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      } else {
        const v = bg + Math.round((x / width) * 20);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      }
    }
  }
  return img;
}

/** Byte-wise equality; avoids vitest's very slow deep-equality on large typed arrays. */
export function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const SHADOW = { width: 800, height: 600, textY: 100, textRows: 4, block: { x: 400, y: 400, size: 60 } };

/**
 * Bluish paper under a left-to-right shadow (100% down to 50% brightness) with a row of dark
 * "text" and a large black block. Returns also the shadow factor so tests can reason about it.
 */
export function shadowedPage(): RasterImage {
  const { width, height, textY, textRows, block } = SHADOW;
  const img = solid(width, height, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const f = 1 - 0.5 * (x / width);
      let c: [number, number, number] = [225, 230, 245];
      const inText = y >= textY && y < textY + textRows && x >= 40 && x < 760 && x % 8 < 5;
      const inBlock = x >= block.x && x < block.x + block.size && y >= block.y && y < block.y + block.size;
      if (inText) c = [30, 30, 40];
      if (inBlock) c = [20, 20, 20];
      const i = (y * width + x) * 4;
      img.data[i] = c[0] * f;
      img.data[i + 1] = c[1] * f;
      img.data[i + 2] = c[2] * f;
    }
  }
  return img;
}

export const lum = (img: RasterImage, x: number, y: number): number => {
  const i = (y * img.width + x) * 4;
  return 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!;
};

/** Paper filled with rows of short dark "text" dashes; `margin` pixels around stay blank. */
export function textSheet(width: number, height: number, paper = 225, ink = 40, margin = 40): RasterImage {
  const img = solid(width, height, paper);
  for (let y = margin; y < height - margin; y++) {
    if (y % 20 >= 6) continue;
    for (let x = margin; x < width - margin; x++) {
      if (x % 6 >= 4) continue;
      const i = (y * width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = ink;
    }
  }
  return img;
}

/** Separable box blur applied `passes` times (approximates a Gaussian). Returns a new image. */
export function boxBlur(src: RasterImage, radius: number, passes = 2): RasterImage {
  let cur = new Uint8ClampedArray(src.data);
  const { width, height } = src;
  for (let p = 0; p < passes; p++) {
    for (const horizontal of [true, false]) {
      const next = new Uint8ClampedArray(cur.length);
      const len = horizontal ? width : height;
      const lines = horizontal ? height : width;
      for (let l = 0; l < lines; l++) {
        for (let k = 0; k < len; k++) {
          let sum = 0;
          let n = 0;
          for (let d = -radius; d <= radius; d++) {
            const kk = Math.min(len - 1, Math.max(0, k + d));
            sum += cur[horizontal ? (l * width + kk) * 4 : (kk * width + l) * 4]!;
            n++;
          }
          const o = horizontal ? (l * width + k) * 4 : (k * width + l) * 4;
          next[o] = next[o + 1] = next[o + 2] = sum / n;
          next[o + 3] = 255;
        }
      }
      cur = next;
    }
  }
  return { width, height, data: cur };
}

/** Multiply brightness by `factor(x, y)`. Returns a new image. */
export function shade(src: RasterImage, factor: (x: number, y: number) => number): RasterImage {
  const data = new Uint8ClampedArray(src.data);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const f = factor(x, y);
      const i = (y * src.width + x) * 4;
      data[i] = data[i]! * f;
      data[i + 1] = data[i + 1]! * f;
      data[i + 2] = data[i + 2]! * f;
    }
  }
  return { width: src.width, height: src.height, data };
}
