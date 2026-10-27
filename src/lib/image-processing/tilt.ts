import type { Gray } from "./assessment/pixels";
import { inkMask } from "./ink";

/**
 * Residual tilt of printed lines (text rows and ruled lines) inside an already straightened page.
 * Plain arithmetic on a grayscale image, so it runs in any JavaScript environment.
 *
 * Method: mark ink pixels (darker than their neighbourhood), then for each candidate angle
 * project them onto lines of that slope. Rows of text and ruled lines pile up into sharp peaks
 * only when the slope matches, so the angle with the most concentrated projection wins. Its
 * confidence comes from how much it stands out from slightly different angles.
 */

/** Angles searched, in degrees either side of level. Wider than any correction we apply. */
export const TILT_SEARCH_DEG = 6;
const COARSE_STEP_DEG = 0.2;
const FINE_STEP_DEG = 0.02;
/** Page margin ignored on each side, so the page border and background wedges do not count. */
const MARGIN = 0.04;
/** Fewer ink pixels than this (per measured region) cannot give a reliable angle. */
const MIN_INK = 400;
/** Ink pixels used per region at most; denser pages are subsampled evenly. */
const MAX_INK = 120_000;
/**
 * Peak prominence is the best projection energy over the energy this many degrees either side.
 * (Comparing with the average over the whole range understates real pages: uneven ink down the
 * page adds a broad, smooth trend to the energy curve.)
 */
const PROMINENCE_OFFSET_DEG = 2;
/** Prominence at which confidence reaches 1; real, clearly lined pages measure about 1.15–1.4. */
const STRONG_PROMINENCE = 1.15;
/** A band needs at least this prominence to count towards the bend. */
const BAND_PROMINENCE = 1.08;
/** Horizontal bands measured separately to detect bending (top, middle, bottom). */
const BANDS = 3;

export interface TiltMeasurement {
  /** Degrees. Positive: lines fall towards the right (clockwise on screen). */
  angle: number;
  /** 0..1 heuristic: how clearly one angle stands out. Not a calibrated probability. */
  confidence: number;
  /** Angle per horizontal band, top to bottom; null where the band has too little ink. */
  bands: (number | null)[];
  /** Largest difference between band angles in degrees; null if fewer than two bands were measured. */
  bend: number | null;
}

interface Ink {
  xs: Float32Array;
  ys: Float32Array;
  count: number;
}

/** Ink pixels inside the margin-trimmed page, as coordinate lists. */
function findInk(gray: Gray): Ink {
  const mask = inkMask(gray, MARGIN);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    xs.push(i % gray.width);
    ys.push(Math.floor(i / gray.width));
  }
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), count: xs.length };
}

/** Ink restricted to rows [fromY, toY), evenly subsampled to at most MAX_INK points. */
function select(ink: Ink, fromY: number, toY: number): Ink {
  let n = 0;
  for (let i = 0; i < ink.count; i++) if (ink.ys[i]! >= fromY && ink.ys[i]! < toY) n++;
  const stride = Math.max(1, n / MAX_INK);
  const size = Math.min(n, MAX_INK);
  const xs = new Float32Array(size), ys = new Float32Array(size);
  let seen = 0, kept = 0, next = 0;
  for (let i = 0; i < ink.count && kept < size; i++) {
    if (ink.ys[i]! < fromY || ink.ys[i]! >= toY) continue;
    if (seen++ < next) continue;
    xs[kept] = ink.xs[i]!;
    ys[kept++] = ink.ys[i]!;
    next += stride;
  }
  return { xs, ys, count: kept };
}

/** Sum of squared bin counts after projecting along lines of the given slope (1 px bins). */
function energy(ink: Ink, deg: number, bins: Float64Array, offset: number): number {
  const t = Math.tan((deg * Math.PI) / 180);
  bins.fill(0);
  for (let i = 0; i < ink.count; i++) {
    bins[Math.round(ink.ys[i]! - ink.xs[i]! * t + offset)]!++;
  }
  let e = 0;
  for (let i = 0; i < bins.length; i++) e += bins[i]! * bins[i]!;
  return e;
}

/** Best angle and how much its projection stands out from nearby angles. */
function bestAngle(ink: Ink, width: number, height: number): { angle: number; prominence: number } | null {
  if (ink.count < MIN_INK) return null;
  const reach = TILT_SEARCH_DEG + PROMINENCE_OFFSET_DEG;
  const slack = Math.ceil(width * Math.tan((reach * Math.PI) / 180)) + 2;
  const bins = new Float64Array(height + 2 * slack);
  let best = 0, bestE = -1;
  for (let d = -TILT_SEARCH_DEG; d <= TILT_SEARCH_DEG + 1e-9; d += COARSE_STEP_DEG) {
    const e = energy(ink, d, bins, slack);
    if (e > bestE) [best, bestE] = [d, e];
  }
  const coarse = best;
  for (let d = coarse - COARSE_STEP_DEG; d <= coarse + COARSE_STEP_DEG + 1e-9; d += FINE_STEP_DEG) {
    const e = energy(ink, d, bins, slack);
    if (e > bestE) [best, bestE] = [d, e];
  }
  const around = (energy(ink, best - PROMINENCE_OFFSET_DEG, bins, slack) + energy(ink, best + PROMINENCE_OFFSET_DEG, bins, slack)) / 2;
  return { angle: Math.round(best * 100) / 100, prominence: bestE / Math.max(1, around) };
}

/**
 * Measure how far the printed lines of a straightened page lean, overall and per band.
 * Returns null when the page has too little line-like content to tell (blank, photo, sparse).
 */
export function measureTilt(gray: Gray): TiltMeasurement | null {
  const ink = findInk(gray);
  const whole = bestAngle(select(ink, 0, gray.height), gray.width, gray.height);
  if (!whole) return null;
  const confidence = Math.max(0, Math.min(1, (whole.prominence - 1) / (STRONG_PROMINENCE - 1)));

  const bands: (number | null)[] = [];
  for (let b = 0; b < BANDS; b++) {
    const from = Math.floor((gray.height * b) / BANDS);
    const to = Math.floor((gray.height * (b + 1)) / BANDS);
    const band = bestAngle(select(ink, from, to), gray.width, gray.height);
    // A band with no clear peak (e.g. a photo or signature area) says nothing about bending.
    bands.push(band && band.prominence >= BAND_PROMINENCE ? band.angle : null);
  }
  const measured = bands.filter((a): a is number => a !== null);
  const bend = measured.length >= 2 ? Math.round((Math.max(...measured) - Math.min(...measured)) * 100) / 100 : null;
  return { angle: whole.angle, confidence, bands, bend };
}
