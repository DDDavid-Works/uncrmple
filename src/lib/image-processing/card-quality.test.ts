import type { Quad } from "../../types/repair";
import { cardPhoto } from "../../tests/card-synthetic";
import { boxBlur, sameBytes, solid } from "../../tests/synthetic";
import { measureCardQuality } from "./card-quality";

const W = 640, H = 404;
const FULL: Quad = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];

describe("measureCardQuality", () => {
  it("reports nothing for a sharp, evenly lit card", () => {
    expect(measureCardQuality(cardPhoto(W, H, FULL))).toEqual([]);
  });

  it("reports blur for a heavily blurred card, and not for a lightly blurred one", () => {
    const sharp = cardPhoto(W, H, FULL);
    expect(measureCardQuality(boxBlur(sharp, 14, 3))).toContain("blur");
    expect(measureCardQuality(boxBlur(sharp, 1, 1))).not.toContain("blur");
  });

  it("reports glare for a large blown-out patch but not a tiny speck", () => {
    const glare = cardPhoto(W, H, FULL, {
      overlays: [{ poly: [{ x: 300, y: 200 }, { x: 560, y: 200 }, { x: 560, y: 340 }, { x: 300, y: 340 }], colour: [255, 255, 255] }],
    });
    expect(measureCardQuality(glare)).toContain("glare");
    const speck = cardPhoto(W, H, FULL, {
      overlays: [{ poly: [{ x: 300, y: 200 }, { x: 320, y: 200 }, { x: 320, y: 215 }, { x: 300, y: 215 }], colour: [255, 255, 255] }],
    });
    expect(measureCardQuality(speck)).not.toContain("glare");
  });

  it("does not modify the image and handles tiny images", () => {
    const img = cardPhoto(W, H, FULL);
    const copy = img.data.slice();
    measureCardQuality(img);
    expect(sameBytes(img.data, copy)).toBe(true);
    expect(() => measureCardQuality(solid(4, 4, 100))).not.toThrow();
  });
});
