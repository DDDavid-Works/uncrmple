import type { Quad } from "../../types/repair";
import { fullFrameQuad, interiorAngles, isConvex, isPlausiblePage, orderCorners, outputSize, polygonArea, scaleQuad, validateQuad } from "./geometry";

const rect: Quad = [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 160 }, { x: 10, y: 160 }];

describe("orderCorners", () => {
  it("orders shuffled points as TL, TR, BR, BL", () => {
    const [tl, tr, br, bl] = rect;
    expect(orderCorners([br, tl, bl, tr])).toEqual([tl, tr, br, bl]);
  });
  it("handles a skewed page", () => {
    const tl = { x: 150, y: 90 }, tr = { x: 660, y: 130 }, br = { x: 630, y: 520 }, bl = { x: 110, y: 470 };
    expect(orderCorners([bl, tr, tl, br])).toEqual([tl, tr, br, bl]);
  });
  it("rejects wrong point counts", () => {
    expect(() => orderCorners(rect.slice(0, 3))).toThrow();
  });
});

describe("polygonArea / isConvex", () => {
  it("computes area", () => expect(polygonArea(rect)).toBe(100 * 150));
  it("detects convex and bow-tie shapes", () => {
    expect(isConvex(rect)).toBe(true);
    expect(isConvex([rect[0], rect[2], rect[1], rect[3]])).toBe(false);
  });
});

describe("outputSize", () => {
  it("uses the longer opposite edges", () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 120, y: 200 }, { x: 0, y: 190 }];
    // top = 100, bottom = hypot(120, 10) ≈ 120.4; left = 190, right = hypot(20, 200) ≈ 201.0
    expect(outputSize(q)).toEqual({ width: 120, height: 201 });
  });
  it("scales down to the pixel budget keeping aspect ratio", () => {
    const big: Quad = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 0, y: 2000 }];
    const s = outputSize(big, 2_000_000);
    expect(s.width * s.height).toBeLessThanOrEqual(2_000_000 * 1.01);
    expect(s.width / s.height).toBeCloseTo(2, 1);
  });
});

describe("validateQuad", () => {
  it("accepts a sensible quad", () => expect(validateQuad(rect, 200, 200).ok).toBe(true));
  it("rejects out-of-bounds, non-finite, crossed and tiny quads", () => {
    expect(validateQuad(rect, 100, 100).ok).toBe(false);
    expect(validateQuad([{ x: NaN, y: 0 }, rect[1], rect[2], rect[3]], 200, 200).ok).toBe(false);
    expect(validateQuad([rect[0], rect[2], rect[1], rect[3]], 200, 200).ok).toBe(false);
    const tiny: Quad = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
    expect(validateQuad(tiny, 200, 200)).toMatchObject({ ok: false, error: { code: "invalid-corners" } });
  });
  it("accepts the whole image scaled to a smaller copy, despite rounding past its border", () => {
    // 1312 × 773/1312 is 773.0000000000001 in floating point.
    const scaled = scaleQuad(fullFrameQuad(1312, 2038), 773 / 1312, 1200 / 2038);
    expect(scaled[1].x).toBeGreaterThan(773);
    expect(validateQuad(scaled, 773, 1200).ok).toBe(true);
    expect(validateQuad(scaleQuad(rect, 1.01, 1), 110, 200).ok).toBe(false);
  });
});

describe("isPlausiblePage", () => {
  it("accepts upright and steeply photographed pages", () => {
    expect(isPlausiblePage(rect)).toBe(true);
    // A page shot at a steep angle: strong keystone, far side ~0.6 of the near side.
    const steep: Quad = [{ x: 220, y: 100 }, { x: 580, y: 100 }, { x: 700, y: 500 }, { x: 100, y: 500 }];
    expect(isPlausiblePage(steep)).toBe(true);
  });
  it("accepts corners in any cyclic order", () => {
    expect(isPlausiblePage([rect[2], rect[3], rect[0], rect[1]])).toBe(true);
  });
  it("rejects a sliver corner", () => {
    // Corners from a real failed detection (e0fad2ed): the outline cuts diagonally across the page.
    const sliver: Quad = [{ x: 0, y: 0 }, { x: 1006, y: 0 }, { x: 996, y: 1634 }, { x: 0, y: 781 }];
    expect(Math.min(...interiorAngles(sliver))).toBeLessThan(55);
    expect(isPlausiblePage(sliver)).toBe(false);
  });
  it("rejects opposite sides of very different length", () => {
    const wedge: Quad = [{ x: 350, y: 100 }, { x: 450, y: 100 }, { x: 700, y: 500 }, { x: 100, y: 500 }];
    expect(isPlausiblePage(wedge)).toBe(false);
  });
  it("rejects crossed or degenerate outlines", () => {
    expect(isPlausiblePage([rect[0], rect[2], rect[1], rect[3]])).toBe(false);
    expect(isPlausiblePage([rect[0], rect[0], rect[2], rect[3]])).toBe(false);
  });
});

describe("scaleQuad", () => {
  it("scales without mutating", () => {
    const s = scaleQuad(rect, 2, 3);
    expect(s[2]).toEqual({ x: 220, y: 480 });
    expect(rect[2]).toEqual({ x: 110, y: 160 });
  });
});
