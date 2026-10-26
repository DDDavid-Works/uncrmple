import { trimBackground } from "./refine";
import type { Quad } from "../../types/repair";

const W = 200;
const H = 300;

/** Paper mask: 1 inside the given rectangle, 0 elsewhere. */
function rectMask(x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1;
  return m;
}
const rect = (x0: number, y0: number, x1: number, y1: number): Quad => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

describe("trimBackground", () => {
  it("leaves a quad that already hugs the page unchanged", () => {
    const q = rect(20, 30, 180, 270);
    expect(trimBackground(q, rectMask(20, 30, 180, 270), W, H)).toEqual(q);
  });

  it("pulls in a side that has a strip of background inside it", () => {
    // Quad spans x 10..190 but the page only occupies x 18..190.
    const trimmed = trimBackground(rect(10, 30, 190, 270), rectMask(18, 30, 190, 270), W, H);
    expect(trimmed[0].x).toBeCloseTo(18, 0);
    expect(trimmed[3].x).toBeCloseTo(18, 0);
    expect(trimmed[1].x).toBeCloseTo(190, 0);
    expect(trimmed[0].y).toBeCloseTo(30, 0);
    expect(trimmed[2].y).toBeCloseTo(270, 0);
  });

  it("trims several sides independently", () => {
    const trimmed = trimBackground(rect(10, 20, 190, 280), rectMask(18, 26, 184, 280), W, H);
    expect(trimmed[0]).toMatchObject({ x: expect.closeTo(18, 0), y: expect.closeTo(26, 0) });
    expect(trimmed[1].x).toBeGreaterThan(182);
    expect(trimmed[2].y).toBeCloseTo(280, 0);
  });

  it("does nothing when the mask cannot tell paper from background", () => {
    const q = rect(10, 30, 190, 270);
    expect(trimBackground(q, new Uint8Array(W * H).fill(1), W, H)).toEqual(q);
  });

  it("does not eat into the page when the mask shows no page beyond the trim limit", () => {
    // Everything is background: no side finds paper within the allowed trim, so nothing moves.
    const q = rect(10, 30, 190, 270);
    expect(trimBackground(q, new Uint8Array(W * H), W, H)).toEqual(q);
  });

  it("ignores a small bulge that covers less than the strip share", () => {
    const m = rectMask(10, 30, 190, 270);
    // About 8% of the sampled left side is background: below the 10% tolerance, so no trim.
    for (let y = 100; y < 115; y++) for (let x = 10; x < 20; x++) m[y * W + x] = 0;
    const q = rect(10, 30, 190, 270);
    expect(trimBackground(q, m, W, H)).toEqual(q);
  });
});
