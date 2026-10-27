import type { EdgeLine } from "./card-lines";
import type { Point } from "../../types/repair";

/**
 * Brightness difference (grey levels) across a line that counts as the edge of a surface. A page
 * against a table, a shadow or another sheet changes brightness from one side to the other; a
 * printed rule or table border has the same paper on both sides and scores near zero.
 */
export const BOUNDARY_STEP = 8;
/** Probe distances (px) on each side of the line: past the line's own ink, close enough to stay local. */
const PROBE_OFFSETS = [4, 5, 6];
/** Samples run along the middle of each side, away from the corners. */
const SIDE_START = 0.1;
const SIDE_END = 0.9;
const SAMPLE_SPACING_PX = 2;

/** Grey image: one byte per pixel, row-major. */
export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Mean brightness at the probe offsets along +normal minus that along -normal, or null if any
 * probe falls outside the image.
 */
function step(g: Gray, x: number, y: number, nx: number, ny: number): number | null {
  let sum = 0;
  for (const o of PROBE_OFFSETS) {
    const ax = Math.round(x + nx * o), ay = Math.round(y + ny * o);
    const bx = Math.round(x - nx * o), by = Math.round(y - ny * o);
    if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= g.width || bx >= g.width || ay >= g.height || by >= g.height) return null;
    sum += g.data[ay * g.width + ax]! - g.data[by * g.width + bx]!;
  }
  return sum / PROBE_OFFSETS.length;
}

/**
 * Brightness step across a straight line: the magnitude of the median signed step along its
 * extent. The median ignores text and marks touching the line, and a signed median cancels where
 * the step flips direction (lines of text), so only a consistent change of surface scores high.
 */
export function lineStep(g: Gray, line: EdgeLine): number {
  const nx = -Math.sin(line.angle), ny = Math.cos(line.angle);
  const ox = line.offset * nx, oy = line.offset * ny;
  const steps: number[] = [];
  for (let t = line.tMin; t <= line.tMax; t += SAMPLE_SPACING_PX) {
    const s = step(g, ox + t * line.dx, oy + t * line.dy, nx, ny);
    if (s !== null) steps.push(s);
  }
  if (steps.length === 0) return 0;
  steps.sort((a, b) => a - b);
  return Math.abs(steps[Math.floor(steps.length / 2)]!);
}

/**
 * How much of a quad's outline separates two different surfaces (0..1): per side, the share of
 * samples with at least BOUNDARY_STEP of brightness change across it, averaged over the four sides.
 * Samples whose probes leave the photo are skipped, and a side with none (a page cut off by the
 * frame) scores a neutral 0.5, matching edgeSupport.
 */
export function boundaryContrast(quad: readonly Point[], g: Gray): number {
  let total = 0;
  for (let s = 0; s < 4; s++) {
    const a = quad[s]!;
    const b = quad[(s + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const count = Math.max(4, Math.round((len * (SIDE_END - SIDE_START)) / SAMPLE_SPACING_PX));
    let tested = 0, hits = 0;
    for (let i = 0; i <= count; i++) {
      const t = SIDE_START + ((SIDE_END - SIDE_START) * i) / count;
      const v = step(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, nx, ny);
      if (v === null) continue;
      tested++;
      if (Math.abs(v) >= BOUNDARY_STEP) hits++;
    }
    total += tested === 0 ? 0.5 : hits / tested;
  }
  return total / 4;
}
