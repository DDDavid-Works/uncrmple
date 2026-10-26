import type { RasterImage } from "../../types/repair";

/**
 * Area-average downscale so the longest side is at most `maxSide`. Returns the input
 * unchanged (same object) when it is already small enough; never mutates the input.
 * Used to keep detection cheap and to avoid copying huge buffers into the WASM heap.
 */
export function downscale(image: RasterImage, maxSide: number): { image: RasterImage; scale: number } {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxSide) return { image, scale: 1 };

  const scale = maxSide / longest;
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  const src = image.data;
  const sx = image.width / w;
  const sy = image.height / h;

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(image.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(image.width, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * image.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += src[i]!; g += src[i + 1]!; b += src[i + 2]!; a += src[i + 3]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { image: { width: w, height: h, data: out }, scale: w / image.width };
}
