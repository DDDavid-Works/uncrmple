import type { CardDetectionLevel, CardWarning, Point, Quad } from "../../types/repair";
import { isConvex, polygonArea } from "./geometry";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Common cards (ISO ID-1 is 1.586) fall in this range; others are scored down, not rejected. */
const TYPICAL_ASPECT: readonly [number, number] = [1.2, 1.9];
const PLAUSIBLE_ASPECT: readonly [number, number] = [1.05, 2.3];
/** Opposite sides differing by more than this ratio mean strong perspective. */
export const STRONG_PERSPECTIVE_RATIO = 1.35;
/** A side is "visible" when at least this share of its samples shows contrast. */
export const VISIBLE_SIDE_SHARE = 0.5;
export const READY_CONFIDENCE = 0.7;
export const MIN_CONFIDENCE = 0.35;

/** Long side / short side from mean opposite-edge lengths. An approximation under perspective. */
export function estimateAspectRatio(quad: Quad): number {
  const [tl, tr, br, bl] = quad;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  if (w < 1e-9 || h < 1e-9) return 1;
  return Math.max(w, h) / Math.min(w, h);
}

/** Interior angle at each corner in degrees. */
export function interiorAngles(quad: Quad): number[] {
  return quad.map((p, i) => {
    const a = quad[(i + 3) % 4]!;
    const b = quad[(i + 1) % 4]!;
    const v1 = { x: a.x - p.x, y: a.y - p.y };
    const v2 = { x: b.x - p.x, y: b.y - p.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
}

/** Largest ratio between opposite sides (>= 1); 1 means no perspective foreshortening. */
export function perspectiveRatio(quad: Quad): number {
  const [tl, tr, br, bl] = quad;
  const pair = (a: number, b: number) => (Math.min(a, b) < 1e-9 ? Infinity : Math.max(a, b) / Math.min(a, b));
  return Math.max(pair(dist(tl, tr), dist(bl, br)), pair(dist(tl, bl), dist(tr, br)));
}

/** 0..1: how rectangle-like and card-proportioned the quad is, tolerant of perspective. */
export function shapeScore(quad: Quad): number {
  if (!isConvex(quad)) return 0;
  const maxAngleError = Math.max(...interiorAngles(quad).map((a) => Math.abs(a - 90)));
  // Perspective legitimately bends angles by tens of degrees; beyond ~50 it is not a rectangle.
  const angle = Math.max(0, 1 - maxAngleError / 50);
  const ratio = estimateAspectRatio(quad);
  let aspect: number;
  if (ratio >= TYPICAL_ASPECT[0] && ratio <= TYPICAL_ASPECT[1]) aspect = 1;
  else if (ratio >= PLAUSIBLE_ASPECT[0] && ratio <= PLAUSIBLE_ASPECT[1]) aspect = 0.6;
  else aspect = 0;
  return angle * aspect;
}

export interface CardSignals {
  quad: Quad;
  imageWidth: number;
  imageHeight: number;
  edgeSupport: number;
  sideVisibility: readonly [number, number, number, number];
}

export interface CardScore {
  confidence: number;
  /** Null when the candidate is too weak to offer even for verification. */
  level: CardDetectionLevel | null;
  areaFraction: number;
  aspectRatio: number;
  warnings: CardWarning[];
}

/**
 * Heuristic card confidence (0..1): 30% edge support, 30% mean side visibility, 25% shape,
 * 15% size. Capped below "ready" if any side is not clearly visible. Not a probability.
 */
export function scoreCard(s: CardSignals): CardScore {
  const areaFraction = polygonArea(s.quad) / (s.imageWidth * s.imageHeight);
  const shape = shapeScore(s.quad);
  const vis = s.sideVisibility.reduce((a, b) => a + b, 0) / 4;
  const minVis = Math.min(...s.sideVisibility);
  const size = Math.min(1, areaFraction / 0.06);
  let confidence = 0.3 * s.edgeSupport + 0.3 * vis + 0.25 * shape + 0.15 * size;
  const allVisible = minVis >= VISIBLE_SIDE_SHARE;
  if (!allVisible) confidence = Math.min(confidence, READY_CONFIDENCE - 0.05);

  const warnings: CardWarning[] = [];
  if (!allVisible) warnings.push("edge-unclear");
  const margin = 3;
  if (s.quad.some((p) => p.x <= margin || p.y <= margin || p.x >= s.imageWidth - margin || p.y >= s.imageHeight - margin)) {
    warnings.push("card-cut-off");
  }
  if (perspectiveRatio(s.quad) > STRONG_PERSPECTIVE_RATIO) warnings.push("strong-perspective");

  let level: CardDetectionLevel | null = null;
  // Shape and size alone never qualify: the outline must also follow real edges with visible contrast.
  if (shape > 0 && confidence >= MIN_CONFIDENCE && s.edgeSupport >= 0.25 && vis >= 0.25) {
    const ready = confidence >= READY_CONFIDENCE && allVisible && shape >= 0.6 && !warnings.includes("card-cut-off");
    level = ready ? "ready" : "verify";
  }
  return { confidence, level, areaFraction, aspectRatio: estimateAspectRatio(s.quad), warnings };
}

type Line = { p: Point; d: Point };

function intersect(l1: Line, l2: Line): Point | null {
  const det = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / det;
  return { x: l1.p.x + t * l1.d.x, y: l1.p.y + t * l1.d.y };
}

/** Candidate lines need at least this share of the best line's inliers to be considered. */
const OUTERMOST_SUPPORT_SHARE = 0.5;

/**
 * Line supported by many points, preferring the outermost one. Candidate lines through evenly
 * spaced point pairs are ranked by points within `tol`; every line with at least half the best
 * support is a contender and the one furthest in the `outward` direction wins (a card's boundary
 * is its outermost strong edge; printed boxes and headers lie inside it). The winner is refitted
 * (total least squares) to its inliers. Deterministic.
 */
function consensusLine(pts: readonly Point[], tol: number, outward: Point): Line {
  const n = pts.length;
  const step = Math.max(1, Math.floor(n / 24));
  const found: { inliers: Point[]; offset: number }[] = [];
  for (let i = 0; i < n; i += step) {
    for (let j = i + step; j < n; j += step) {
      const a = pts[i]!;
      const b = pts[j]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-9) continue;
      const inliers = pts.filter((q) => Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / len <= tol);
      const mx = inliers.reduce((t, q) => t + q.x, 0) / (inliers.length || 1);
      const my = inliers.reduce((t, q) => t + q.y, 0) / (inliers.length || 1);
      found.push({ inliers, offset: mx * outward.x + my * outward.y });
    }
  }
  const most = Math.max(0, ...found.map((f) => f.inliers.length));
  const contenders = found.filter((f) => f.inliers.length >= Math.max(2, OUTERMOST_SUPPORT_SHARE * most));
  contenders.sort((x, y) => y.offset - x.offset);
  const use = contenders[0]?.inliers ?? pts;
  const mx = use.reduce((t, q) => t + q.x, 0) / use.length;
  const my = use.reduce((t, q) => t + q.y, 0) / use.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const q of use) {
    sxx += (q.x - mx) ** 2;
    syy += (q.y - my) ** 2;
    sxy += (q.x - mx) * (q.y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: { x: mx, y: my }, d: { x: Math.cos(theta), y: Math.sin(theta) } };
}

/**
 * Sharpen a rough quad using the outline pixels it came from. Real cards have rounded corners, so
 * polygon approximation misplaces them; fitting a straight line to each side's points (ignoring
 * the ends) and intersecting neighbours recovers the true corners. A side with too few points keeps
 * its original line; the original quad is returned if the result is not convex or moves any corner
 * more than a fifth of the shorter side.
 */
export function refineQuadByLines(quad: Quad, outline: readonly Point[]): Quad {
  const lens = [0, 1, 2, 3].map((i) => dist(quad[i]!, quad[(i + 1) % 4]!));
  const tol = Math.max(2, 0.06 * Math.min(...lens));
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const lines: Line[] = [];
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const len = lens[i]!;
    if (len < 1) return quad;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const pts: Point[] = [];
    for (const p of outline) {
      const t = ((p.x - a.x) * ux + (p.y - a.y) * uy) / len;
      if (t < 0.15 || t > 0.85) continue;
      const off = Math.abs(-(p.x - a.x) * uy + (p.y - a.y) * ux);
      if (off <= tol) pts.push(p);
    }
    if (pts.length < 8) {
      lines.push({ p: a, d: { x: b.x - a.x, y: b.y - a.y } });
      continue;
    }
    // Unit normal pointing away from the quad centre.
    let nx = -uy, ny = ux;
    if (nx * (cx - a.x) + ny * (cy - a.y) > 0) { nx = -nx; ny = -ny; }
    lines.push(consensusLine(pts, Math.max(1.5, 0.008 * Math.min(...lens)), { x: nx, y: ny }));
  }
  const corners = [0, 1, 2, 3].map((k) => intersect(lines[(k + 3) % 4]!, lines[k]!));
  if (corners.some((c) => c === null)) return quad;
  const result = corners as Point[];
  const maxMove = 0.2 * Math.min(...lens);
  if (!isConvex(result) || result.some((p, k) => dist(p, quad[k]!) > maxMove)) return quad;
  return [result[0]!, result[1]!, result[2]!, result[3]!];
}

/**
 * Reduce a convex polygon to four corners by repeatedly removing the edge whose removal adds the
 * least area, extending its two neighbours until they meet. Chamfered or rounded corners therefore
 * collapse onto the true corner instead of skewing the result. Returns null if the polygon has
 * fewer than four vertices or an edge cannot be removed (neighbours parallel or diverging).
 */
export function reduceToQuad(polygon: readonly Point[]): Quad | null {
  let poly = [...polygon];
  if (poly.length < 4) return null;
  while (poly.length > 4) {
    const n = poly.length;
    let bestIdx = -1;
    let bestCost = Infinity;
    let bestApex: Point | null = null;
    for (let i = 0; i < n; i++) {
      const p0 = poly[(i + n - 1) % n]!;
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % n]!;
      const p3 = poly[(i + 2) % n]!;
      const apex = intersect(
        { p: p0, d: { x: p1.x - p0.x, y: p1.y - p0.y } },
        { p: p3, d: { x: p2.x - p3.x, y: p2.y - p3.y } },
      );
      if (!apex) continue;
      // The apex must lie beyond p1 along p0->p1 and beyond p2 along p3->p2.
      const d1 = { x: p1.x - p0.x, y: p1.y - p0.y };
      const d2 = { x: p2.x - p3.x, y: p2.y - p3.y };
      if ((apex.x - p1.x) * d1.x + (apex.y - p1.y) * d1.y <= 0) continue;
      if ((apex.x - p2.x) * d2.x + (apex.y - p2.y) * d2.y <= 0) continue;
      const cost = polygonArea([p1, apex, p2]);
      if (cost < bestCost) { bestCost = cost; bestIdx = i; bestApex = apex; }
    }
    if (bestIdx < 0 || !bestApex) return null;
    const next: Point[] = [];
    for (let k = 0; k < n; k++) {
      if (k === bestIdx) next.push(bestApex);
      else if (k !== (bestIdx + 1) % n) next.push(poly[k]!);
    }
    poly = next;
  }
  return isConvex(poly) ? [poly[0]!, poly[1]!, poly[2]!, poly[3]!] : null;
}
