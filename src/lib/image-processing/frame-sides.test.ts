import { describe, expect, it } from "vitest";
import type { Quad } from "../../types/repair";
import { mergeSegments } from "./card-lines";
import { snapFrameSides } from "./frame-sides";

const W = 500, H = 800;

/** An edge map with the given vertical runs of edge pixels: [x, y0, y1]. */
function edgeMap(runs: [number, number, number][]): Uint8Array {
  const map = new Uint8Array(W * H);
  for (const [x, y0, y1] of runs) for (let y = y0; y <= y1; y++) map[y * W + x] = 255;
  return map;
}

/** A page whose left side the detector left on the frame; the real edge is a faint line at x = 16. */
const ON_FRAME: Quad = [{ x: 0, y: 30 }, { x: 480, y: 30 }, { x: 480, y: 780 }, { x: 2, y: 780 }];
const faintEdge = mergeSegments([{ x1: 16, y1: 60, x2: 16, y2: 760 }]);

describe("snapFrameSides", () => {
  it("moves a side on the frame in to a faint straight edge with blank background outside it", () => {
    const moved = snapFrameSides(ON_FRAME, faintEdge, edgeMap([[16, 60, 760]]), W, H);
    expect(moved[0].x).toBeCloseTo(16, 0);
    expect(moved[3].x).toBeCloseTo(16, 0);
    // The other corners and sides stay.
    expect(moved[1]).toEqual(ON_FRAME[1]);
    expect(moved[2]).toEqual(ON_FRAME[2]);
    expect(moved[0].y).toBeCloseTo(30, 0);
    expect(moved[3].y).toBeCloseTo(780, 0);
  });

  it("keeps the side when there is print or another edge between the line and the frame", () => {
    // A printed border at x = 16 with the page's own edge (or text) at x = 8 outside it.
    const edges = edgeMap([[16, 60, 760], [8, 40, 770]]);
    expect(snapFrameSides(ON_FRAME, faintEdge, edges, W, H)).toBe(ON_FRAME);
  });

  it("never moves a side that is not on the frame", () => {
    const inside: Quad = [{ x: 60, y: 30 }, { x: 480, y: 30 }, { x: 480, y: 780 }, { x: 60, y: 780 }];
    const line = mergeSegments([{ x1: 70, y1: 60, x2: 70, y2: 760 }]);
    expect(snapFrameSides(inside, line, edgeMap([[70, 60, 760]]), W, H)).toBe(inside);
  });

  it("ignores short lines and lines at a different angle", () => {
    const short = mergeSegments([{ x1: 16, y1: 300, x2: 16, y2: 500 }]);
    expect(snapFrameSides(ON_FRAME, short, edgeMap([[16, 300, 500]]), W, H)).toBe(ON_FRAME);
    const slanted = mergeSegments([{ x1: 10, y1: 60, x2: 22 + 100, y2: 760 }]);
    expect(snapFrameSides(ON_FRAME, slanted, new Uint8Array(W * H), W, H)).toBe(ON_FRAME);
  });
});
