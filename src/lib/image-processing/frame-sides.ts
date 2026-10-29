import type { EdgeLine } from "./card-lines";
import { isPlausiblePage } from "./geometry";
import type { Point, Quad } from "../../types/repair";

/**
 * A side within this fraction of the photo's extent from a border is taken as lying on the frame:
 * the detector treated the page as running off the photo there.
 */
const FRAME_BAND = 0.045;
/** Replacement lines run within this many degrees of the side. */
const MAX_ANGLE_DEG = 5;
/** The line must run alongside at least this share of the side. */
const MIN_SPAN = 0.6;
/** Strip samples start this far outside the line (past its own edge pixels) and stop this far from the border. */
const LINE_MARGIN_PX = 3;
const BORDER_MARGIN_PX = 2;
/** The line must leave at least this much strip to test. */
const MIN_STRIP_PX = 4;
/** Share of strip rows (one per sample along the line) that must hold no edge pixel at all. */
const MIN_BLANK_ROWS = 0.85;
const SAMPLE_SPACING_PX = 2;

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

type Border = "left" | "right" | "top" | "bottom";

/** Distance of `p` from a border, and the unit direction pointing out through it. */
function fromBorder(border: Border, p: Point, width: number, height: number): number {
  switch (border) {
    case "left": return p.x;
    case "right": return width - p.x;
    case "top": return p.y;
    case "bottom": return height - p.y;
  }
}
const OUTWARD: Record<Border, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/** The border a side lies along, if both of its ends are within the frame band of it. */
function frameBorder(a: Point, b: Point, width: number, height: number): Border | null {
  for (const border of ["left", "right", "top", "bottom"] as const) {
    const band = FRAME_BAND * (border === "left" || border === "right" ? width : height);
    if (fromBorder(border, a, width, height) <= band && fromBorder(border, b, width, height) <= band) return border;
  }
  return null;
}

/**
 * Whether only blank background lies between `line` and the border: one row of samples per step
 * along the line, walking out through the border, and nearly every row free of edge pixels. A
 * printed border or ruled line has page margin and, beyond it, the page's own edge on its outside,
 * so it fails; so does a line with any print, texture or object between it and the frame.
 */
function blankOutside(line: EdgeLine, border: Border, edges: Uint8Array, width: number, height: number): boolean {
  const out = OUTWARD[border];
  let rows = 0, blank = 0;
  for (let t = line.tMin; t <= line.tMax; t += SAMPLE_SPACING_PX) {
    const p = at(line, t);
    const depth = fromBorder(border, p, width, height) - BORDER_MARGIN_PX;
    if (depth - LINE_MARGIN_PX < MIN_STRIP_PX) return false;
    rows++;
    let clear = true;
    for (let o = LINE_MARGIN_PX; o <= depth; o++) {
      const x = Math.round(p.x + out.x * o), y = Math.round(p.y + out.y * o);
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      if (edges[y * width + x]) {
        clear = false;
        break;
      }
    }
    if (clear) blank++;
  }
  return rows > 0 && blank / rows >= MIN_BLANK_ROWS;
}

/**
 * Move sides that the detector put on the photo's frame in to the page's real edge when that edge
 * is a faint straight line just inside the frame, such as a white page on a pale wall: too little
 * brightness change across it to count as a boundary on its own, but nothing outside it except
 * blank background. Only frame sides move, so a page found by its own edges is never changed and a
 * line printed on the page (which has page margin outside it) is never taken for the edge.
 * `lines` are straight lines from a sensitive edge map, `edges` that map (non-zero: edge pixel).
 */
export function snapFrameSides(quad: Quad, lines: readonly EdgeLine[], edges: Uint8Array, width: number, height: number): Quad {
  let result = quad;
  for (let s = 0; s < 4; s++) {
    const a = result[s]!, b = result[(s + 1) % 4]!;
    const border = frameBorder(a, b, width, height);
    if (!border) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = ((Math.atan2(b.y - a.y, b.x - a.x) % Math.PI) + Math.PI) % Math.PI;
    const band = FRAME_BAND * (border === "left" || border === "right" ? width : height);
    const candidates = lines
      .filter((l) => angleDiff(l.angle, angle) <= toRad(MAX_ANGLE_DEG) && l.tMax - l.tMin >= MIN_SPAN * len)
      .map((l) => ({ l, depth: Math.max(fromBorder(border, at(l, l.tMin), width, height), fromBorder(border, at(l, l.tMax), width, height)) }))
      .filter((c) => c.depth <= band + LINE_MARGIN_PX)
      // Outermost first: an inner line has the outer one in its strip and fails anyway.
      .sort((x, y) => x.depth - y.depth);
    const found = candidates.find((c) => blankOutside(c.l, border, edges, width, height));
    if (!found) continue;

    const prev = result[(s + 3) % 4]!, next = result[(s + 2) % 4]!;
    const p0 = at(found.l, found.l.tMin), dir = { x: found.l.dx, y: found.l.dy };
    const start = intersect(p0, dir, prev, { x: a.x - prev.x, y: a.y - prev.y });
    const end = intersect(p0, dir, next, { x: b.x - next.x, y: b.y - next.y });
    if (!start || !end) continue;
    const inside = (p: Point) => p.x >= -1 && p.y >= -1 && p.x <= width + 1 && p.y <= height + 1;
    if (!inside(start) || !inside(end)) continue;
    const moved = [...result] as Point[];
    moved[s] = start;
    moved[(s + 1) % 4] = end;
    if (isPlausiblePage(moved)) result = moved as unknown as Quad;
  }
  return result;
}
