import type { Gray } from "./assessment/pixels";

/** Neighbourhood for the local-darkness test, as a fraction of the longer side. */
const WINDOW_FRACTION = 1 / 40;
/** A pixel is ink when it is at least this much darker than its neighbourhood mean. */
const INK_RATIO = 0.85;
const INK_MIN_DIFF = 12;

/**
 * Ink mask of a page: 1 where a pixel is clearly darker than its neighbourhood (text, ruled
 * lines), so uneven lighting does not matter. A `margin` fraction on each side is left at 0 so
 * the page border and background wedges do not count. Uses an integral image for the local mean.
 */
export function inkMask(gray: Gray, margin: number): Uint8Array {
  const { width: w, height: h, data } = gray;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x]!;
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1]! + row;
    }
  }
  const r = Math.max(4, Math.round(Math.max(w, h) * WINDOW_FRACTION));
  const x0 = Math.round(w * margin), x1 = w - x0;
  const y0 = Math.round(h * margin), y1 = h - y0;
  const mask = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) {
    const top = Math.max(0, y - r), bottom = Math.min(h, y + r + 1);
    for (let x = x0; x < x1; x++) {
      const left = Math.max(0, x - r), right = Math.min(w, x + r + 1);
      const sum =
        integral[bottom * (w + 1) + right]! - integral[top * (w + 1) + right]! -
        integral[bottom * (w + 1) + left]! + integral[top * (w + 1) + left]!;
      const mean = sum / ((bottom - top) * (right - left));
      const v = data[y * w + x]!;
      if (v < mean * INK_RATIO && mean - v > INK_MIN_DIFF) mask[y * w + x] = 1;
    }
  }
  return mask;
}
