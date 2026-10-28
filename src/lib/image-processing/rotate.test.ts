import type { RasterImage } from "../../types/repair";
import { addQuarterTurn, rotateQuarter } from "./rotate";

/** A 3×2 image whose pixel at (x, y) has red = 10·y + x, so every pixel can be traced. */
function grid(): RasterImage {
  const width = 3, height = 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = 10 * y + x;
    data[i + 1] = 100;
    data[i + 2] = 200;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** Red channel, row by row. */
const reds = (img: RasterImage) =>
  Array.from({ length: img.height }, (_, y) => Array.from({ length: img.width }, (_, x) => img.data[(y * img.width + x) * 4]));

describe("rotateQuarter", () => {
  it("turns clockwise by 90, 180 and 270 degrees", () => {
    // Source rows: [0 1 2] / [10 11 12].
    expect(reds(rotateQuarter(grid(), 90))).toEqual([[10, 0], [11, 1], [12, 2]]);
    expect(reds(rotateQuarter(grid(), 180))).toEqual([[12, 11, 10], [2, 1, 0]]);
    expect(reds(rotateQuarter(grid(), 270))).toEqual([[2, 12], [1, 11], [0, 10]]);
  });

  it("swaps the sides on a quarter turn and keeps whole pixels", () => {
    const r = rotateQuarter(grid(), 90);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect(Array.from(r.data.slice(0, 4))).toEqual([10, 100, 200, 255]);
  });

  it("returns the image itself for no turn and never changes the input", () => {
    const g = grid();
    const copy = g.data.slice();
    expect(rotateQuarter(g, 0)).toBe(g);
    rotateQuarter(g, 90);
    expect(g.data).toEqual(copy);
  });

  it("handles pixel data that starts at an unaligned offset", () => {
    const g = grid();
    const buf = new Uint8ClampedArray(g.data.length + 1);
    buf.set(g.data, 1);
    const shifted = { ...g, data: buf.subarray(1) };
    expect(reds(rotateQuarter(shifted, 90))).toEqual([[10, 0], [11, 1], [12, 2]]);
  });

  it("adds quarter turns either way, wrapping round", () => {
    expect(addQuarterTurn(0, 90)).toBe(90);
    expect(addQuarterTurn(270, 90)).toBe(0);
    expect(addQuarterTurn(0, -90)).toBe(270);
    expect(addQuarterTurn(90, -90)).toBe(0);
  });
});
