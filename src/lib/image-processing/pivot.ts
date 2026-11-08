import type { Gray } from "./boundary";
import { isPlausiblePage } from "./geometry";
import type { Point, Quad } from "../../types/repair";

/** Brightness difference (grey levels) across a line that counts as a faint edge at one sample. */
const STEP_LEVELS = 4;
/** The two sides of the line are compared this far from it. */
const PROBE_PX = 3;
const SAMPLE_SPACING_PX = 2;
/** Samples start this far from the pivot corner, past its clutter. */
const SKIP_PX = 10;
/** Pivots are tried up to this many degrees either way, in these steps. */
const MAX_TURN_DEG = 12;
const TURN_STEP_DEG = 0.5;
/** A side is left alone when at least this share of its samples already show a consistent step. */
const GOOD_SIDE_SHARE = 0.45;
/** A pivoted side must show a consistent step on at least this share of its samples ... */
const MIN_SHARE = 0.5;
/** ... and on this much more of them than the side it replaces. */
const MIN_GAIN = 0.2;
/** No corner may move further than this fraction of the outline's longer side. */
const MAX_CORNER_MOVE = 0.35;

interface Line {
  p: Point;
  d: Point;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

function sample(g: Gray, x: number, y: number): number | null {
  const xi = Math.round(x), yi = Math.round(y);
  return xi < 0 || yi < 0 || xi >= g.width || yi >= g.height ? null : g.data[yi * g.width + xi]!;
}

/**
 * Share of samples along `length` px of the ray from `p` in unit direction `d` where the brightness
 * steps across the ray. Either way: a page can be brighter than the table beside it and darker than
 * the sheet it lies on further along the same edge.
 */
function stepShare(g: Gray, p: Point, d: Point, length: number): number {
  const n = { x: -d.y, y: d.x };
  let tested = 0, stepped = 0;
  for (let t = SKIP_PX; t <= length; t += SAMPLE_SPACING_PX) {
    const x = p.x + d.x * t, y = p.y + d.y * t;
    const a = sample(g, x + n.x * PROBE_PX, y + n.y * PROBE_PX);
    const b = sample(g, x - n.x * PROBE_PX, y - n.y * PROBE_PX);
    if (a === null || b === null) break;
    tested++;
    if (Math.abs(a - b) >= STEP_LEVELS) stepped++;
  }
  return tested === 0 ? 0 : stepped / tested;
}

function intersect(a: Line, b: Line): Point | null {
  const det = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / det;
  return { x: a.p.x + t * a.d.x, y: a.p.y + t * a.d.y };
}

/**
 * Turn sides of a traced outline onto faint page edges. Where a page lies partly on another sheet
 * of paper, the traced region runs on over that sheet and its sides there follow nothing; the
 * page's own edge across the sheet is only a faint brightness step. A side with no consistent step
 * along it is turned about one of its corners (the end where the outline is still right) to the
 * angle with the most consistent step, if that is clearly better. The new corners are where the
 * turned sides meet. The result must be a plausible page inside the image, with no corner moved far.
 */
export function pivotSides(quad: Quad, g: Gray): Quad {
  const lines: Line[] = quad.map((a, i) => {
    const b = quad[(i + 1) % 4]!;
    return { p: a, d: { x: b.x - a.x, y: b.y - a.y } };
  });
  let changed = false;
  for (let side = 0; side < 4; side++) {
    const a = quad[side]!, b = quad[(side + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const current = stepShare(g, a, dir, len);
    if (current >= GOOD_SIDE_SHARE) continue;
    let best: { share: number; line: Line } | null = null;
    // Turn about either end: from a, along the side; from b, back along it.
    for (const [pivot, base] of [[a, dir], [b, { x: -dir.x, y: -dir.y }]] as const) {
      for (let deg = -MAX_TURN_DEG; deg <= MAX_TURN_DEG; deg += TURN_STEP_DEG) {
        if (deg === 0) continue;
        const c = Math.cos(toRad(deg)), s = Math.sin(toRad(deg));
        const d = { x: base.x * c - base.y * s, y: base.x * s + base.y * c };
        const share = stepShare(g, pivot, d, len);
        if (!best || share > best.share) best = { share, line: { p: pivot, d } };
      }
    }
    if (!best || best.share < MIN_SHARE || best.share < current + MIN_GAIN) continue;
    lines[side] = best.line;
    changed = true;
  }
  if (!changed) return quad;
  const corners: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const p = intersect(lines[(i + 3) % 4]!, lines[i]!);
    if (!p) return quad;
    corners.push(p);
  }
  const out: Quad = [corners[0]!, corners[1]!, corners[2]!, corners[3]!];
  const longest = Math.max(...quad.map((p, i) => Math.hypot(quad[(i + 1) % 4]!.x - p.x, quad[(i + 1) % 4]!.y - p.y)));
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= g.width - 1 && p.y <= g.height - 1;
  if (!isPlausiblePage(out) || !out.every(inside)) return quad;
  if (out.some((p, i) => Math.hypot(p.x - quad[i]!.x, p.y - quad[i]!.y) > MAX_CORNER_MOVE * longest)) return quad;
  return out;
}
