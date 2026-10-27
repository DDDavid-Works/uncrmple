import type { ShiftMap } from "../../../types/repair";
import type { LineTrace } from "./trace";

/**
 * Turn traced lines into a smooth vertical shift map that would make them level.
 *
 * Works from slopes, not heights: many traced lines are short pieces whose "level" height is
 * unknown, but every piece shows how steeply the paper runs where it lies. Slopes are collected
 * on a coarse grid, outliers are dropped, gaps are filled (fading to no correction far from any
 * evidence), and each grid row is integrated left to right into shifts. A shift that is constant
 * along a whole row cannot be observed from lines, so each row's shifts average to zero: the
 * page is flattened, not moved.
 */

/** Grid of slope cells; shift nodes sit on the cell boundaries across and cell centres down. */
const COLUMNS = 24;
const ROWS = 32;
/** Slopes steeper than this (about 7°) are not paper bending after straightening. */
const MAX_SLOPE = 0.12;
/**
 * Slope at each point is a least-squares fit over this many points either side (about 100 px).
 * Neighbouring points alone are too noisy: band centres move in whole-pixel steps.
 */
const SLOPE_WINDOW = 3;
/**
 * A point further than this from the fit of its neighbours is a jump onto another row (a wrong
 * link); the line is split there and the point dropped.
 */
const JUMP_PX = 1.5;
/** Pieces shorter than this many points cannot give a reliable slope. */
const MIN_PIECE_POINTS = 4;
/** A sample is an outlier among nearby lines when it differs from their weighted median by more than this. */
const CELL_SLOPE_TOLERANCE = 0.03;
/** A cell has evidence when its kept samples cover this share of the cell width. */
const MIN_CELL_EVIDENCE = 0.5;
/** Below this share of cells with evidence, the map would be mostly guesswork. */
export const MIN_COVERAGE = 0.25;
/** Beyond the last evidence, filled slopes fade to zero over about this many cells. */
const FADE_CELLS = 2;
/** Shifts larger than this share of the page height mean the evidence is wrong, not the paper. */
export const MAX_SHIFT = 0.03;

export interface ShiftMapStats {
  /** Traced lines considered. */
  lines: number;
  /** Points that sat off their line (wrong links) and were dropped. */
  jumps: number;
  /** Slope samples considered, and those dropped for disagreeing with nearby lines. */
  samples: number;
  samplesRejected: number;
  /** Share of grid cells with direct evidence. */
  coverage: number;
  /** Largest absolute shift as a share of the page height (0 when no map was built). */
  maxShift: number;
}

export type ShiftMapSkip = "too-little-evidence" | "too-large";

export interface ShiftMapResult {
  map: ShiftMap | null;
  /** Set when `map` is null. */
  skipped?: ShiftMapSkip;
  stats: ShiftMapStats;
}

interface SlopeSample {
  x: number;
  y: number;
  slope: number;
  /** Horizontal distance the sample stands for, in pixels. */
  weight: number;
}

type Pt = { x: number; y: number };

/** Least-squares slope and intercept (at `atX`) of the points, or null for fewer than two. */
function fit(points: Pt[], atX: number): { slope: number; y: number } | null {
  if (points.length < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, y: my + slope * (atX - mx) };
}

/** Split a line wherever a point sits off the fit of its neighbours (dropping that point). */
function splitAtJumps(points: Pt[], stats: ShiftMapStats): Pt[][] {
  const pieces: Pt[][] = [];
  let current: Pt[] = [];
  points.forEach((p, i) => {
    const around = [...points.slice(Math.max(0, i - SLOPE_WINDOW), i), ...points.slice(i + 1, i + SLOPE_WINDOW + 1)];
    const f = fit(around, p.x);
    if (f && Math.abs(p.y - f.y) > JUMP_PX) {
      stats.jumps++;
      if (current.length) pieces.push(current);
      current = [];
      return;
    }
    current.push(p);
  });
  if (current.length) pieces.push(current);
  return pieces;
}

/** Slope samples along every traced line, from windowed fits on the pieces between jumps. */
function lineSamples(trace: LineTrace, stats: ShiftMapStats): SlopeSample[] {
  const samples: SlopeSample[] = [];
  for (const line of trace.lines) {
    stats.lines++;
    for (const piece of splitAtJumps(line.points, stats)) {
      if (piece.length < MIN_PIECE_POINTS) continue;
      piece.forEach((p, i) => {
        const window = piece.slice(Math.max(0, i - SLOPE_WINDOW), i + SLOPE_WINDOW + 1);
        const f = fit(window, p.x);
        if (!f || Math.abs(f.slope) > MAX_SLOPE) return;
        const left = piece[Math.max(0, i - 1)]!.x, right = piece[Math.min(piece.length - 1, i + 1)]!.x;
        samples.push({ x: p.x, y: p.y, slope: f.slope, weight: (right - left) / (i === 0 || i === piece.length - 1 ? 1 : 2) });
      });
    }
  }
  stats.samples = samples.length;
  return samples;
}

function weightedMedian(items: { value: number; weight: number }[]): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((s, i) => s + i.weight, 0) / 2;
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= half) return item.value;
  }
  return sorted[sorted.length - 1]!.value;
}

/** Fill unknown (NaN) entries along one axis from known ones: linear between, fading outside. */
function fillLine(get: (i: number) => number, set: (i: number, v: number) => void, n: number): void {
  const known: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(get(i))) known.push(i);
  if (known.length === 0) return;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(get(i))) continue;
    const after = known.find((k) => k > i);
    const before = [...known].reverse().find((k) => k < i);
    if (before !== undefined && after !== undefined) {
      const t = (i - before) / (after - before);
      set(i, get(before) * (1 - t) + get(after) * t);
    } else {
      const nearest = (before ?? after)!;
      set(i, get(nearest) * Math.exp(-Math.abs(i - nearest) / FADE_CELLS));
    }
  }
}

/** Build the shift map for a page of the given size from its traced lines. */
export function buildShiftMap(trace: LineTrace, width: number, height: number): ShiftMapResult {
  const stats: ShiftMapStats = { lines: 0, jumps: 0, samples: 0, samplesRejected: 0, coverage: 0, maxShift: 0 };
  const samples = lineSamples(trace, stats);
  const cellW = width / COLUMNS, cellH = height / ROWS;
  const cellOf = (s: SlopeSample) => {
    const cx = Math.min(COLUMNS - 1, Math.max(0, Math.floor(s.x / cellW)));
    const cy = Math.min(ROWS - 1, Math.max(0, Math.floor(s.y / cellH)));
    return { cx, cy };
  };
  const byCell: SlopeSample[][] = Array.from({ length: COLUMNS * ROWS }, () => []);
  for (const s of samples) {
    const { cx, cy } = cellOf(s);
    byCell[cy * COLUMNS + cx]!.push(s);
  }

  // Drop samples that disagree with the lines around them (3×3 cells), then average per cell.
  const slope = new Float64Array(COLUMNS * ROWS).fill(Number.NaN);
  let evidenceCells = 0;
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLUMNS; cx++) {
      const own = byCell[cy * COLUMNS + cx]!;
      if (own.length === 0) continue;
      const around: { value: number; weight: number }[] = [];
      for (let y = Math.max(0, cy - 1); y <= Math.min(ROWS - 1, cy + 1); y++) {
        for (let x = Math.max(0, cx - 1); x <= Math.min(COLUMNS - 1, cx + 1); x++) {
          for (const s of byCell[y * COLUMNS + x]!) around.push({ value: s.slope, weight: s.weight });
        }
      }
      const m = weightedMedian(around);
      let sum = 0, weight = 0;
      for (const s of own) {
        if (Math.abs(s.slope - m) > CELL_SLOPE_TOLERANCE) {
          stats.samplesRejected++;
          continue;
        }
        sum += s.slope * s.weight;
        weight += s.weight;
      }
      if (weight >= MIN_CELL_EVIDENCE * cellW) {
        slope[cy * COLUMNS + cx] = sum / weight;
        evidenceCells++;
      }
    }
  }
  stats.coverage = evidenceCells / (COLUMNS * ROWS);
  if (stats.coverage < MIN_COVERAGE) return { map: null, skipped: "too-little-evidence", stats };

  // Fill gaps down each column, then across rows for columns with no evidence at all.
  for (let cx = 0; cx < COLUMNS; cx++) {
    fillLine((i) => slope[i * COLUMNS + cx]!, (i, v) => (slope[i * COLUMNS + cx] = v), ROWS);
  }
  for (let cy = 0; cy < ROWS; cy++) {
    fillLine((i) => slope[cy * COLUMNS + i]!, (i, v) => (slope[cy * COLUMNS + i] = v), COLUMNS);
    for (let cx = 0; cx < COLUMNS; cx++) if (Number.isNaN(slope[cy * COLUMNS + cx]!)) slope[cy * COLUMNS + cx] = 0;
  }
  const smooth = smoothGrid(slope, COLUMNS, ROWS);

  // Integrate each row's slopes into shifts at the cell boundaries, centred on zero.
  const nodes = COLUMNS + 1;
  const shifts = new Float32Array(ROWS * nodes);
  let maxShift = 0;
  for (let cy = 0; cy < ROWS; cy++) {
    const row = new Float64Array(nodes);
    for (let k = 1; k < nodes; k++) row[k] = row[k - 1]! + smooth[cy * COLUMNS + k - 1]! * cellW;
    const mean = row.reduce((s, v) => s + v, 0) / nodes;
    for (let k = 0; k < nodes; k++) {
      const v = (row[k]! - mean) / height;
      shifts[cy * nodes + k] = v;
      maxShift = Math.max(maxShift, Math.abs(v));
    }
  }
  stats.maxShift = maxShift;
  if (maxShift > MAX_SHIFT) return { map: null, skipped: "too-large", stats };
  return { map: { columns: nodes, rows: ROWS, shifts }, stats };
}

/** One pass of a separable [1 2 1] filter, renormalised at the edges. */
function smoothGrid(values: Float64Array, w: number, h: number): Float64Array {
  const pass = (src: Float64Array, horizontal: boolean) => {
    const out = new Float64Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, weight = 0;
        for (const [d, k] of [[-1, 1], [0, 2], [1, 1]] as const) {
          const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += src[yy * w + xx]! * k;
          weight += k;
        }
        out[y * w + x] = sum / weight;
      }
    }
    return out;
  };
  return pass(pass(values, true), false);
}

/** Shift at normalised position (u, v) in 0..1, as a fraction of the page height (bilinear). */
export function shiftAt(map: ShiftMap, u: number, v: number): number {
  const fx = Math.min(map.columns - 1, Math.max(0, u * (map.columns - 1)));
  const fy = Math.min(map.rows - 1, Math.max(0, v * map.rows - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(map.columns - 1, x0 + 1), y1 = Math.min(map.rows - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x: number, y: number) => map.shifts[y * map.columns + x]!;
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}
