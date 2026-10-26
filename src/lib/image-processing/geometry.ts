import { MAX_PIXELS } from "../files/limits";
import type { Point, Quad, RepairError, Result } from "../../types/repair";

/** A page smaller than this fraction of the image is almost certainly not the document. */
export const MIN_QUAD_AREA_FRACTION = 0.02;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Order four arbitrary points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: readonly Point[]): Quad {
  if (pts.length !== 4) throw new Error("orderCorners requires exactly four points");
  // Smallest score wins; negate the score to select the largest.
  const lowest = (score: (p: Point) => number) =>
    pts.reduce((best, p) => (score(p) < score(best) ? p : best));
  const tl = lowest((p) => p.x + p.y);
  const br = lowest((p) => -(p.x + p.y));
  const tr = lowest((p) => -(p.x - p.y));
  const bl = lowest((p) => p.x - p.y);
  return [tl, tr, br, bl];
}

/** Absolute polygon area (shoelace). */
export function polygonArea(pts: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function isConvex(pts: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const c = pts[(i + 2) % pts.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

const invalid = (message: string): Result<never> => ({
  ok: false,
  error: { code: "invalid-corners", message } satisfies RepairError,
});

/** Check that corners describe a usable page inside the image. */
export function validateQuad(quad: Quad, width: number, height: number): Result<Quad> {
  for (const p of quad) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return invalid("Corner coordinates are not valid numbers.");
    if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return invalid("Corners must lie inside the image.");
  }
  if (!isConvex(quad)) return invalid("The corners must form a convex four-sided shape without crossing.");
  if (polygonArea(quad) < MIN_QUAD_AREA_FRACTION * width * height) {
    return invalid("The selected area is too small to be a document page.");
  }
  return { ok: true, value: quad };
}

/**
 * Output size for a warped quad: the longer of each pair of opposite edges, so no
 * resolution is discarded. Scaled down uniformly if it would exceed the pixel budget.
 */
export function outputSize(quad: Quad, maxPixels: number = MAX_PIXELS): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  let width = Math.max(dist(tl, tr), dist(bl, br));
  let height = Math.max(dist(tl, bl), dist(tr, br));
  const pixels = width * height;
  if (pixels > maxPixels) {
    const k = Math.sqrt(maxPixels / pixels);
    width *= k;
    height *= k;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** The whole image as a quad: repairing with it cleans up the photo without cropping or straightening. */
export function fullFrameQuad(width: number, height: number): Quad {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

export function scaleQuad(quad: Quad, sx: number, sy: number): Quad {
  const s = (p: Point): Point => ({ x: p.x * sx, y: p.y * sy });
  return [s(quad[0]), s(quad[1]), s(quad[2]), s(quad[3])];
}
