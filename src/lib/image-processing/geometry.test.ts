import type { Quad } from "../../types/repair";
import { isConvex, orderCorners, outputSize, polygonArea, scaleQuad, validateQuad } from "./geometry";

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
});

describe("scaleQuad", () => {
  it("scales without mutating", () => {
    const s = scaleQuad(rect, 2, 3);
    expect(s[2]).toEqual({ x: 220, y: 480 });
    expect(rect[2]).toEqual({ x: 110, y: 160 });
  });
});
