import type { Quad } from "../../types/repair";
import type { Gray } from "./boundary";
import { pivotSides } from "./pivot";

const W = 400, H = 400;

/**
 * Dark table (60); a second sheet (215) at x, y 200..340; the page (200) on top of it at x 100..300,
 * y 50..300. Faint print on the page so it is not flat.
 */
function scene(): Gray {
  const data = new Uint8Array(W * H).fill(60);
  for (let y = 200; y < 340; y++) for (let x = 200; x < 340; x++) data[y * W + x] = 215;
  for (let y = 50; y < 300; y++) for (let x = 100; x < 300; x++) data[y * W + x] = 200;
  for (let y = 80; y < 280; y += 12) for (let x = 120; x < 280; x++) if (x % 5 < 3) data[y * W + x] = 40;
  return { data, width: W, height: H };
}

/** The outline traced around the page and the sheet together, its corner on the sheet's far corner. */
const MERGED: Quad = [{ x: 100, y: 50 }, { x: 299, y: 50 }, { x: 339, y: 339 }, { x: 100, y: 299 }];

describe("pivotSides", () => {
  it("turns sides that run on over another sheet onto the page's faint edge", () => {
    const out = pivotSides(MERGED, scene());
    expect(out[0]).toEqual(MERGED[0]);
    expect(out[1]).toEqual(MERGED[1]);
    expect(out[3]).toEqual(MERGED[3]);
    expect(Math.abs(out[2].x - 300)).toBeLessThanOrEqual(3);
    expect(Math.abs(out[2].y - 300)).toBeLessThanOrEqual(3);
  });

  it("leaves an outline whose sides are on the page edges alone", () => {
    const onPage: Quad = [{ x: 100, y: 50 }, { x: 299, y: 50 }, { x: 299, y: 299 }, { x: 100, y: 299 }];
    expect(pivotSides(onPage, scene())).toBe(onPage);
  });

  it("only ever takes area off: it never turns a side outward onto an edge beyond the outline", () => {
    // The traced top side lies on the paper with no step under it (as when a receipt's top
    // corners are clipped and the outline joins the bottoms of the cuts). The only step a turn can
    // find runs out from its right end, beyond the outline. On a real photo that was wood grain, and
    // following it tilted the whole page; moving outward is not what pivoting is for.
    const data = new Uint8Array(W * H).fill(60);
    const top = (x: number) => 80 - (40 * (300 - x)) / 200; // from (300, 80) up to (100, 40)
    for (let y = 0; y < H; y++) for (let x = 100; x < 300; x++) if (y >= top(x) && y < 300) data[y * W + x] = 200;
    const traced: Quad = [{ x: 100, y: 80 }, { x: 299, y: 80 }, { x: 299, y: 299 }, { x: 100, y: 299 }];
    expect(pivotSides(traced, { data, width: W, height: H })).toBe(traced);
  });

  it("leaves sides alone when there is no edge to turn them to", () => {
    const blank: Gray = { data: new Uint8Array(W * H).fill(200), width: W, height: H };
    expect(pivotSides(MERGED, blank)).toBe(MERGED);
  });
});
