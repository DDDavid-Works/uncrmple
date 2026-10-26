import { isConvex, polygonArea } from "./geometry";
import type { Point, Quad } from "../../types/repair";

/** A side is moved inward at most this fraction of the page's shorter side. */
const MAX_TRIM_FRACTION = 0.12;
/** A strip counts as paper when at least this share of its samples is paper. */
const PAPER_SHARE = 0.8;
/** Samples run along the middle of each side, away from the corners. */
const SIDE_START = 0.1;
const SIDE_END = 0.9;
/** The strip just outside a side must be mostly non-paper for there to be a boundary to trim to. */
const OUTSIDE_OFFSET_PX = 3;
const OUTSIDE_BACKGROUND_SHARE = 0.6;
/** A side within this many pixels of the paper boundary is left alone (mask edges are not pixel-exact). */
const EDGE_TOLERANCE_PX = 2;
/** A trimmed page must keep at least this much of the original area, else the trim is discarded. */
const MIN_KEPT_AREA = 0.75;

type Line = { p: Point; d: Point };

function intersect(l1: Line, l2: Line): Point | null {
  const det = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / det;
  return { x: l1.p.x + t * l1.d.x, y: l1.p.y + t * l1.d.y };
}

/**
 * Pull the sides of a page quad inward when a strip of background (e.g. cloth peeking past a
 * curved or crumpled edge) lies inside them. `paper` is a width×height mask (non-zero = paper).
 *
 * Each side moves only as far as needed for the strip along it to be mostly paper, and only when
 * the region just outside it is mostly background, so a mask that cannot tell paper from background
 * (white page on a white table) leaves the quad untouched. Returns the input quad if the result is
 * degenerate or discards too much of the page.
 */
export function trimBackground(quad: Quad, paper: Uint8Array, width: number, height: number): Quad {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const side = (i: number) => ({ a: quad[i]!, b: quad[(i + 1) % 4]! });
  const lengths = [0, 1, 2, 3].map((i) => Math.hypot(side(i).b.x - side(i).a.x, side(i).b.y - side(i).a.y));
  const maxTrim = MAX_TRIM_FRACTION * Math.min(...lengths);

  /** Share of samples along side `i`, shifted by `offset` px (inward positive), that are paper. */
  const share = (i: number, offset: number): number | null => {
    const { a, b } = side(i);
    const len = lengths[i]!;
    if (len < 1) return null;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const steps = Math.max(4, Math.round(len / 4));
    let tested = 0;
    let hits = 0;
    for (let s = 0; s <= steps; s++) {
      const t = SIDE_START + ((SIDE_END - SIDE_START) * s) / steps;
      const x = Math.round(a.x + (b.x - a.x) * t + nx * offset);
      const y = Math.round(a.y + (b.y - a.y) * t + ny * offset);
      if (x < 0 || y < 0 || x >= width || y >= height) continue; // cut-off page: no evidence either way
      tested++;
      if (paper[y * width + x]) hits++;
    }
    return tested === 0 ? null : hits / tested;
  };

  const inward = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const here = share(i, EDGE_TOLERANCE_PX);
    const outside = share(i, -OUTSIDE_OFFSET_PX);
    if (here === null || here >= PAPER_SHARE) continue;
    if (outside === null || outside > 1 - OUTSIDE_BACKGROUND_SHARE) continue;
    for (let d = EDGE_TOLERANCE_PX + 1; d <= maxTrim; d++) {
      const s = share(i, d);
      if (s === null) break;
      if (s >= PAPER_SHARE) {
        inward[i] = d;
        break;
      }
    }
  }
  if (inward.every((d) => d === 0)) return quad;

  const lines: Line[] = [0, 1, 2, 3].map((i) => {
    const { a, b } = side(i);
    const len = lengths[i]!;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { p: { x: a.x + nx * inward[i]!, y: a.y + ny * inward[i]! }, d: { x: b.x - a.x, y: b.y - a.y } };
  });
  // Corner k joins side k-1 and side k.
  const corners = [0, 1, 2, 3].map((k) => intersect(lines[(k + 3) % 4]!, lines[k]!));
  if (corners.some((c) => c === null)) return quad;
  const result = corners as Point[];
  const inside = result.every((p) => p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height);
  if (!inside || !isConvex(result) || polygonArea(result) < MIN_KEPT_AREA * polygonArea(quad)) return quad;
  return [result[0]!, result[1]!, result[2]!, result[3]!];
}
