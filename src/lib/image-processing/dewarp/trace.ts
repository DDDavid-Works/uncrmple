import type { Gray } from "../assessment/pixels";
import { inkMask } from "../ink";

/**
 * Trace the rows of text and ruled lines across a straightened page, as evidence of how the paper
 * bends. Plain arithmetic on a grayscale image, so it runs in any JavaScript environment.
 *
 * Method: mark ink, drop long vertical strokes (table columns, borders), then cut the page into
 * narrow vertical strips. In each strip, rows of text and ruled lines show up as bands in the
 * row-by-row ink count; each band gives one sample (its ink-weighted centre). Samples are then
 * linked from strip to strip into lines by predicting where each line continues. Areas without
 * line structure (photos, blank space) yield no samples rather than guesses.
 */

/** Page margin ignored on each side, so the page border and background wedges do not count. */
const MARGIN = 0.03;
/** Number of vertical strips across the page, and their minimum width. */
const STRIPS = 48;
const MIN_STRIP_PX = 8;
/** A strip row belongs to a band when its smoothed ink count covers this share of the strip width. */
const COVERAGE = 0.12;
/** Bands taller than this share of the page height are blocks (photos, logos), not lines. */
const MAX_BAND_FRACTION = 0.025;
/** Vertical ink runs longer than this share of the page height are strokes, not lettering. */
const VERTICAL_STROKE_FRACTION = 0.025;
/** A band whose dense core is at most this tall and this full is a ruled line. */
const RULED_MAX_PX = 5;
const RULED_DENSITY = 0.8;
/** A line may continue across this many strips without a sample (gutters, short cells). */
const MAX_GAP_STRIPS = 4;
/**
 * A sample joins a line when it is close to where the line is predicted: a base tolerance (a share
 * of the row pitch, within limits) plus a little per pixel of distance, since the slope may change
 * over a gap. Paper bends gradually, so between neighbouring strips a real line moves under a pixel
 * or two; a sudden step is more likely a neighbouring cell printed slightly higher or lower than
 * the same line sagging, so it is left unlinked.
 */
const LINK_BASE_SHARE = 0.12;
const LINK_BASE_MIN_PX = 1.5;
const LINK_BASE_MAX_PX = 3;
const LINK_PER_PX = 0.03;
/** Steepest slope a line may take (about 6°); prediction is clamped to it. */
const MAX_SLOPE = 0.1;
/** Recent points used to estimate a line's local slope. */
const SLOPE_POINTS = 4;
/**
 * Lines must span this share of the page width and have this many samples to be kept. Short
 * pieces (one table column's worth of text) are kept on purpose: wide gaps between columns are
 * not bridged, and a piece still shows how the paper bends locally.
 */
const MIN_SPAN = 0.08;
const MIN_POINTS = 4;

export type LineKind = "ruled" | "text";

export interface LinePoint {
  x: number;
  y: number;
}

export interface TracedLine {
  kind: LineKind;
  /** One point per strip where the line was seen, left to right, in pixel-index coordinates. */
  points: LinePoint[];
}

export interface LineTrace {
  /** Traced lines, top to bottom by mean height. */
  lines: TracedLine[];
  /** Typical distance between neighbouring rows in pixels; null when it could not be measured. */
  rowPitch: number | null;
}

interface Sample extends LinePoint {
  kind: LineKind;
}

/** Clear vertical ink runs longer than `maxLen` (in place). */
function removeVerticalStrokes(mask: Uint8Array, w: number, h: number, maxLen: number): void {
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const ink = y < h && mask[y * w + x] === 1;
      if (ink && start < 0) start = y;
      if (!ink && start >= 0) {
        if (y - start > maxLen) for (let k = start; k < y; k++) mask[k * w + x] = 0;
        start = -1;
      }
    }
  }
}

/** Band centres in the strip of columns [x0, x1). */
function stripSamples(mask: Uint8Array, w: number, h: number, x0: number, x1: number): Sample[] {
  const sw = x1 - x0;
  const counts = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = x0; x < x1; x++) c += mask[y * w + x]!;
    counts[y] = c;
  }
  const threshold = COVERAGE * sw;
  const maxBand = Math.max(RULED_MAX_PX + 2, Math.round(h * MAX_BAND_FRACTION));
  const inBand = (y: number) => {
    const s = (counts[y - 1] ?? 0) + counts[y]! + (counts[y + 1] ?? 0);
    return s / 3 >= threshold;
  };
  const samples: Sample[] = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && inBand(y);
    if (on && start < 0) start = y;
    if (on || start < 0) continue;
    const band = bandSample(counts, start, y, threshold, sw, maxBand);
    if (band) samples.push({ x: inkCentreX(mask, w, x0, x1, start, y), ...band });
    start = -1;
  }
  return samples;
}

/**
 * Mean column of the ink in a band. A strip only partly covered by ink (a word end, a gutter) has
 * its ink off the strip centre, and the sample must sit where its height was measured.
 */
function inkCentreX(mask: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number): number {
  let n = 0, sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (mask[y * w + x]) {
        n++;
        sum += x;
      }
    }
  }
  return n === 0 ? (x0 + x1 - 1) / 2 : sum / n;
}

/** Centre and kind of the band of rows [start, end), or null if it is too tall to be a line. */
function bandSample(counts: Float64Array, start: number, end: number, threshold: number, sw: number, maxBand: number): Omit<Sample, "x"> | null {
  if (end - start > maxBand) return null;
  let sum = 0, weighted = 0, core = 0, coreSum = 0;
  for (let k = start; k < end; k++) {
    sum += counts[k]!;
    weighted += counts[k]! * k;
    if (counts[k]! >= threshold) {
      core++;
      coreSum += counts[k]!;
    }
  }
  if (sum === 0) return null;
  const ruled = core > 0 && core <= RULED_MAX_PX && coreSum / (core * sw) >= RULED_DENSITY;
  return { y: weighted / sum, kind: ruled ? "ruled" : "text" };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Least-squares slope of the last few points, clamped to MAX_SLOPE. */
function recentSlope(points: LinePoint[]): number {
  const recent = points.slice(-SLOPE_POINTS);
  if (recent.length < 2) return 0;
  const mx = recent.reduce((s, p) => s + p.x, 0) / recent.length;
  const my = recent.reduce((s, p) => s + p.y, 0) / recent.length;
  let num = 0, den = 0;
  for (const p of recent) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, num / den));
}

interface Track {
  /** Strips in which the sample looked like a ruled line (a sloped ruled line can look like text in a strip). */
  ruled: number;
  points: LinePoint[];
  lastStrip: number;
  slope: number;
}

/** Find and follow the text rows and ruled lines of a straightened page. */
export function traceLines(gray: Gray): LineTrace {
  const { width: w, height: h } = gray;
  const mask = inkMask(gray, MARGIN);
  removeVerticalStrokes(mask, w, h, Math.max(8, Math.round(h * VERTICAL_STROKE_FRACTION)));

  const x0 = Math.round(w * MARGIN);
  const inner = w - 2 * x0;
  const strips = Math.max(1, Math.min(STRIPS, Math.floor(inner / MIN_STRIP_PX)));
  const perStrip: Sample[][] = [];
  for (let s = 0; s < strips; s++) {
    const a = x0 + Math.floor((inner * s) / strips);
    const b = x0 + Math.floor((inner * (s + 1)) / strips);
    perStrip.push(stripSamples(mask, w, h, a, b));
  }

  const gaps: number[] = [];
  for (const samples of perStrip) for (let i = 1; i < samples.length; i++) gaps.push(samples[i]!.y - samples[i - 1]!.y);
  const rowPitch = median(gaps);
  const base = Math.max(LINK_BASE_MIN_PX, Math.min(LINK_BASE_MAX_PX, LINK_BASE_SHARE * (rowPitch ?? 0)));

  const tracks: Track[] = [];
  perStrip.forEach((samples, s) => {
    const live = tracks.filter((t) => s - t.lastStrip <= MAX_GAP_STRIPS + 1);
    const pairs: { track: Track; sample: Sample; d: number }[] = [];
    for (const track of live) {
      const last = track.points[track.points.length - 1]!;
      for (const sample of samples) {
        const dx = sample.x - last.x;
        const d = Math.abs(sample.y - (last.y + track.slope * dx));
        if (d <= base + LINK_PER_PX * dx) pairs.push({ track, sample, d });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    const usedTracks = new Set<Track>();
    const usedSamples = new Set<Sample>();
    for (const { track, sample } of pairs) {
      if (usedTracks.has(track) || usedSamples.has(sample)) continue;
      usedTracks.add(track);
      usedSamples.add(sample);
      track.points.push({ x: sample.x, y: sample.y });
      if (sample.kind === "ruled") track.ruled++;
      track.lastStrip = s;
      track.slope = recentSlope(track.points);
    }
    for (const sample of samples) {
      if (!usedSamples.has(sample)) tracks.push({ ruled: sample.kind === "ruled" ? 1 : 0, points: [{ x: sample.x, y: sample.y }], lastStrip: s, slope: 0 });
    }
  });

  const lines = tracks
    .filter((t) => t.points.length >= MIN_POINTS && t.points[t.points.length - 1]!.x - t.points[0]!.x >= MIN_SPAN * w)
    .map((t): TracedLine => ({ kind: t.ruled * 2 > t.points.length ? "ruled" : "text", points: t.points }))
    .sort((a, b) => meanY(a) - meanY(b));
  return { lines, rowPitch };
}

const meanY = (line: TracedLine) => line.points.reduce((s, p) => s + p.y, 0) / line.points.length;
