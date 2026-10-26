import type { Point } from "../../../types/repair";
import { edgeSupport } from "./detect";

const W = 400, H = 400;
const square: Point[] = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }];

/** A map with 1s on the outline of a rectangle, as a perfect "edge map". */
function outlineMap(rect: Point[]): Uint8Array {
  const m = new Uint8Array(W * H);
  const [a, , c] = rect as [Point, Point, Point, Point];
  for (let x = a.x - 1; x <= c.x + 1; x++) for (const y of [a.y, c.y]) m[y * W + x] = 1;
  for (let y = a.y - 1; y <= c.y + 1; y++) for (const x of [a.x, c.x]) m[y * W + x] = 1;
  return m;
}

describe("edgeSupport", () => {
  it("is ~1 when the outline lies on edges and 0 when there are none", () => {
    expect(edgeSupport(square, outlineMap(square), W, H)).toBeGreaterThan(0.95);
    expect(edgeSupport(square, new Uint8Array(W * H), W, H)).toBe(0);
  });

  it("is low for an outline that is far from the edges", () => {
    const shifted = square.map((p) => ({ x: p.x + 40, y: p.y + 40 }));
    expect(edgeSupport(shifted, outlineMap(square), W, H)).toBeLessThan(0.3);
  });

  it("treats sides along the image border as neutral, not as missing edges", () => {
    // Page cut off by the frame: left and bottom sides lie on the border where no edge can exist.
    const cutOff: Point[] = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 399 }, { x: 0, y: 399 }];
    const edges = new Uint8Array(W * H);
    for (let x = 100; x <= 300; x++) edges[100 * W + x] = 1; // top edge
    for (let y = 100; y <= 399; y++) edges[y * W + 300] = 1; // right edge
    const s = edgeSupport(cutOff, edges, W, H);
    expect(s).toBeGreaterThan(0.45);
    // Same quad with no edges at all must score lower than with the real ones.
    expect(edgeSupport(cutOff, new Uint8Array(W * H), W, H)).toBeLessThan(s);
  });
});
