import type { Quad } from "../../types/repair";
import type { Gray } from "./boundary";
import { mergeSegments } from "./card-lines";
import { extendSides } from "./extend";

const W = 400, H = 400;
/** Page paper (230) spans x 100..300, y 50..350. */
const PAGE_TOP = 50;
/** The detector stopped at a printed band whose top is here. */
const BAND_TOP = 100;
const STOPPED: Quad = [{ x: 100, y: BAND_TOP }, { x: 300, y: BAND_TOP }, { x: 300, y: 350 }, { x: 100, y: 350 }];

/** Scene: background `bg`, the page, a grey band at 100..115, and print in the header if `header`. */
function scene(bg: number, header: boolean): Gray {
  const data = new Uint8Array(W * H).fill(bg);
  const set = (x: number, y: number, v: number) => (data[y * W + x] = v);
  for (let y = PAGE_TOP; y < 350; y++) for (let x = 100; x < 300; x++) set(x, y, 230);
  for (let y = BAND_TOP; y < 115; y++) for (let x = 100; x < 300; x++) set(x, y, 170);
  // A line of header text, 8 px tall.
  if (header) for (const top of [70]) for (let y = top; y < top + 8; y++) for (let x = 120; x < 280; x++) if (x % 6 < 4) set(x, y, 40);
  // Body text, so the paper level is measured on a realistic page.
  for (let y = 140; y < 330; y += 20) for (let x = 120; x < 280; x++) if (x % 6 < 4) set(x, y, 40);
  return { data, width: W, height: H };
}

const horizontal = (y: number, x1 = 100, x2 = 300) => mergeSegments([{ x1, y1: y, x2, y2: y }])[0]!;

describe("extendSides", () => {
  it("moves a side stopped at a printed band out to the page edge", () => {
    const out = extendSides(STOPPED, [horizontal(PAGE_TOP), horizontal(BAND_TOP)], scene(60, true));
    expect(out[0].y).toBeCloseTo(PAGE_TOP, 0);
    expect(out[1].y).toBeCloseTo(PAGE_TOP, 0);
    expect(out[2]).toEqual(STOPPED[2]); // other sides untouched
  });

  it("uses a short straight run of a curled edge", () => {
    const out = extendSides(STOPPED, [horizontal(PAGE_TOP, 120, 150)], scene(60, true));
    expect(out[0].y).toBeCloseTo(PAGE_TOP, 0);
  });

  it("does not move a side across blank table, even a white one", () => {
    // The page itself ends at the band; beyond it is white table up to a line at y = 50.
    const g = scene(60, false);
    for (let y = 0; y < BAND_TOP; y++) for (let x = 0; x < W; x++) g.data[y * W + x] = 230;
    expect(extendSides(STOPPED, [horizontal(PAGE_TOP)], g)).toBe(STOPPED);
  });

  it("does not move a side across dark background", () => {
    const g = scene(60, true);
    for (let y = 0; y < BAND_TOP; y++) for (let x = 0; x < W; x++) g.data[y * W + x] = 60;
    expect(extendSides(STOPPED, [horizontal(PAGE_TOP)], g)).toBe(STOPPED);
  });

  it("follows an edge that is not parallel to the print", () => {
    // The real edge tilts ~8 degrees against the band: 50 px out on the left, 22 px on the right.
    const tilted = mergeSegments([{ x1: 100, y1: 50, x2: 300, y2: 78 }])[0]!;
    const out = extendSides(STOPPED, [tilted], scene(60, true));
    expect(out[0].y).toBeCloseTo(50, 0);
    expect(out[1].y).toBeCloseTo(78, 0);
  });

  it("does not take a tilted line that crosses the side and would cut into the page", () => {
    // Midpoint 10 px outside the side, but the right end 5 px inside it.
    const crossing = mergeSegments([{ x1: 100, y1: 75, x2: 300, y2: 105 }])[0]!;
    // Plain paper below the side too, so the strip test alone would accept the move.
    const g = scene(60, false);
    for (let y = BAND_TOP; y < 115; y++) for (let x = 100; x < 300; x++) g.data[y * W + x] = 230;
    // Sparse print in the thin strip, enough for "has print" but not to fail "mostly paper".
    for (let y = 89; y < 93; y++) for (let x = 120; x < 200; x++) if (x % 12 < 3) g.data[y * W + x] = 40;
    expect(extendSides(STOPPED, [crossing], g)).toBe(STOPPED);
  });

  it("ignores lines that are not parallel or too far out", () => {
    const g = scene(60, true);
    const steep = mergeSegments([{ x1: 100, y1: 90, x2: 300, y2: 40 }])[0]!; // ~14 degrees off
    expect(extendSides(STOPPED, [steep], g)).toBe(STOPPED);
    expect(extendSides(STOPPED, [horizontal(5)], g)).toBe(STOPPED); // beyond a third of the page height
  });
});
