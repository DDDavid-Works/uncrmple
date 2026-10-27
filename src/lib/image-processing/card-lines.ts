import type { Point, Quad } from "../../types/repair";
import { estimateAspectRatio } from "./card-geometry";
import { isConvex, orderCorners, polygonArea } from "./geometry";

export interface Segment { x1: number; y1: number; x2: number; y2: number }

/** A straight edge assembled from collinear segments. */
export interface EdgeLine {
  /** Unit direction; angle in [0, PI). */
  angle: number;
  dx: number;
  dy: number;
  /** Signed distance of the line from the origin along its normal. */
  offset: number;
  /** Extent along the line, as a parameter range on (dx, dy) from the origin's projection. */
  tMin: number;
  tMax: number;
  /** Sum of the lengths of the segments merged into this line. */
  strength: number;
}

const ANGLE_MERGE = (3 * Math.PI) / 180;
const OFFSET_MERGE_PX = 5;
/** Sides of a perspective-distorted rectangle can differ in direction by this much. */
const OPPOSITE_ANGLE_MAX = (32 * Math.PI) / 180;
/** The two side pairs of a card are roughly perpendicular. */
const PAIR_ANGLE_RANGE: readonly [number, number] = [(55 * Math.PI) / 180, (125 * Math.PI) / 180];
const MAX_LINES = 28;
const MAX_QUADS = 12;
const CARD_ASPECT: readonly [number, number] = [1.05, 2.4];
const MIN_SEPARATION_FRACTION = 0.1;
const MIN_OVERLAP = 0.3;
/** Corners may fall this far outside the photo (a side running off-frame) before being rejected. */
const FRAME_SLACK = 0.03;

const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
};

/**
 * Merge collinear segments (same direction within 3 degrees and offset within a few pixels) into
 * longer lines, strongest first. Total-least-squares over the segment end points.
 */
export function mergeSegments(segments: readonly Segment[], minStrength = 0): EdgeLine[] {
  interface Cluster { angle: number; offset: number; pts: Point[]; strength: number }
  const clusters: Cluster[] = [];
  const sorted = [...segments].sort(
    (a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
  );
  for (const s of sorted) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (len < 1e-6) continue;
    const angle = ((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) % Math.PI) + Math.PI) % Math.PI;
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const target = clusters.find((c) => {
      if (angleDiff(c.angle, angle) > ANGLE_MERGE) return false;
      const off = -mx * Math.sin(c.angle) + my * Math.cos(c.angle);
      return Math.abs(off - c.offset) <= OFFSET_MERGE_PX;
    });
    const pts = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
    if (target) {
      target.pts.push(...pts);
      target.strength += len;
      // Refit direction and offset to everything merged so far.
      const fit = fitLine(target.pts);
      target.angle = fit.angle;
      target.offset = fit.offset;
    } else {
      clusters.push({ angle, offset: -mx * Math.sin(angle) + my * Math.cos(angle), pts, strength: len });
    }
  }
  return clusters
    .filter((c) => c.strength >= minStrength)
    .map((c): EdgeLine => {
      const dx = Math.cos(c.angle);
      const dy = Math.sin(c.angle);
      const ts = c.pts.map((p) => p.x * dx + p.y * dy);
      return { angle: c.angle, dx, dy, offset: c.offset, tMin: Math.min(...ts), tMax: Math.max(...ts), strength: c.strength };
    })
    .sort((a, b) => b.strength - a.strength);
}

function fitLine(pts: readonly Point[]): { angle: number; offset: number } {
  const mx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
  const my = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const angle = ((theta % Math.PI) + Math.PI) % Math.PI;
  return { angle, offset: -mx * Math.sin(angle) + my * Math.cos(angle) };
}

function intersect(a: EdgeLine, b: EdgeLine): Point | null {
  // Lines: -x sin(a) + y cos(a) = offset.
  const sa = Math.sin(a.angle), ca = Math.cos(a.angle);
  const sb = Math.sin(b.angle), cb = Math.cos(b.angle);
  const det = -sa * cb + ca * sb;
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (a.offset * cb - b.offset * ca) / det,
    y: (-sa * b.offset + sb * a.offset) / det,
  };
}

/** Two roughly parallel, well-separated, overlapping lines: candidate opposite sides. */
interface SidePair { a: EdgeLine; b: EdgeLine; angle: number }

function sidePairs(lines: readonly EdgeLine[], minSeparation: number): SidePair[] {
  const out: SidePair[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!, b = lines[j]!;
      if (angleDiff(a.angle, b.angle) > OPPOSITE_ANGLE_MAX) continue;
      // Mean direction (handle wrap-around by averaging unit vectors on the doubled angle).
      const angle = (Math.atan2(Math.sin(2 * a.angle) + Math.sin(2 * b.angle), Math.cos(2 * a.angle) + Math.cos(2 * b.angle)) / 2 + Math.PI) % Math.PI;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const nx = -dy, ny = dx;
      const mid = (l: EdgeLine) => {
        const t = (l.tMin + l.tMax) / 2;
        return { x: l.offset * -Math.sin(l.angle) + t * l.dx, y: l.offset * Math.cos(l.angle) + t * l.dy };
      };
      const ma = mid(a), mb = mid(b);
      if (Math.abs((ma.x - mb.x) * nx + (ma.y - mb.y) * ny) < minSeparation) continue;
      // They must face each other along the shared direction, not sit end to end.
      const span = (l: EdgeLine) => {
        const p1 = { x: l.offset * -Math.sin(l.angle) + l.tMin * l.dx, y: l.offset * Math.cos(l.angle) + l.tMin * l.dy };
        const p2 = { x: l.offset * -Math.sin(l.angle) + l.tMax * l.dx, y: l.offset * Math.cos(l.angle) + l.tMax * l.dy };
        const u1 = p1.x * dx + p1.y * dy, u2 = p2.x * dx + p2.y * dy;
        return [Math.min(u1, u2), Math.max(u1, u2)] as const;
      };
      const [a0, a1] = span(a), [b0, b1] = span(b);
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap < MIN_OVERLAP * Math.min(a1 - a0, b1 - b0)) continue;
      out.push({ a, b, angle });
    }
  }
  return out;
}

export interface LineQuadOptions {
  width: number;
  height: number;
  minAreaFraction: number;
  maxAreaFraction: number;
  /** 0..1 how well the outline follows real edges; used to rank and prune candidates. */
  support: (quad: Quad) => number;
  /** Candidates must reach this support. */
  minSupport: number;
  /** Accepted long/short side ratios; defaults to card-like proportions. */
  aspectRange?: readonly [number, number];
  /** How many of the best-supported quads to return (default 12). */
  maxQuads?: number;
}

/**
 * Build quadrilaterals directly from straight edges: pick two pairs of roughly parallel, mutually
 * perpendicular lines and intersect them. Unlike contour tracing this still finds a card whose
 * outline is broken (two-tone design, glare, fingers) as long as its four sides contain straight
 * edge segments. Candidates are ranked by `support` and the best few are returned; scoring and
 * selection happen with every other candidate in the detector.
 */
export function quadsFromLines(allLines: readonly EdgeLine[], o: LineQuadOptions): Quad[] {
  const lines = allLines.slice(0, MAX_LINES);
  const imageArea = o.width * o.height;
  const pairs = sidePairs(lines, MIN_SEPARATION_FRACTION * Math.min(o.width, o.height));
  const slackX = FRAME_SLACK * o.width, slackY = FRAME_SLACK * o.height;
  const found: { quad: Quad; support: number }[] = [];
  const aspect = o.aspectRange ?? CARD_ASPECT;

  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const P = pairs[i]!, Q = pairs[j]!;
      if (P.a === Q.a || P.a === Q.b || P.b === Q.a || P.b === Q.b) continue;
      const between = angleDiff(P.angle, Q.angle);
      if (between < PAIR_ANGLE_RANGE[0] || between > PAIR_ANGLE_RANGE[1]) continue;
      const pts = [intersect(P.a, Q.a), intersect(P.a, Q.b), intersect(P.b, Q.b), intersect(P.b, Q.a)];
      if (pts.some((p) => p === null)) continue;
      const poly = pts as Point[];
      if (poly.some((p) => p.x < -slackX || p.y < -slackY || p.x > o.width + slackX || p.y > o.height + slackY)) continue;
      if (!isConvex(poly)) continue;
      const area = polygonArea(poly);
      if (area < o.minAreaFraction * imageArea || area > o.maxAreaFraction * imageArea) continue;
      const clamped = poly.map((p) => ({ x: Math.min(o.width, Math.max(0, p.x)), y: Math.min(o.height, Math.max(0, p.y)) }));
      const quad = orderCorners(clamped) as Quad;
      const ratio = estimateAspectRatio(quad);
      if (ratio < aspect[0] || ratio > aspect[1]) continue;
      const support = o.support(quad);
      if (support >= o.minSupport) found.push({ quad, support });
    }
  }

  found.sort((x, y) => y.support - x.support);
  const kept: Quad[] = [];
  for (const f of found) {
    const dup = kept.some((k) => k.every((p, n) => Math.hypot(p.x - f.quad[n]!.x, p.y - f.quad[n]!.y) < 8));
    if (!dup) kept.push(f.quad);
    if (kept.length >= (o.maxQuads ?? MAX_QUADS)) break;
  }
  return kept;
}
