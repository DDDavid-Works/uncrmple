import { BENT_LAYOUT, bentTextPage, solid, type BentRow } from "../../../tests/synthetic";
import { toGray } from "../assessment/pixels";
import { traceLines, type TracedLine } from "./trace";

const W = 800, H = 1000;
type Shift = (x: number, y: number) => number;

/** The true row a traced line follows, and its largest deviation from that row's true path. */
function match(line: TracedLine, rows: BentRow[], shift: Shift): { row: BentRow; error: number } {
  let best = { row: rows[0]!, error: Infinity, mean: Infinity };
  for (const row of rows) {
    const errs = line.points.map((p) => Math.abs(p.y - (row.y + shift(p.x, row.y))));
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    if (mean < best.mean) best = { row, error: Math.max(...errs), mean };
  }
  return best;
}

/** Trace a bent page and check every line against the ground truth. */
function traceAndCheck(shift: Shift, options: Parameters<typeof bentTextPage>[3] = {}) {
  const { image, rows } = bentTextPage(W, H, shift, options);
  const trace = traceLines(toGray(image));
  // Rows pushed into the margin the tracer ignores are cut off there, so their centres are not comparable.
  const inside = (row: BentRow, line: TracedLine) =>
    line.points.every((p) => row.y + shift(p.x, row.y) > 0.03 * H + 4 && row.y + shift(p.x, row.y) < 0.97 * H - 4);
  const matches = trace.lines.map((line) => ({ line, ...match(line, rows, shift) })).filter((m) => inside(m.row, m.line));
  return { trace, rows, matches };
}

describe("traceLines", () => {
  it("follows every row of a flat page, level and at the right height", () => {
    const { trace, rows, matches } = traceAndCheck(() => 0);
    expect(trace.rowPitch).toBeCloseTo(BENT_LAYOUT.pitch, 0);
    // Rows inside the ignored page margin are not expected.
    expect(trace.lines.length).toBeGreaterThanOrEqual(rows.length - 4);
    for (const m of matches) {
      expect(m.error).toBeLessThan(0.75);
      expect(m.line.kind).toBe(m.row.kind);
      expect(m.line.points[m.line.points.length - 1]!.x - m.line.points[0]!.x).toBeGreaterThan(0.8 * W);
    }
    // One traced line per row: no duplicates.
    expect(new Set(matches.map((m) => m.row)).size).toBe(matches.length);
  });

  it("follows a smooth curl within a pixel", () => {
    const curl: Shift = (x, y) => 12 * Math.sin((Math.PI * x) / W) * (0.4 + (0.6 * y) / H);
    const { trace, rows, matches } = traceAndCheck(curl);
    expect(trace.lines.length).toBeGreaterThanOrEqual(rows.length - 4);
    for (const m of matches) expect(m.error).toBeLessThan(1);
    expect(new Set(matches.map((m) => m.row)).size).toBe(matches.length);
  });

  it("follows lines through a sharp crease", () => {
    const tan = Math.tan((4 * Math.PI) / 180);
    const crease: Shift = (x, y) => (x > 0.55 * W ? (x - 0.55 * W) * tan * (y / H) : 0);
    const { trace, rows, matches } = traceAndCheck(crease);
    expect(trace.lines.length).toBeGreaterThanOrEqual(rows.length - 4);
    for (const m of matches) expect(m.error).toBeLessThan(1.5);
    expect(new Set(matches.map((m) => m.row)).size).toBe(matches.length);
  });

  it("links rows across a gutter when the page sags gradually", () => {
    const sag: Shift = (x) => 6 / (1 + Math.exp(-(x - 410) / 30));
    const { rows, matches } = traceAndCheck(sag, { gutter: [380, 440] });
    const across = matches.filter((m) => m.line.points[0]!.x < 380 && m.line.points[m.line.points.length - 1]!.x > 440);
    expect(across.length).toBeGreaterThanOrEqual(rows.length - 4);
    for (const m of matches) expect(m.error).toBeLessThan(1);
    expect(new Set(matches.map((m) => m.row)).size).toBe(matches.length);
  });

  it("does not link across a sudden step (columns printed at different heights look the same)", () => {
    const step: Shift = (x) => (x >= 440 ? 7 : 0);
    const { matches } = traceAndCheck(step, { gutter: [380, 440] });
    for (const m of matches) {
      const first = m.line.points[0]!.x, last = m.line.points[m.line.points.length - 1]!.x;
      expect(first < 380 && last > 440).toBe(false);
      expect(m.error).toBeLessThan(1);
    }
    // Both columns are still traced, each on its own.
    expect(matches.filter((m) => m.line.points[0]!.x > 440).length).toBeGreaterThan(30);
    expect(matches.filter((m) => m.line.points[m.line.points.length - 1]!.x < 380).length).toBeGreaterThan(30);
  });

  it("finds no lines on a blank page", () => {
    const trace = traceLines(toGray(solid(W, H, 230)));
    expect(trace.lines).toEqual([]);
    expect(trace.rowPitch).toBeNull();
  });

  it("does not invent lines inside a photo-like area", () => {
    const speckle = { x: 200, y: 300, width: 400, height: 300 };
    const { trace, matches } = traceAndCheck(() => 0, { speckle });
    for (const m of matches) {
      for (const p of m.line.points) {
        const inside = p.x > speckle.x + 20 && p.x < speckle.x + speckle.width - 20 && p.y > speckle.y + 5 && p.y < speckle.y + speckle.height - 5;
        expect(inside).toBe(false);
      }
      expect(m.error).toBeLessThan(0.75);
    }
    // Rows above and below the area are still traced.
    expect(trace.lines.length).toBeGreaterThan(20);
  });

  it("returns points left to right", () => {
    const { trace } = traceAndCheck((x) => 0.01 * x);
    for (const line of trace.lines) {
      for (let i = 1; i < line.points.length; i++) expect(line.points[i]!.x).toBeGreaterThan(line.points[i - 1]!.x);
    }
  });
});
