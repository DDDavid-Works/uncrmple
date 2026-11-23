import { BENT_LAYOUT, bentTextPage } from "../../tests/synthetic";
import { toGray, type Gray } from "../../lib/image-processing/assessment/pixels";
import { traceLines, type LineTrace } from "../../lib/image-processing/dewarp/trace";
import { STACK_GAP, groupRows, rowStrip, rowY, stackRows, stripHeight } from "./rows";

const W = 800, H = 1000;

/** Rows of ink in a strip: row index → share of dark pixels. */
const darkShare = (strip: Gray, y: number) => {
  let n = 0;
  for (let x = 0; x < strip.width; x++) if (strip.data[y * strip.width + x]! < 128) n++;
  return n / strip.width;
};

describe("rowY", () => {
  const points = [{ x: 10, y: 100 }, { x: 20, y: 110 }, { x: 40, y: 110 }];
  it("interpolates between points and stays flat beyond the ends", () => {
    expect(rowY(points, 15)).toBe(105);
    expect(rowY(points, 30)).toBe(110);
    expect(rowY(points, 0)).toBe(100);
    expect(rowY(points, 99)).toBe(110);
  });
});

describe("groupRows", () => {
  const piece = (from: number, to: number, y: number) => ({
    kind: "text" as const,
    points: Array.from({ length: 5 }, (_, i) => ({ x: from + ((to - from) * i) / 4, y })),
  });

  it("joins an item name and its amount on the same row, and keeps other rows apart", () => {
    const trace: LineTrace = {
      rowPitch: 20,
      lines: [piece(0, 300, 100), piece(600, 780, 103), piece(0, 300, 120), piece(600, 780, 121)],
    };
    const rows = groupRows(trace);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.points.map((p) => p.x)[0]).toBe(0);
    expect(rows[0]!.points[rows[0]!.points.length - 1]!.x).toBe(780);
  });

  it("keeps one row when the same text is traced twice a few pixels apart", () => {
    const trace: LineTrace = { rowPitch: 20, lines: [piece(0, 300, 100), piece(100, 400, 104)] };
    const rows = groupRows(trace);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.points[0]!.x).toBe(0); // same length: the first stays
  });

  it("keeps overlapping rows that are a full row apart", () => {
    const trace: LineTrace = { rowPitch: 20, lines: [piece(0, 300, 100), piece(100, 400, 120)] };
    expect(groupRows(trace)).toHaveLength(2);
  });

  it("leaves ruled lines out, and finds nothing without a row pitch", () => {
    expect(groupRows({ rowPitch: 20, lines: [{ ...piece(0, 300, 100), kind: "ruled" }] })).toHaveLength(0);
    expect(groupRows({ rowPitch: null, lines: [piece(0, 300, 100)] })).toHaveLength(0);
  });
});

describe("rowStrip", () => {
  it("straightens a bent row so its ink sits level in the middle of the strip", () => {
    // Rows sag by up to 12 px across the page, more than half the row pitch.
    const shift = (x: number) => 12 * Math.sin((Math.PI * x) / W);
    const { image } = bentTextPage(W, H, shift);
    const gray = toGray(image);
    const trace = traceLines(gray);
    const rows = groupRows(trace);
    expect(rows.length).toBeGreaterThan(10);

    const height = stripHeight(trace.rowPitch!);
    const textRows = rows.slice(2, 6);
    for (const row of textRows) {
      const strip = rowStrip(gray, row, height);
      expect([strip.width, strip.height]).toEqual([W, height]);
      // Ink in the middle rows of the strip, none at its top and bottom edges: the row is level
      // and the neighbouring rows are not cut into the strip.
      const middle = Math.floor(height / 2);
      expect(darkShare(strip, middle)).toBeGreaterThan(0.3);
      expect(darkShare(strip, 0)).toBeLessThan(0.05);
      expect(darkShare(strip, height - 1)).toBeLessThan(0.05);
    }
    // The page is untouched.
    expect(toGray(image).data).toEqual(gray.data);
  }, 30_000);

  it("fills beyond the page with white", () => {
    const gray: Gray = { width: 4, height: 4, data: new Uint8Array(16).fill(0) };
    const strip = rowStrip(gray, { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }, 6);
    expect(strip.data[0]).toBe(255); // above the page
    expect(strip.data[3 * 4]).toBe(0); // on the page
  });

  it("stacks the rows level with white gaps between them", () => {
    const shift = (x: number) => 12 * Math.sin((Math.PI * x) / W);
    const { image } = bentTextPage(W, H, shift);
    const gray = toGray(image);
    const trace = traceLines(gray);
    const rows = groupRows(trace).slice(2, 6);
    const height = stripHeight(trace.rowPitch!);
    const stacked = stackRows(gray, rows, height);
    const gap = Math.round(STACK_GAP * height);
    expect(stacked.width).toBe(W);
    expect(stacked.height).toBe(4 * height + 5 * gap);
    expect(darkShare(stacked, Math.floor(gap / 2))).toBe(0); // white above the first row
    expect(darkShare(stacked, gap + Math.floor(height / 2))).toBeGreaterThan(0.3); // first row, level
  }, 30_000);

  it("uses at least a minimum height", () => {
    expect(stripHeight(4)).toBe(12);
    expect(stripHeight(BENT_LAYOUT.pitch)).toBe(Math.round(1.1 * BENT_LAYOUT.pitch));
  });
});
