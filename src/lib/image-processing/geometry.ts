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

/**
 * Limits on the shape of a detected page outline. A flat sheet photographed even at a steep angle
 * keeps its corners well away from slivers and its opposite sides within a factor of two; outlines
 * outside these limits are a wrong segmentation, not a page, and warping them distorts the result.
 */
export const PAGE_SHAPE = { minAngleDeg: 55, maxAngleDeg: 125, minSideRatio: 0.5 } as const;

/** Interior angles in degrees, one per corner, for a quad given in cyclic order. */
export function interiorAngles(quad: readonly Point[]): number[] {
  return quad.map((p, i) => {
    const a = quad[(i + quad.length - 1) % quad.length]!;
    const b = quad[(i + 1) % quad.length]!;
    const ux = a.x - p.x, uy = a.y - p.y, vx = b.x - p.x, vy = b.y - p.y;
    const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  });
}

/**
 * Whether four corners (in cyclic order, any starting corner) could plausibly be a photographed
 * page: convex, no corner sharper or flatter than PAGE_SHAPE allows, and each pair of opposite
 * sides within PAGE_SHAPE.minSideRatio of each other. Used to reject automatic detections only;
 * corners a person places are trusted as long as validateQuad accepts them.
 */
export function isPlausiblePage(quad: readonly Point[]): boolean {
  if (quad.length !== 4 || !isConvex(quad)) return false;
  if (interiorAngles(quad).some((a) => a < PAGE_SHAPE.minAngleDeg || a > PAGE_SHAPE.maxAngleDeg)) return false;
  const side = (i: number) => dist(quad[i]!, quad[(i + 1) % 4]!);
  const ratio = (a: number, b: number) => Math.min(a, b) / Math.max(a, b);
  return ratio(side(0), side(2)) >= PAGE_SHAPE.minSideRatio && ratio(side(1), side(3)) >= PAGE_SHAPE.minSideRatio;
}

/** Whether `p` lies inside the convex quad, allowing `slack` px outside. */
export function pointInQuad(quad: readonly Point[], p: Point, slack: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const c = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
    if (Math.abs(c) <= slack) continue;
    const sg = Math.sign(c);
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
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
 * Check a warp frame that may reach beyond the photo (a rotated frame around a page outline that
 * is itself validated with `validateQuad`): finite, convex corners only.
 */
export function validateFrame(frame: Quad): Result<Quad> {
  if (frame.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return invalid("Corner coordinates are not valid numbers.");
  if (!isConvex(frame)) return invalid("The corners must form a convex four-sided shape without crossing.");
  return { ok: true, value: frame };
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

/** Row-major 3×3 projective transform. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/** The projective transform mapping each `from` corner onto the matching `to` corner, or null if degenerate. */
export function homography(from: Quad, to: Quad): Homography | null {
  // Eight equations in h0..h7 (h8 = 1), solved by Gaussian elimination with partial pivoting.
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[pivot]![c]!)) pivot = r;
    if (Math.abs(m[pivot]![c]!) < 1e-12) return null;
    [m[c], m[pivot]] = [m[pivot]!, m[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k < 9; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const h = m.map((row, i) => row[8]! / row[i]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** Corners of a width×height output image, matching the target used by the perspective warp. */
export function rectQuad(width: number, height: number): Quad {
  return [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
}
