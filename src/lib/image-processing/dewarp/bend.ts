import type { LineTrace } from "./trace";

/** Only lines spanning this share of the page width, with this many points, are scored. */
const MIN_SPAN = 0.25;
const MIN_POINTS = 8;
/** Residuals are averaged over this many points either side, so pixel noise does not count as bend. */
const SMOOTH_POINTS = 2;

export interface BendScore {
  /** Mean bend of the scored lines, as a share of the page height. */
  mean: number;
  /** Bend that 90% of the scored lines stay under, as a share of the page height. */
  p90: number;
  /** Number of lines scored. */
  lines: number;
}

/**
 * How bent the traced lines are. A line's bend is how far it strays from its own best straight
 * line (smoothed over a few points), so a tilt that is the same along the whole line does not
 * count. Returns null when no line is long enough to score.
 */
export function bendScore(trace: LineTrace, width: number, height: number): BendScore | null {
  const bends: number[] = [];
  for (const line of trace.lines) {
    const pts = line.points;
    if (pts.length < MIN_POINTS || pts[pts.length - 1]!.x - pts[0]!.x < MIN_SPAN * width) continue;
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let num = 0, den = 0;
    for (const p of pts) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const residual = pts.map((p) => p.y - my - slope * (p.x - mx));
    let worst = 0;
    for (let i = 0; i < residual.length; i++) {
      const window = residual.slice(Math.max(0, i - SMOOTH_POINTS), i + SMOOTH_POINTS + 1);
      worst = Math.max(worst, Math.abs(window.reduce((s, r) => s + r, 0) / window.length));
    }
    bends.push(worst / height);
  }
  if (bends.length === 0) return null;
  const sorted = [...bends].sort((a, b) => a - b);
  return {
    mean: bends.reduce((s, b) => s + b, 0) / bends.length,
    p90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!,
    lines: bends.length,
  };
}
