import { HELD_RECEIPT, heldReceiptPhoto, pagePhoto, sameBytes, solid } from "../../tests/synthetic";
import { toGray } from "./assessment/pixels";
import { stripOutlines } from "./strip";

const { width: W, height: H, left, right } = HELD_RECEIPT;
/** The straight outline closest to the bowed receipt: its corners on the photo's top and bottom. */
const EXPECTED = [
  { x: left[0], y: 0 }, { x: right[0], y: 0 }, { x: right[1], y: H }, { x: left[1], y: H },
];

describe("stripOutlines", () => {
  it("finds a hand-held receipt running off both ends, despite a thumb, a shadow and a bowed edge", () => {
    const img = heldReceiptPhoto();
    const before = new Uint8ClampedArray(img.data);
    const found = stripOutlines(toGray(img));
    expect(found).toHaveLength(1);
    found[0]!.forEach((p, i) => {
      // The bowed right edge sits up to 8 px off any straight line; the fit splits the difference.
      expect(Math.hypot(p.x - EXPECTED[i]!.x, p.y - EXPECTED[i]!.y)).toBeLessThan(10);
    });
    expect(sameBytes(img.data, before)).toBe(true);
  });

  it("finds a strip running across the photo too", () => {
    const found = stripOutlines(toGray(heldReceiptPhoto(true)));
    expect(found).toHaveLength(1);
    found[0]!.forEach((p, i) => {
      const e = EXPECTED[i]!;
      // Axes swapped: the corners come back with x and y exchanged, in the same order.
      expect(Math.hypot(p.x - e.y, p.y - e.x)).toBeLessThan(10);
    });
  });

  it("proposes nothing for a receipt that ends inside the photo, though its sides would fit a strip", () => {
    // The held receipt, but with dark surface across the top and bottom 5 percent of the photo: the
    // sides are as clear as before and reach close enough to the ends, yet nothing runs off the frame.
    const img = heldReceiptPhoto();
    for (let y = 0; y < H; y++) {
      if (y >= 0.05 * H && y < 0.95 * H) continue;
      for (let x = 0; x < W; x++) img.data.fill(30, (y * W + x) * 4, (y * W + x) * 4 + 3);
    }
    expect(stripOutlines(toGray(img))).toEqual([]);
  });

  it("proposes nothing for a page that lies wholly inside the photo, or for a plain image", () => {
    const page = pagePhoto(W, H, [{ x: 100, y: 120 }, { x: 500, y: 110 }, { x: 510, y: 690 }, { x: 90, y: 700 }]);
    expect(stripOutlines(toGray(page))).toEqual([]);
    expect(stripOutlines(toGray(solid(W, H, 200)))).toEqual([]);
  });
});
