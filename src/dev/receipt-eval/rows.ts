/**
 * Row-by-row reading for the receipt spike (development only, see docs/receipt-mode.md).
 *
 * Tesseract's own line finding merges and splits rows on wavy, crumpled paper. Here the rows are
 * found first with the page tracer the repair already uses (`traceLines`), then each row is cut
 * out as a straight strip that follows the row's own curve, so OCR can read it as a single line.
 * Pure functions on grayscale pixels; no OCR or browser APIs.
 */
import type { Gray } from "../../lib/image-processing/assessment/pixels";
import type { LinePoint, LineTrace } from "../../lib/image-processing/dewarp/trace";

/** Pieces whose heights differ by less than this share of the row pitch belong to the same row. */
export const SAME_ROW_SHARE = 0.35;
/** Strip height as a multiple of the row pitch: the row and a little of the gap on each side. */
export const STRIP_PITCH = 1.1;
/** Smallest strip height in pixels. */
export const MIN_STRIP_PX = 12;
/** Pieces may overlap horizontally by this many pixels and still join (neighbouring strips). */
const OVERLAP_PX = 2;

export interface TextRow {
  /** Points along the row, left to right, merged from all its traced pieces. */
  points: LinePoint[];
}

const meanY = (points: LinePoint[]) => points.reduce((s, p) => s + p.y, 0) / points.length;

/** Height of a row at column x: linear between its points, flat beyond its ends. */
export function rowY(points: readonly LinePoint[], x: number): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  let i = 1;
  while (points[i]!.x < x) i++;
  const a = points[i - 1]!, b = points[i]!;
  return b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

/**
 * Join the traced text pieces into rows, top to bottom. The tracer keeps a row's columns apart
 * (an item name and its amount far to the right are separate pieces); pieces at about the same
 * height that do not overlap side by side are the same row. Ruled lines are left out.
 */
export function groupRows(trace: LineTrace): TextRow[] {
  const pitch = trace.rowPitch;
  if (pitch === null) return [];
  const tolerance = SAME_ROW_SHARE * pitch;
  const rows: { points: LinePoint[]; ranges: [number, number][] }[] = [];
  for (const line of trace.lines) {
    if (line.kind !== "text") continue;
    const from = line.points[0]!.x;
    const to = line.points[line.points.length - 1]!.x;
    const mid = line.points[Math.floor(line.points.length / 2)]!;
    let best: (typeof rows)[number] | null = null;
    let bestD = Infinity;
    for (const row of rows) {
      if (row.ranges.some(([a, b]) => from < b - OVERLAP_PX && to > a + OVERLAP_PX)) continue;
      const d = Math.abs(rowY(row.points, mid.x) - mid.y);
      if (d < tolerance && d < bestD) {
        best = row;
        bestD = d;
      }
    }
    if (best) {
      best.points = [...best.points, ...line.points].sort((a, b) => a.x - b.x);
      best.ranges.push([from, to]);
    } else {
      rows.push({ points: [...line.points], ranges: [[from, to]] });
    }
  }
  return dropDuplicates(
    rows.map((r) => ({ points: r.points })),
    pitch,
  ).sort((a, b) => meanY(a.points) - meanY(b.points));
}

/** Rows closer than this share of the pitch where they overlap side by side are the same text traced twice. */
const DUPLICATE_SHARE = 0.5;

/**
 * On wavy paper the tracer can follow one row twice, in two overlapping pieces a few pixels apart
 * that could not be joined; reading both would give the row twice. Keep the longer one.
 */
function dropDuplicates(rows: TextRow[], pitch: number): TextRow[] {
  const span = (r: TextRow) => r.points[r.points.length - 1]!.x - r.points[0]!.x;
  const byLength = [...rows].sort((a, b) => span(b) - span(a));
  const kept: TextRow[] = [];
  for (const row of byLength) {
    const from = row.points[0]!.x, to = row.points[row.points.length - 1]!.x;
    const twin = kept.some((k) => {
      const a = Math.max(from, k.points[0]!.x), b = Math.min(to, k.points[k.points.length - 1]!.x);
      if (b <= a) return false;
      const mid = (a + b) / 2;
      return Math.abs(rowY(row.points, mid) - rowY(k.points, mid)) < DUPLICATE_SHARE * pitch;
    });
    if (!twin) kept.push(row);
  }
  return kept;
}

/** White gap between stacked rows, as a multiple of the strip height. */
export const STACK_GAP = 0.6;

/**
 * Every row's strip, level and one under another with white space between, as one image: the page
 * with its curves taken out. Tesseract can then read it in one pass and find its lines easily.
 */
export function stackRows(gray: Gray, rows: readonly TextRow[], height: number): Gray {
  const gap = Math.round(STACK_GAP * height);
  const w = gray.width;
  const total = rows.length * height + (rows.length + 1) * gap;
  const out = new Uint8Array(w * total).fill(255);
  rows.forEach((row, i) => out.set(rowStrip(gray, row, height).data, (gap + i * (height + gap)) * w));
  return { width: w, height: total, data: out };
}

/**
 * Cut a row out as a straight strip of the page's full width: each column is taken from around
 * the row's height in that column, so a row that bends comes out level. Pixels beyond the page
 * are white. Returns a new image; the page is not changed.
 */
export function rowStrip(gray: Gray, row: TextRow, height: number): Gray {
  const { width: w, height: h, data } = gray;
  const out = new Uint8Array(w * height).fill(255);
  for (let x = 0; x < w; x++) {
    const top = rowY(row.points, x) - (height - 1) / 2;
    for (let k = 0; k < height; k++) {
      const y = top + k;
      const y0 = Math.floor(y);
      if (y0 < 0 || y0 + 1 >= h) continue;
      const f = y - y0;
      out[k * w + x] = Math.round(data[y0 * w + x]! * (1 - f) + data[(y0 + 1) * w + x]! * f);
    }
  }
  return { width: w, height, data: out };
}

/** Strip height for a page with this row pitch. */
export function stripHeight(rowPitch: number): number {
  return Math.max(MIN_STRIP_PX, Math.round(STRIP_PITCH * rowPitch));
}
