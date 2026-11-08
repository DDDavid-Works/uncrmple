import type { Gray } from "./boundary";
import type { EdgeLine } from "./card-lines";
import { isPlausiblePage } from "./geometry";
import type { Point, Quad, RasterImage } from "../../types/repair";

/**
 * Replacement lines must run within this many degrees of the side they replace. Print is often
 * skewed against the paper it is on (receipts, slips torn from a pad), so the line the detector
 * stopped at and the real edge need not be parallel; the strip test and the page-shape check guard
 * against unrelated lines.
 */
const MAX_ANGLE_DEG = 10;
/** Neither end of a moved side may come inside the old side by more than this. */
const MAX_INWARD_PX = 2;
/** A side moves at least this far (smaller moves are the same edge) ... */
const MIN_MOVE_PX = 6;
/**
 * ... and at most this fraction of the page's extent across it: a side stopped at the divider of a
 * two-column form can double the page, but not more.
 */
const MAX_MOVE_FRACTION = 1;
/**
 * The replacement line must run alongside at least this share of the side. Low on purpose: a
 * curled or bent page edge is straight only in short runs; the strip test is what guards the move.
 */
const MIN_OVERLAP = 0.1;
/** Paper level: this percentile of brightness inside the page. */
const PAPER_PERCENTILE = 0.9;
/** A strip pixel is paper-bright at this fraction of the paper level, and ink below this one. */
const BRIGHT_FRACTION = 0.75;
const INK_FRACTION = 0.6;
/** The strip added to the page must be mostly paper-bright and contain at least some print. */
const MIN_BRIGHT_SHARE = 0.75;
const MIN_INK_SHARE = 0.01;
/**
 * With a colour image given, the paper-bright part of the strip must also have the page's paper
 * colour: a pale packet, a white table or a sheet of another colour lying beside the page can be as
 * bright as its paper in grey. A sample matches within this many levels per channel ...
 */
const MAX_COLOUR_DIFF = 30;
/**
 * ... and this share of the paper-bright samples must match. Per sample rather than on average, so
 * a wedge of white table beside a pink page cannot hide in a strip that is mostly the page's paper.
 */
const MIN_COLOUR_MATCH = 0.9;
/** Strip samples keep clear of both lines and of the corners. */
const LINE_MARGIN_PX = 3;
const SIDE_START = 0.1;
const SIDE_END = 0.9;
const SAMPLE_SPACING_PX = 3;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
};

/** Point of `line` at parameter t (see EdgeLine). */
const at = (line: EdgeLine, t: number): Point => ({
  x: -line.offset * Math.sin(line.angle) + t * line.dx,
  y: line.offset * Math.cos(line.angle) + t * line.dy,
});

function intersect(a: Point, da: Point, b: Point, db: Point): Point | null {
  const det = da.x * db.y - da.y * db.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / det;
  return { x: a.x + t * da.x, y: a.y + t * da.y };
}

function percentile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
}

/** Brightness at `p`, or null outside the image. */
function sample(g: Gray, p: Point): number | null {
  const x = Math.round(p.x), y = Math.round(p.y);
  return x < 0 || y < 0 || x >= g.width || y >= g.height ? null : g.data[y * g.width + x]!;
}

/**
 * Move sides of a page built from straight lines outward when they stopped at a line printed on
 * the page (a coloured header band, a fold, a box border) rather than at its edge.
 *
 * For each side, the candidates are boundary lines roughly parallel to it, further out by up to the
 * page's own extent across that side (one column of a two-column form found as the page). A side moves to the farthest candidate such that the strip it adds looks like
 * page content: mostly as bright as the page's paper and holding some print. A strip of dark
 * background fails the first test and a strip of blank table or another sheet's margin fails the
 * second, so a side already on the page edge stays. The result must still be a plausible page
 * inside the image; otherwise that side is left alone.
 */
export function extendSides(quad: Quad, lines: readonly EdgeLine[], g: Gray, colour?: RasterImage): Quad {
  const paper = paperLevel(quad, g);
  if (paper === null) return quad;
  const tint = colour ? paperColour(quad, g, colour, paper) : null;
  let current = quad;
  for (let side = 0; side < 4; side++) {
    const a = current[side]!, b = current[(side + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    // Outward normal: away from the centre.
    const cx = (current[0].x + current[1].x + current[2].x + current[3].x) / 4;
    const cy = (current[0].y + current[1].y + current[2].y + current[3].y) / 4;
    let n = { x: -dir.y, y: dir.x };
    if (n.x * (cx - a.x) + n.y * (cy - a.y) > 0) n = { x: -n.x, y: -n.y };
    const prev = current[(side + 3) % 4]!, next = current[(side + 2) % 4]!;
    const across = (Math.abs((a.x - prev.x) * n.x + (a.y - prev.y) * n.y) + Math.abs((b.x - next.x) * n.x + (b.y - next.y) * n.y)) / 2;
    const sideAngle = ((Math.atan2(dir.y, dir.x) % Math.PI) + Math.PI) % Math.PI;

    let best: { quad: Quad; move: number } | null = null;
    for (const line of lines) {
      if (angleDiff(line.angle, sideAngle) > toRad(MAX_ANGLE_DEG)) continue;
      const mid = at(line, (line.tMin + line.tMax) / 2);
      const move = (mid.x - a.x) * n.x + (mid.y - a.y) * n.y;
      if (move < MIN_MOVE_PX || move > MAX_MOVE_FRACTION * across) continue;
      if (overlap(line, a, dir, len) < MIN_OVERLAP) continue;
      if (best && move <= best.move) continue;
      const moved = replaceSide(current, side, mid, { x: line.dx, y: line.dy });
      if (!moved || !isPlausiblePage(moved) || moved.some((p) => sample(g, p) === null)) continue;
      // A tilted line can cross the old side; then part of the page would be cut off, not added.
      const outward = (p: Point) => (p.x - a.x) * n.x + (p.y - a.y) * n.y;
      if (outward(moved[side]!) < -MAX_INWARD_PX || outward(moved[(side + 1) % 4]!) < -MAX_INWARD_PX) continue;
      if (!looksLikePage(g, current, moved, side, paper, colour && tint ? { image: colour, tint } : undefined)) continue;
      best = { quad: moved, move };
    }
    if (best) current = best.quad;
  }
  return current;
}

/** Walking out from a side, the paper has ended after more than this many px in a row that are not paper (print is thinner). */
const WALK_GAP_PX = 8;
/** Walk starts this far apart along the side. */
const WALK_SPACING_PX = 3;
/** A walk's end point counts toward the fitted edge within this distance of it ... */
const FIT_TOLERANCE_PX = 4;
/** ... and this share of the walks must end on it: a torn edge is ragged, a strip of background is not lined up at all. */
const MIN_FIT_SHARE = 0.6;

/**
 * Move sides of a page out to where its paper's colour ends, for an edge with no straight line on
 * it to move to (a torn or ragged edge). From points along each side, walk outward over pixels of
 * the paper's colour, stepping over thin print, and fit a line to where the walks end. The side
 * moves only when most walks end on that line, the line is near parallel to the side and the strip
 * it adds looks like the page (see looksLikePage). Paper the same colour as what lies beside it
 * gives walks that end all over the place, and the side stays.
 */
export function growToPaperColour(quad: Quad, g: Gray, image: RasterImage): Quad {
  const paper = paperLevel(quad, g);
  if (paper === null) return quad;
  const tint = paperColour(quad, g, image, paper);
  if (!tint) return quad;
  const isPaper = (p: Point) => {
    const v = sample(g, p);
    return v !== null && v >= BRIGHT_FRACTION * paper && matchesTint(image, p, tint);
  };
  let current = quad;
  for (let side = 0; side < 4; side++) {
    const a = current[side]!, b = current[(side + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const cx = (current[0].x + current[1].x + current[2].x + current[3].x) / 4;
    const cy = (current[0].y + current[1].y + current[2].y + current[3].y) / 4;
    let n = { x: -dir.y, y: dir.x };
    if (n.x * (cx - a.x) + n.y * (cy - a.y) > 0) n = { x: -n.x, y: -n.y };
    const prev = current[(side + 3) % 4]!, next = current[(side + 2) % 4]!;
    const across = (Math.abs((a.x - prev.x) * n.x + (a.y - prev.y) * n.y) + Math.abs((b.x - next.x) * n.x + (b.y - next.y) * n.y)) / 2;
    const maxWalk = MAX_MOVE_FRACTION * across;

    // Where each walk ends: u along the side, d out from it. A walk that reaches the photo's frame
    // or the move limit on paper colour found no end (paper on a table of its own colour) and adds
    // no point, but still counts against the share of walks on the fitted edge.
    const ends: { u: number; d: number }[] = [];
    let walks = 0;
    for (let u = SIDE_START * len; u <= SIDE_END * len; u += WALK_SPACING_PX) {
      walks++;
      const start = { x: a.x + dir.x * u, y: a.y + dir.y * u };
      let last = 0;
      for (let d = 1; d <= maxWalk; d++) {
        if (d - last - 1 > WALK_GAP_PX) {
          ends.push({ u, d: last });
          break;
        }
        const p = { x: start.x + n.x * d, y: start.y + n.y * d };
        if (sample(g, p) === null) break;
        if (isPaper(p)) last = d;
      }
    }
    const fit = fitEdge(ends, walks);
    if (!fit || fit.share < MIN_FIT_SHARE || Math.abs(Math.atan(fit.slope)) > toRad(MAX_ANGLE_DEG)) continue;
    const d0 = fit.at(0), d1 = fit.at(len);
    if (Math.min(d0, d1) < -MAX_INWARD_PX || (d0 + d1) / 2 < MIN_MOVE_PX) continue;
    const p = { x: a.x + n.x * d0, y: a.y + n.y * d0 };
    const q = { x: b.x + n.x * d1, y: b.y + n.y * d1 };
    const moved = replaceSide(current, side, p, { x: q.x - p.x, y: q.y - p.y });
    if (!moved || !isPlausiblePage(moved) || moved.some((m) => sample(g, m) === null)) continue;
    if (!looksLikePage(g, current, moved, side, paper, { image, tint })) continue;
    current = moved;
  }
  return current;
}

/**
 * A line d = intercept + slope·u through the walk ends, refitted on the ends near it; with the share
 * of all `walks` that ended within FIT_TOLERANCE_PX of the final line.
 */
function fitEdge(ends: { u: number; d: number }[], walks: number): { slope: number; at: (u: number) => number; share: number } | null {
  if (ends.length < 4) return null;
  let inliers = ends;
  let slope = 0, intercept = 0;
  for (let round = 0; round < 4; round++) {
    if (inliers.length < 2) return null;
    // Least squares on the current inliers; the first round starts from the median, so a few walks
    // stopped early by a blot or let through by a matching patch do not drag the line.
    if (round === 0) {
      slope = 0;
      intercept = percentile(ends.map((e) => e.d), 0.5);
    } else {
      const m = inliers.length;
      const mu = inliers.reduce((s, e) => s + e.u, 0) / m, md = inliers.reduce((s, e) => s + e.d, 0) / m;
      const suu = inliers.reduce((s, e) => s + (e.u - mu) ** 2, 0);
      slope = suu > 0 ? inliers.reduce((s, e) => s + (e.u - mu) * (e.d - md), 0) / suu : 0;
      intercept = md - slope * mu;
    }
    const tol = round === 0 ? 3 * FIT_TOLERANCE_PX : FIT_TOLERANCE_PX;
    inliers = ends.filter((e) => Math.abs(e.d - (intercept + slope * e.u)) <= tol);
  }
  return { slope, at: (u) => intercept + slope * u, share: inliers.length / walks };
}

/** Share of side a→a+dir·len that the line runs alongside. */
function overlap(line: EdgeLine, a: Point, dir: Point, len: number): number {
  const u0 = (at(line, line.tMin).x - a.x) * dir.x + (at(line, line.tMin).y - a.y) * dir.y;
  const u1 = (at(line, line.tMax).x - a.x) * dir.x + (at(line, line.tMax).y - a.y) * dir.y;
  return Math.max(0, Math.min(len, Math.max(u0, u1)) - Math.max(0, Math.min(u0, u1))) / len;
}

/** The quad with side `side` moved onto the line through `p` along `d`. */
function replaceSide(quad: Quad, side: number, p: Point, d: Point): Quad | null {
  const lineOf = (i: number) => {
    const s = quad[i]!, e = quad[(i + 1) % 4]!;
    return { p: s, d: { x: e.x - s.x, y: e.y - s.y } };
  };
  const before = lineOf((side + 3) % 4), after = lineOf((side + 1) % 4);
  const start = intersect(before.p, before.d, p, d);
  const end = intersect(p, d, after.p, after.d);
  if (!start || !end) return null;
  const out = [...quad] as Point[];
  out[side] = start;
  out[(side + 1) % 4] = end;
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}

/** Brightness of the page's paper: a high percentile over a grid of samples inside the quad. */
function paperLevel(quad: Quad, g: Gray): number | null {
  const values: number[] = [];
  const [tl, tr, br, bl] = quad;
  for (let i = 1; i < 20; i++) {
    for (let j = 1; j < 20; j++) {
      const u = i / 20, v = j / 20;
      const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
      const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
      const s = sample(g, { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v });
      if (s !== null) values.push(s);
    }
  }
  return values.length === 0 ? null : percentile(values, PAPER_PERCENTILE);
}

type Rgb = [number, number, number];

/** Mean colour of the paper-bright samples on a grid inside the quad. */
function paperColour(quad: Quad, g: Gray, image: RasterImage, paper: number): Rgb | null {
  const sum: Rgb = [0, 0, 0];
  let n = 0;
  const [tl, tr, br, bl] = quad;
  for (let i = 1; i < 20; i++) {
    for (let j = 1; j < 20; j++) {
      const u = i / 20, v = j / 20;
      const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
      const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
      const p = { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
      const s = sample(g, p);
      if (s === null || s < BRIGHT_FRACTION * paper) continue;
      addRgb(sum, image, p);
      n++;
    }
  }
  return n === 0 ? null : [sum[0] / n, sum[1] / n, sum[2] / n];
}

function addRgb(sum: Rgb, image: RasterImage, p: Point) {
  const i = (Math.round(p.y) * image.width + Math.round(p.x)) * 4;
  sum[0] += image.data[i]!;
  sum[1] += image.data[i + 1]!;
  sum[2] += image.data[i + 2]!;
}

/**
 * Whether the strip between side `side` of `from` and of `to` is mostly paper with some print on
 * it, and, given `colour`, whether that paper has the page's colour.
 */
function looksLikePage(
  g: Gray, from: Quad, to: Quad, side: number, paper: number, colour?: { image: RasterImage; tint: Rgb },
): boolean {
  const a0 = from[side]!, b0 = from[(side + 1) % 4]!;
  const a1 = to[side]!, b1 = to[(side + 1) % 4]!;
  const len = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const along = Math.max(4, Math.round((len * (SIDE_END - SIDE_START)) / SAMPLE_SPACING_PX));
  let tested = 0, bright = 0, ink = 0, matching = 0;
  for (let i = 0; i <= along; i++) {
    const t = SIDE_START + ((SIDE_END - SIDE_START) * i) / along;
    const p0 = { x: a0.x + (b0.x - a0.x) * t, y: a0.y + (b0.y - a0.y) * t };
    const p1 = { x: a1.x + (b1.x - a1.x) * t, y: a1.y + (b1.y - a1.y) * t };
    const depth = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    for (let d = LINE_MARGIN_PX; d <= depth - LINE_MARGIN_PX; d += SAMPLE_SPACING_PX) {
      const p = { x: p0.x + ((p1.x - p0.x) * d) / depth, y: p0.y + ((p1.y - p0.y) * d) / depth };
      const v = sample(g, p);
      if (v === null) continue;
      tested++;
      if (v >= BRIGHT_FRACTION * paper) {
        bright++;
        if (colour && matchesTint(colour.image, p, colour.tint)) matching++;
      }
      if (v < INK_FRACTION * paper) ink++;
    }
  }
  if (tested === 0 || bright / tested < MIN_BRIGHT_SHARE || ink / tested < MIN_INK_SHARE) return false;
  return !colour || matching / bright >= MIN_COLOUR_MATCH;
}

/** Whether the pixel at `p` is within MAX_COLOUR_DIFF of `tint` on every channel. */
function matchesTint(image: RasterImage, p: Point, tint: Rgb): boolean {
  const pixel: Rgb = [0, 0, 0];
  addRgb(pixel, image, p);
  return pixel.every((c, k) => Math.abs(c - tint[k]!) <= MAX_COLOUR_DIFF);
}
