// @vitest-environment node
import { SHADOW, lum, sameBytes, shadowedPage } from "../../../tests/synthetic";
import { createOpenCvProcessor } from "./processor";

const processor = createOpenCvProcessor();
const { block, textY } = SHADOW;
// A pixel inside a text stroke at the bright (left) and shadowed (right) ends: x % 8 < 5.
const TEXT_LEFT = { x: 48, y: textY + 1 };
const TEXT_RIGHT = { x: 744, y: textY + 1 };
const PAPER_LEFT = { x: 70, y: 40 };
const PAPER_RIGHT = { x: 730, y: 40 };
const BLOCK = { x: block.x + 30, y: block.y + 30 };

async function run(style: "color" | "grayscale" | "blackwhite") {
  const src = shadowedPage();
  const copy = src.data.slice();
  const r = await processor.enhance(src, { style });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  expect(sameBytes(src.data, copy)).toBe(true); // source untouched
  expect(r.value.width).toBe(src.width);
  expect(r.value.height).toBe(src.height);
  return { src, out: r.value };
}

describe("enhance on a shadowed, colour-cast page", () => {
  it("colour: evens the shadow, neutralises the cast and keeps text and dark areas dark", async () => {
    const { src, out } = await run("color");
    // Before: right side much darker than left.
    expect(lum(src, PAPER_LEFT.x, PAPER_LEFT.y) - lum(src, PAPER_RIGHT.x, PAPER_RIGHT.y)).toBeGreaterThan(60);
    // After: both ends are near-white and equal.
    const l = lum(out, PAPER_LEFT.x, PAPER_LEFT.y), r = lum(out, PAPER_RIGHT.x, PAPER_RIGHT.y);
    expect(l).toBeGreaterThan(235);
    expect(r).toBeGreaterThan(235);
    expect(Math.abs(l - r)).toBeLessThan(12);
    // Blue cast removed on the paper.
    const i = (PAPER_RIGHT.y * out.width + PAPER_RIGHT.x) * 4;
    expect(Math.abs(out.data[i]! - out.data[i + 2]!)).toBeLessThan(12);
    // Text stays dark on both the bright and the shadowed side; the black block is not bleached.
    expect(lum(out, TEXT_LEFT.x, TEXT_LEFT.y)).toBeLessThan(80);
    expect(lum(out, TEXT_RIGHT.x, TEXT_RIGHT.y)).toBeLessThan(110);
    expect(lum(out, BLOCK.x, BLOCK.y)).toBeLessThan(80);
  }, 120_000);

  it("grayscale: equal channels, flat white paper, dark text", async () => {
    const { out } = await run("grayscale");
    for (let p = 0; p < out.width * out.height; p += 997) {
      expect(out.data[p * 4]).toBe(out.data[p * 4 + 1]);
      expect(out.data[p * 4]).toBe(out.data[p * 4 + 2]);
    }
    expect(lum(out, PAPER_RIGHT.x, PAPER_RIGHT.y)).toBeGreaterThan(235);
    expect(lum(out, TEXT_RIGHT.x, TEXT_RIGHT.y)).toBeLessThan(110);
  }, 120_000);

  it("black and white: only pure black or white, paper white on both sides, text black", async () => {
    const { out } = await run("blackwhite");
    for (let p = 0; p < out.width * out.height; p += 331) {
      const v = out.data[p * 4]!;
      expect(v === 0 || v === 255).toBe(true);
      expect(out.data[p * 4 + 3]).toBe(255);
    }
    expect(lum(out, PAPER_LEFT.x, PAPER_LEFT.y)).toBe(255);
    expect(lum(out, PAPER_RIGHT.x, PAPER_RIGHT.y)).toBe(255);
    expect(lum(out, TEXT_LEFT.x, TEXT_LEFT.y)).toBe(0);
    expect(lum(out, TEXT_RIGHT.x, TEXT_RIGHT.y)).toBe(0);
    expect(lum(out, BLOCK.x, BLOCK.y)).toBe(0);
  }, 120_000);

  it("rejects an unknown style at the engine level", async () => {
    const r = await processor.enhance(shadowedPage(), { style: "sepia" as never });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  }, 120_000);
});
