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

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * An upright light page on a dark background whose printed lines lean by `angleAt(t)` degrees,
 * where t runs 0..1 from the top to the bottom of the page (constant: tilted print; varying: a
 * curved page). Rows of "words" plus a ruled line every fifth row, like a form.
 */
export function leaningTextPhoto(width: number, height: number, page: PageRect, angleAt: (t: number) => number, margin = 30): RasterImage {
  const img = solid(width, height, 60);
  const cx = page.x + page.width / 2, cy = page.y + page.height / 2;
  for (let y = page.y; y < page.y + page.height; y++) {
    const a = (angleAt((y - page.y) / page.height) * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    for (let x = page.x; x < page.x + page.width; x++) {
      let v = 230;
      const inside = x >= page.x + margin && x < page.x + page.width - margin && y >= page.y + margin && y < page.y + page.height - margin;
      if (inside) {
        // Pattern coordinates: rotate back so the print is level.
        const u = (x - cx) * cos + (y - cy) * sin + 10_000;
        const w = -(x - cx) * sin + (y - cy) * cos + 10_000;
        const row = Math.floor(w / 22);
        const ruled = row % 5 === 0 && w % 22 < 2;
        const text = row % 5 !== 0 && w % 22 < 6 && (u + row * 17) % 50 < 38 && u % 5 < 4;
        if (ruled || text) v = 45;
      }
      const i = (y * width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
  }
  return img;
}

/** Layout of `bentTextPage`: row pitch, text row height, every fifth row is a ruled line. */
export const BENT_LAYOUT = { pitch: 22, textHeight: 6, ruledHeight: 2, ruledEvery: 5, margin: 30 };

export interface BentRow {
  kind: "ruled" | "text";
  /** Centre of the row on the flat page, in pixel-index coordinates. */
  y: number;
}

/**
 * A light page of text rows and ruled lines (like a form) that is flat in "page" coordinates and
 * displaced vertically in the image by `shift(x, y)` pixels, as a curved or creased sheet would be.
 * The true image position of a row at x is `row.y + shift(x, row.y)`. Optional `gutter` leaves a
 * blank column [from, to) between two text columns; optional `speckle` fills a rectangle with
 * random dots (a photo-like area with no lines).
 */
export function bentTextPage(
  width: number,
  height: number,
  shift: (x: number, y: number) => number,
  options: { gutter?: [number, number]; speckle?: PageRect } = {},
): { image: RasterImage; rows: BentRow[] } {
  const { pitch, textHeight, ruledHeight, ruledEvery, margin } = BENT_LAYOUT;
  const img = solid(width, height, 230);
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < margin || x >= width - margin) continue;
      if (options.gutter && x >= options.gutter[0] && x < options.gutter[1]) continue;
      // Invert the displacement (two fixed-point steps are plenty for smooth, small shifts).
      const yc = y + 0.5;
      const flat = yc - shift(x, yc - shift(x, yc));
      if (flat < margin || flat >= height - margin) continue;
      const row = Math.floor((flat - margin) / pitch);
      const local = flat - margin - row * pitch;
      const ruled = row % ruledEvery === 0;
      const ink = ruled ? local < ruledHeight : local < textHeight && (x + row * 17) % 50 < 38 && x % 5 < 4;
      if (!ink) continue;
      const i = (y * width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 45;
    }
  }
  const s = options.speckle;
  if (s) {
    for (let y = s.y; y < s.y + s.height; y++) {
      for (let x = s.x; x < s.x + s.width; x++) {
        const i = (y * width + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = rand() < 0.4 ? 40 : 215;
      }
    }
  }
  const rows: BentRow[] = [];
  for (let row = 0; margin + row * pitch < height - margin; row++) {
    const ruled = row % ruledEvery === 0;
    const h = ruled ? ruledHeight : textHeight;
    if (margin + row * pitch + h > height - margin) break;
    rows.push({ kind: ruled ? "ruled" : "text", y: margin + row * pitch + h / 2 - 0.5 });
  }
  return { image: img, rows };
}

/**
 * Reference vertical remap for tests: output pixel (x, y) takes the input at (x, y + shift(x, y)),
 * interpolated linearly between rows and clamped at the edges. Returns a new image.
 */
export function remapVertical(src: RasterImage, shift: (x: number, y: number) => number): RasterImage {
  const { width, height } = src;
  const data = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sy = Math.min(height - 1, Math.max(0, y + shift(x, y)));
      const y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), t = sy - y0;
      const o = (y * width + x) * 4, a = (y0 * width + x) * 4, b = (y1 * width + x) * 4;
      for (let c = 0; c < 4; c++) data[o + c] = src.data[a + c]! * (1 - t) + src.data[b + c]! * t;
    }
  }
  return { width, height, data };
}

/** Place `page` on a dark background of the given size, with its top-left corner at (x, y). */
export function onBackground(page: RasterImage, width: number, height: number, x: number, y: number): RasterImage {
  const img = solid(width, height, 55);
  for (let row = 0; row < page.height; row++) {
    img.data.set(page.data.subarray(row * page.width * 4, (row + 1) * page.width * 4), ((y + row) * width + x) * 4);
  }
  return img;
}
