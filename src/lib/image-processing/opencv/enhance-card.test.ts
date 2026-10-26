// @vitest-environment node
import type { CardEnhanceOptions, Quad, RasterImage } from "../../../types/repair";
import { cardPhoto } from "../../../tests/card-synthetic";
import { boxBlur, lum, sameBytes, shade } from "../../../tests/synthetic";
import { NO_CARD_ENHANCEMENT } from "../card-options";
import { createOpenCvProcessor } from "./processor";

const processor = createOpenCvProcessor();
const T = 120_000;
const W = 640, H = 404;
/** A card filling the photo (as after cropping). */
const FULL: Quad = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
const card = () => cardPhoto(W, H, FULL);
const only = (o: Partial<CardEnhanceOptions>): CardEnhanceOptions => ({ ...NO_CARD_ENHANCEMENT, ...o });

const BODY_L = { x: 600, y: 250 }; // plain card body, near the right
const BODY_R = { x: 30, y: 380 };
const HEADER = { x: 320, y: 50 }; // blue band
const PORTRAIT = { x: 110, y: 250 };

async function enhance(src: RasterImage, o: CardEnhanceOptions) {
  const copy = src.data.slice();
  const r = await processor.enhanceCard(src, o);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  expect(sameBytes(src.data, copy)).toBe(true); // input untouched
  expect(r.value.width).toBe(src.width);
  expect(r.value.height).toBe(src.height);
  return r.value;
}
const px = (img: RasterImage, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
};

describe("enhanceCard", () => {
  it("refuses to run with nothing selected instead of reporting an unchanged image as success", async () => {
    const r = await processor.enhanceCard(card(), NO_CARD_ENHANCEMENT);
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  }, T);

  it("rejects malformed options", async () => {
    const r = await processor.enhanceCard(card(), { ...NO_CARD_ENHANCEMENT, sharpen: "yes" as unknown as boolean });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  }, T);

  it("grayscale makes every channel equal and keeps the layout", async () => {
    const out = await enhance(card(), only({ grayscale: true }));
    for (const p of [BODY_L, HEADER, PORTRAIT]) {
      const [r, g, b] = px(out, p.x, p.y);
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
    expect(lum(out, HEADER.x, HEADER.y)).toBeLessThan(lum(out, BODY_L.x, BODY_L.y) - 80);
  }, T);

  it("evens a gentle lighting gradient without bleaching dark printed areas or shifting hue", async () => {
    const lit = shade(card(), (x) => 1 - 0.3 * (x / W));
    const before = lum(lit, BODY_R.x, BODY_R.y) - lum(lit, BODY_L.x, BODY_L.y);
    const out = await enhance(lit, only({ evenLighting: true }));
    const after = lum(out, BODY_R.x, BODY_R.y) - lum(out, BODY_L.x, BODY_L.y);
    expect(before).toBeGreaterThan(40);
    expect(Math.abs(after)).toBeLessThan(before * 0.6);
    // Dark header stays clearly dark and blue; portrait stays reddish-brown.
    const [hr = 0, , hb = 0] = px(out, HEADER.x, HEADER.y);
    expect(hb).toBeGreaterThan(hr + 40);
    expect(lum(out, HEADER.x, HEADER.y)).toBeLessThan(120);
    const [pr = 0, , pb = 0] = px(out, PORTRAIT.x, PORTRAIT.y);
    expect(pr).toBeGreaterThan(pb);
  }, T);

  it("stretches a flat, low-contrast card moderately and never clips the body to a hard white", async () => {
    const dull = shade(card(), () => 0.62);
    const out = await enhance(dull, only({ autoContrast: true }));
    const gain = (lum(out, BODY_L.x, BODY_L.y) - lum(out, HEADER.x, HEADER.y)) / (lum(dull, BODY_L.x, BODY_L.y) - lum(dull, HEADER.x, HEADER.y));
    expect(gain).toBeGreaterThan(1.05);
    expect(gain).toBeLessThan(1.7); // moderate, bounded stretch
  }, T);

  it("denoise reduces noise but keeps the header edge and text strokes", async () => {
    const noisy = cardPhoto(W, H, FULL, { noise: 14 });
    const spread = (img: RasterImage) => {
      const v: number[] = [];
      for (let y = 368; y < 398; y++) for (let x = 300; x < 600; x++) v.push(lum(img, x, y)); // plain card body
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length;
    };
    const out = await enhance(noisy, only({ denoise: true }));
    expect(spread(out)).toBeLessThan(spread(noisy) * 0.7);
    expect(lum(out, BODY_L.x, BODY_L.y) - lum(out, HEADER.x, HEADER.y)).toBeGreaterThan(80);
    expect(lum(out, 340, 147)).toBeLessThan(120); // a printed text stroke stays dark
  }, T);

  it("sharpens a softened edge a little and leaves flat areas alone", async () => {
    const soft = boxBlur(card(), 2, 2);
    const out = await enhance(soft, only({ sharpen: true }));
    const edge = (img: RasterImage) => Math.abs(lum(img, 320, 82) - lum(img, 320, 70)); // header lower edge (~y 76)
    expect(edge(out)).toBeGreaterThanOrEqual(edge(soft));
    expect(Math.abs(lum(out, BODY_L.x, BODY_L.y) - lum(soft, BODY_L.x, BODY_L.y))).toBeLessThan(3);
  }, T);

  it("applies every option together and releases resources across repeated runs", async () => {
    const all: CardEnhanceOptions = { evenLighting: true, autoContrast: true, denoise: true, sharpen: true, grayscale: false };
    const src = shade(cardPhoto(W, H, FULL, { noise: 6 }), (x) => 1 - 0.25 * (x / W));
    for (let i = 0; i < 6; i++) await enhance(src, all);
  }, 240_000);
});
