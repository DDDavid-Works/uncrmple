import type { Point } from "../../types/repair";
import type { Gray } from "./boundary";

/**
 * A long receipt photographed close up often fills the photo from top to bottom: its two long sides
 * are in the picture, its ends are not. Contour cues then find no closed shape, a shadow across the
 * paper splits a brightness threshold in two, and a gently curving side breaks into straight pieces
 * too short to keep. Here each side is found row by row as the strongest wide step between paper
 * and a darker surface, and a straight line is fitted through those steps while ignoring the rows
 * where something else (a thumb, a shadow edge) wins. The strip is closed at the photo's borders.
 */
export const STRIP = {
  /** Rows (or columns) sampled, every this many pixels. */
  sampleStep: 4,
  /** How far (px) on each side the step is measured: wider than a stroke of print. */
  probe: [3, 12] as const,
  /** Minimum brightness difference between the dark side and the paper side (steps are ranked by ratio). */
  minStep: 30,
  /** A fitted side keeps the rows within this distance (px) of it. */
  inlierPx: 5,
  /** Each side must be found in at least this share of the sampled rows. */
  minInlierShare: 0.5,
  /** Together the two sides must reach within this share of the photo's two ends. */
  endReach: 0.1,
  /** The strip must be at least this share of the photo wide, and narrower than this. */
  minWidthShare: 0.15,
  maxWidthShare: 0.9,
  /** The two sides may differ in slope (dx per dy) by at most this much (about 8 degrees). */
  maxSlopeDiff: 0.14,
} as const;

/** Added to both sides of a brightness ratio, so near-black noise does not make huge ratios. */
const RATIO_FLOOR = 10;
/** At the photo's ends, paper must be at least this many times as bright as the surface beside it. */
const END_RATIO = 1.5;

interface Line { a: number; b: number } // x = a + b * y

/** The outline of a paper strip running across the whole photo, in either direction, or none. */
export function stripOutlines(g: Gray): Point[][] {
  const out: Point[][] = [];
  const vertical = stripAlong(g);
  if (vertical) out.push(vertical);
  const across = stripAlong(transpose(g));
  if (across) out.push(across.map((p) => ({ x: p.y, y: p.x })));
  return out;
}

/** A strip running from top to bottom: its corners clockwise from top left, or null. */
function stripAlong(g: Gray): Point[] | null {
  const { width, height, data } = g;
  const [near, far] = STRIP.probe;
  const span = far - near + 1;
  // Running sums along the row, so each probe mean is two lookups.
  const sums = new Float64Array(width + 1);
  const left: Point[] = [], right: Point[] = [];
  let rows = 0;
  for (let y = 0; y < height; y += STRIP.sampleStep) {
    rows++;
    for (let x = 0; x < width; x++) sums[x + 1] = sums[x]! + data[y * width + x]!;
    // Steps are ranked by brightness ratio, not difference: a shadow across the paper dims both
    // sides by the same factor (about 2), while paper against a dark surface differs by far more,
    // in the shade as in the light.
    let bestRise = 0, riseX = -1, bestFall = 0, fallX = -1;
    for (let x = far; x < width - far; x++) {
      const before = (sums[x - near + 1]! - sums[x - far]!) / span;
      const after = (sums[x + far + 1]! - sums[x + near]!) / span;
      const ratio = (after + RATIO_FLOOR) / (before + RATIO_FLOOR);
      if (after - before >= STRIP.minStep && ratio > bestRise) { bestRise = ratio; riseX = x; }
      if (before - after >= STRIP.minStep && 1 / ratio > bestFall) { bestFall = 1 / ratio; fallX = x; }
    }
    if (riseX >= 0) left.push({ x: riseX, y });
    if (fallX >= 0) right.push({ x: fallX, y });
  }
  const l = robustFit(left, rows), r = robustFit(right, rows);
  if (!l || !r) return null;
  // The sides between them must reach both ends of the photo: the strip runs off the frame.
  const reach = STRIP.endReach * height;
  const top = Math.min(l.from, r.from), bottom = Math.max(l.to, r.to);
  if (top > reach || bottom < height - 1 - reach) return null;
  if (Math.abs(l.line.b - r.line.b) > STRIP.maxSlopeDiff) return null;
  const at = (s: Line, y: number) => s.a + s.b * y;
  const ends = [0, height];
  for (const y of ends) {
    const w = at(r.line, y) - at(l.line, y);
    if (w < STRIP.minWidthShare * width || w > STRIP.maxWidthShare * width) return null;
  }
  // At both ends of the photo the band between the sides must still be paper, brighter than the
  // surface beside it: a sheet lying inside the photo has the surface there instead.
  const rowMean = (y: number, x0: number, x1: number) => {
    const a = Math.max(0, Math.round(x0)), b = Math.min(width - 1, Math.round(x1));
    if (b < a) return null;
    let s = 0;
    for (let x = a; x <= b; x++) s += data[y * width + x]!;
    return s / (b - a + 1);
  };
  const paperAtEnd = (rowsAt: number[]) => {
    const ok = rowsAt.filter((y) => {
      const xl = at(l.line, y), xr = at(r.line, y);
      const inside = rowMean(y, xl + far, xr - far);
      const outsides = [rowMean(y, xl - 3 * far, xl - far), rowMean(y, xr + far, xr + 3 * far)].filter((v): v is number => v !== null);
      return inside !== null && outsides.some((o) => inside - o >= STRIP.minStep && (inside + RATIO_FLOOR) / (o + RATIO_FLOOR) >= END_RATIO);
    });
    return ok.length >= rowsAt.length / 2;
  };
  const band = Math.max(1, Math.round(STRIP.endReach * height / 2));
  const rowsNear = (from: number) => Array.from({ length: 5 }, (_, i) => Math.min(height - 1, Math.max(0, Math.round(from + (i * band) / 4))));
  if (!paperAtEnd(rowsNear(0)) || !paperAtEnd(rowsNear(height - 1 - band))) return null;
  const clamp = (x: number) => Math.min(width, Math.max(0, x));
  return [
    { x: clamp(at(l.line, 0)), y: 0 },
    { x: clamp(at(r.line, 0)), y: 0 },
    { x: clamp(at(r.line, height)), y: height },
    { x: clamp(at(l.line, height)), y: height },
  ];
}

/**
 * The line x = a + bÂ·y through most of the points: every pair proposes a line, the one with the
 * most points within STRIP.inlierPx wins, and it is refitted to those points by least squares.
 * Null when it holds less than STRIP.minInlierShare of the sampled rows.
 */
function robustFit(points: readonly Point[], rows: number): { line: Line; from: number; to: number } | null {
  if (points.length < 2) return null;
  // A fixed subsample keeps the pair search small and the result deterministic.
  const stride = Math.max(1, Math.floor(points.length / 40));
  const sample = points.filter((_, i) => i % stride === 0);
  let bestCount = 0, bestA = 0, bestB = 0;
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const p = sample[i]!, q = sample[j]!;
      if (q.y === p.y) continue;
      const b = (q.x - p.x) / (q.y - p.y), a = p.x - b * p.y;
      let count = 0;
      for (const s of points) if (Math.abs(a + b * s.y - s.x) <= STRIP.inlierPx) count++;
      if (count > bestCount) [bestCount, bestA, bestB] = [count, a, b];
    }
  }
  const best = points.filter((s) => Math.abs(bestA + bestB * s.y - s.x) <= STRIP.inlierPx);
  if (best.length < STRIP.minInlierShare * rows) return null;
  const n = best.length;
  const my = best.reduce((s, p) => s + p.y, 0) / n, mx = best.reduce((s, p) => s + p.x, 0) / n;
  let syy = 0, sxy = 0;
  for (const p of best) {
    syy += (p.y - my) ** 2;
    sxy += (p.y - my) * (p.x - mx);
  }
  const b = syy === 0 ? 0 : sxy / syy;
  return { line: { a: mx - b * my, b }, from: Math.min(...best.map((p) => p.y)), to: Math.max(...best.map((p) => p.y)) };
}

function transpose(g: Gray): Gray {
  const { width, height, data } = g;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[x * height + y] = data[y * width + x]!;
  return { width: height, height: width, data: out };
}
