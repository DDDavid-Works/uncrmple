import type { Point, Quad, RasterImage } from "../../../types/repair";

/** 8-bit luminance image. */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export function toGray(image: RasterImage): Gray {
  const { width, height, data } = image;
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (77 * data[i]! + 150 * data[i + 1]! + 29 * data[i + 2]!) >> 8;
  }
  return { width, height, data: out };
}

/** Pull every corner toward the centroid so the page border itself is excluded from measurements. */
export function shrinkQuad(quad: Quad, fraction: number): Quad {
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  const k = 1 - fraction;
  const f = (p: Point): Point => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k });
  return [f(quad[0]), f(quad[1]), f(quad[2]), f(quad[3])];
}

/** 1 for pixels whose centre lies inside the (convex) quad. */
export function quadMask(width: number, height: number, quad: Quad): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const yc = y + 0.5;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 4; i++) {
      const a = quad[i]!;
      const b = quad[(i + 1) % 4]!;
      if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) {
        const x = a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    if (lo > hi) continue;
    const from = Math.max(0, Math.ceil(lo - 0.5));
    const to = Math.min(width - 1, Math.floor(hi - 0.5));
    for (let x = from; x <= to; x++) mask[y * width + x] = 1;
  }
  return mask;
}

/** Mask of the whole image minus a small margin; used when no page outline was found. */
export function insetMask(width: number, height: number, marginFraction: number): Uint8Array {
  const mx = Math.round(width * marginFraction);
  const my = Math.round(height * marginFraction);
  const mask = new Uint8Array(width * height);
  for (let y = my; y < height - my; y++) mask.fill(1, y * width + mx, y * width + width - mx);
  return mask;
}

/** Smallest bin index whose cumulative count reaches `q * total`. */
export function histPercentile(hist: ArrayLike<number>, total: number, q: number): number {
  const target = q * total;
  let sum = 0;
  for (let i = 0; i < hist.length; i++) {
    sum += hist[i]!;
    if (sum >= target) return i;
  }
  return hist.length - 1;
}

export interface BlockStat {
  /** Paper level: 90th percentile of luminance in the block (text is darker than this). */
  paper: number;
  /** Ink level: 5th percentile of luminance in the block. */
  ink: number;
}

/**
 * Per-block luminance statistics over a grid, using only blocks mostly inside the mask.
 * Percentiles (not min/max) keep single noisy pixels from deciding the result.
 */
export function blockStats(gray: Gray, mask: Uint8Array, block: number): BlockStat[] {
  const stats: BlockStat[] = [];
  const hist = new Uint32Array(256);
  for (let by = 0; by + block <= gray.height; by += block) {
    for (let bx = 0; bx + block <= gray.width; bx += block) {
      hist.fill(0);
      let count = 0;
      for (let y = by; y < by + block; y++) {
        for (let x = bx; x < bx + block; x++) {
          const i = y * gray.width + x;
          if (mask[i]) {
            hist[gray.data[i]!]!++;
            count++;
          }
        }
      }
      if (count < 0.6 * block * block) continue;
      stats.push({ ink: histPercentile(hist, count, 0.05), paper: histPercentile(hist, count, 0.9) });
    }
  }
  return stats;
}
