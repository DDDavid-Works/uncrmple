import type { Quad } from "../../types/repair";
import { boundaryContrast, lineStep } from "./boundary";
import type { Gray } from "./boundary";
import { mergeSegments } from "./card-lines";

const W = 400, H = 300;
/** Paper (230) covering x 100..300, y 50..250 on a dark (60) background. */
const PAGE: Quad = [{ x: 100, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 250 }, { x: 100, y: 250 }];
/** A printed box inside the page: 2 px ink (40) on paper. */
const BOX: Quad = [{ x: 140, y: 90 }, { x: 260, y: 90 }, { x: 260, y: 210 }, { x: 140, y: 210 }];

function scene(): Gray {
  const data = new Uint8Array(W * H).fill(60);
  for (let y = 50; y < 250; y++) for (let x = 100; x < 300; x++) data[y * W + x] = 230;
  const ink = (x: number, y: number) => (data[y * W + x] = 40);
  for (let x = 140; x <= 260; x++) for (const y of [90, 91, 209, 210]) ink(x, y);
  for (let y = 90; y <= 210; y++) for (const x of [140, 141, 259, 260]) ink(x, y);
  return { data, width: W, height: H };
}

const line = (x1: number, y1: number, x2: number, y2: number) => mergeSegments([{ x1, y1, x2, y2 }])[0]!;

describe("lineStep", () => {
  const g = scene();
  it("is large across the edge of the page", () => {
    expect(lineStep(g, line(100, 60, 100, 240))).toBeGreaterThan(100);
  });
  it("is near zero across a printed line with paper on both sides", () => {
    expect(lineStep(g, line(140, 100, 140, 200))).toBeLessThan(3);
  });
});

describe("boundaryContrast", () => {
  const g = scene();
  it("is high for the page outline and low for a box printed on it", () => {
    expect(boundaryContrast(PAGE, g)).toBeGreaterThan(0.9);
    expect(boundaryContrast(BOX, g)).toBeLessThan(0.1);
  });
  it("treats sides whose probes leave the photo as neutral", () => {
    const full: Quad = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    expect(boundaryContrast(full, g)).toBe(0.5);
  });
});
