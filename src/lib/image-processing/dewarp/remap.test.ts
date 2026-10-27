import type { Quad, ShiftMap } from "../../../types/repair";
import { OUTSIDE, sourceMapper, validateShiftMap } from "./remap";

const W = 400, H = 300;
// The page is the photo area offset by (10, 20): source = output + offset.
const QUAD: Quad = [{ x: 10, y: 20 }, { x: 10 + W - 1, y: 20 }, { x: 10 + W - 1, y: 20 + H - 1 }, { x: 10, y: 20 + H - 1 }];

function sample(map: ShiftMap | null, x: number, y: number) {
  const mapper = sourceMapper(QUAD, W, H, map)!;
  const xs = new Float32Array(W), ys = new Float32Array(W);
  mapper.fill(y, y + 1, xs, ys);
  return { x: xs[x]!, y: ys[x]! };
}

describe("sourceMapper", () => {
  it("is the plain perspective transform without a shift map", () => {
    expect(sample(null, 0, 0)).toMatchObject({ x: 10, y: 20 });
    const p = sample(null, 123, 45);
    expect(p.x).toBeCloseTo(133, 3);
    expect(p.y).toBeCloseTo(65, 3);
  });

  it("moves each output pixel down by the shift before the transform", () => {
    const constant: ShiftMap = { columns: 2, rows: 1, shifts: Float32Array.from([0.02, 0.02]) };
    expect(sample(constant, 50, 100).y).toBeCloseTo(20 + 100 + 0.02 * H, 3);
    expect(sample(constant, 50, 100).x).toBeCloseTo(60, 3);
  });

  it("interpolates the map across and down the page", () => {
    const ramp: ShiftMap = { columns: 2, rows: 2, shifts: Float32Array.from([0, 0.02, 0.04, 0.04]) };
    // Across: halfway between 0 and 0.02 in the first row (held above its centre).
    expect(sample(ramp, W / 2, 0).y - 20).toBeCloseTo(0.01 * H, 3);
    // Down: halfway between the row centres at v = 0.25 and 0.75, left edge.
    expect(sample(ramp, 0, H / 2).y - 20 - H / 2).toBeCloseTo(0.02 * H, 3);
  });

  it("sends points outside the page outline off the photo, keeping those inside", () => {
    // The page is the left half of the sampled area.
    const page: Quad = [QUAD[0], { x: 10 + W / 2, y: 20 }, { x: 10 + W / 2, y: 20 + H - 1 }, QUAD[3]];
    for (const outline of [page, [page[0], page[3], page[2], page[1]] as Quad]) {
      const mapper = sourceMapper(QUAD, W, H, null, outline)!;
      const xs = new Float32Array(W), ys = new Float32Array(W);
      mapper.fill(100, 101, xs, ys);
      expect([xs[50], ys[50]]).toEqual([60, 120]);
      expect([xs[300], ys[300]]).toEqual([OUTSIDE, OUTSIDE]);
    }
  });

  it("returns null for degenerate corners", () => {
    const p = { x: 1, y: 1 };
    expect(sourceMapper([p, p, p, p], W, H, null)).toBeNull();
  });
});

describe("validateShiftMap", () => {
  it("accepts a well-formed map", () => {
    expect(validateShiftMap({ columns: 2, rows: 1, shifts: Float32Array.from([0, 0.01]) }).ok).toBe(true);
  });
  it.each([
    ["a grid too small", { columns: 1, rows: 1, shifts: Float32Array.from([0]) }],
    ["a size mismatch", { columns: 2, rows: 2, shifts: Float32Array.from([0, 0]) }],
    ["a non-finite value", { columns: 2, rows: 1, shifts: Float32Array.from([0, Number.NaN]) }],
    ["an implausible value", { columns: 2, rows: 1, shifts: Float32Array.from([0, 0.5]) }],
  ])("rejects %s", (_, map) => {
    expect(validateShiftMap(map)).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  });
});
