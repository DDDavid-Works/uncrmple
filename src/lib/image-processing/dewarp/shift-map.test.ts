import type { ShiftMap } from "../../../types/repair";
import { bentTextPage, remapVertical, solid } from "../../../tests/synthetic";
import { toGray } from "../assessment/pixels";
import { buildShiftMap, MAX_SHIFT, shiftAt } from "./shift-map";
import { traceLines, type LineTrace, type TracedLine } from "./trace";

const W = 800, H = 1000;
type Shift = (x: number, y: number) => number;

const curl: Shift = (x, y) => 12 * Math.sin((Math.PI * x) / W) * (0.4 + (0.6 * y) / H);
const tan4 = Math.tan((4 * Math.PI) / 180);
const crease: Shift = (x, y) => (x > 0.55 * W ? (x - 0.55 * W) * tan4 * (0.3 + (0.4 * y) / H) : 0);

/** Shift in pixels at image position (x, y). */
const pixels = (map: ShiftMap, x: number, y: number) => shiftAt(map, x / W, y / H) * H;

/** Build a map from a bent page. */
function mapFor(shift: Shift) {
  const { image } = bentTextPage(W, H, shift);
  const result = buildShiftMap(traceLines(toGray(image)), W, H);
  return { image, result };
}

/**
 * Largest difference in shape between the map and the true displacement inside the page, after
 * removing each row's average (a shift that is the same along a whole row cannot be observed).
 */
function shapeError(map: ShiftMap, truth: Shift): number {
  let worst = 0;
  for (let y = 0.1 * H; y <= 0.9 * H; y += 25) {
    const xs: number[] = [];
    for (let x = 0.08 * W; x <= 0.92 * W; x += 20) xs.push(x);
    const got = xs.map((x) => pixels(map, x, y));
    const want = xs.map((x) => truth(x, y));
    const gm = got.reduce((a, b) => a + b, 0) / xs.length;
    const wm = want.reduce((a, b) => a + b, 0) / xs.length;
    for (let i = 0; i < xs.length; i++) worst = Math.max(worst, Math.abs(got[i]! - gm - (want[i]! - wm)));
  }
  return worst;
}

/** How far each traced line rises and falls (max − min height), for lines well inside the page. */
function lineRanges(trace: LineTrace): number[] {
  return trace.lines
    .filter((l) => l.points.every((p) => p.y > 0.06 * H && p.y < 0.94 * H) && l.points[l.points.length - 1]!.x - l.points[0]!.x > 0.4 * W)
    .map((l) => Math.max(...l.points.map((p) => p.y)) - Math.min(...l.points.map((p) => p.y)));
}

describe("buildShiftMap", () => {
  it("gives a (near) zero map for a flat page", () => {
    const { result } = mapFor(() => 0);
    expect(result.map).not.toBeNull();
    expect(result.stats.maxShift * H).toBeLessThan(0.3);
    expect(result.stats.coverage).toBeGreaterThan(0.6);
  });

  it.each([
    ["a smooth curl", curl, 1],
    ["a sharp crease", crease, 1.5],
  ] as const)("recovers the shape of %s", (_, truth, tolerance) => {
    const { result } = mapFor(truth);
    expect(result.map).not.toBeNull();
    expect(shapeError(result.map!, truth)).toBeLessThan(tolerance);
  });

  it.each([
    ["a smooth curl", curl],
    ["a sharp crease", crease],
  ] as const)("levels the lines of %s when applied", (_, truth) => {
    const { image, result } = mapFor(truth);
    const before = lineRanges(traceLines(toGray(image)));
    const flattened = remapVertical(image, (x, y) => pixels(result.map!, x, y));
    const after = lineRanges(traceLines(toGray(flattened)));
    expect(Math.max(...before)).toBeGreaterThan(5);
    expect(after.length).toBeGreaterThan(before.length * 0.8);
    expect(Math.max(...after)).toBeLessThan(2);
  });

  it("ignores lines that disagree with their neighbours", () => {
    const { image } = bentTextPage(W, H, curl);
    const trace = traceLines(toGray(image));
    const diagonal: TracedLine = { kind: "text", points: Array.from({ length: 16 }, (_, i) => ({ x: 200 + i * 20, y: 400 + i * 1.6 })) };
    const zigzag: TracedLine = { kind: "text", points: Array.from({ length: 16 }, (_, i) => ({ x: 150 + i * 20, y: 600 + (i % 2) * 2.4 })) };
    const result = buildShiftMap({ ...trace, lines: [...trace.lines, diagonal, zigzag] }, W, H);
    expect(result.stats.jumps + result.stats.samplesRejected).toBeGreaterThan(10);
    expect(shapeError(result.map!, curl)).toBeLessThan(1);
  });

  it("fades to no correction where there is no evidence", () => {
    const { image } = bentTextPage(W, H, curl);
    // Blank out the lower half: no lines there.
    for (let i = (H / 2) * W * 4; i < image.data.length; i += 4) image.data[i] = image.data[i + 1] = image.data[i + 2] = 230;
    const { map } = buildShiftMap(traceLines(toGray(image)), W, H);
    expect(map).not.toBeNull();
    const range = (y: number) => {
      const s = [0.1, 0.5, 0.9].map((u) => pixels(map!, u * W, y));
      return Math.max(...s) - Math.min(...s);
    };
    // The true range at this height is about 4.8 px.
    expect(range(0.3 * H)).toBeGreaterThan(3.5);
    expect(range(0.95 * H)).toBeLessThan(0.5);
  });

  it("declines to build a map from too little evidence", () => {
    const result = buildShiftMap(traceLines(toGray(solid(W, H, 230))), W, H);
    expect(result).toMatchObject({ map: null, skipped: "too-little-evidence" });
  });

  it("declines a map whose shifts would be implausibly large", () => {
    const wide = 1600;
    const lines: TracedLine[] = [];
    for (let y = 40; y < H - 40; y += 20) {
      lines.push({ kind: "text", points: Array.from({ length: 80 }, (_, i) => ({ x: 10 + i * 20, y: y + 60 * Math.sin((Math.PI * (10 + i * 20)) / wide) })) });
    }
    const result = buildShiftMap({ lines, rowPitch: 20 }, wide, H);
    expect(result.map).toBeNull();
    expect(result.skipped).toBe("too-large");
    expect(result.stats.maxShift).toBeGreaterThan(MAX_SHIFT);
  });
});

describe("shiftAt", () => {
  const map: ShiftMap = { columns: 3, rows: 2, shifts: Float32Array.from([0, 0.01, 0.02, 0.1, 0.1, 0.1]) };
  it("returns node values and interpolates between them", () => {
    expect(shiftAt(map, 0.5, 0.25)).toBeCloseTo(0.01, 6);
    expect(shiftAt(map, 0.25, 0.25)).toBeCloseTo(0.005, 6);
    expect(shiftAt(map, 0.5, 0.5)).toBeCloseTo(0.055, 6);
  });
  it("holds the first and last rows beyond their centres", () => {
    expect(shiftAt(map, 1, 0)).toBeCloseTo(0.02, 6);
    expect(shiftAt(map, 0, 1)).toBeCloseTo(0.1, 6);
  });
});
