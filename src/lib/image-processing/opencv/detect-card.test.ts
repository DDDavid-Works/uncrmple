// @vitest-environment node
import type { Point, Quad } from "../../../types/repair";
import { cardPhoto, maxCornerError, rng } from "../../../tests/card-synthetic";
import { sameBytes, solid } from "../../../tests/synthetic";
import { detectCardCorners } from "../card-pipeline";
import { createOpenCvProcessor } from "./processor";

const W = 800, H = 600;
const processor = createOpenCvProcessor();
const T = 120_000;

/** ~ID-1 proportions (1.586), nearly straight-on. */
const STRAIGHT: Quad = [{ x: 200, y: 180 }, { x: 600, y: 182 }, { x: 599, y: 434 }, { x: 201, y: 432 }];
/** Same card tilted with clear perspective. */
const TILTED: Quad = [{ x: 170, y: 140 }, { x: 610, y: 190 }, { x: 570, y: 450 }, { x: 140, y: 400 }];

describe("detectCard on synthetic photos", () => {
  it("1. finds a nearly straight-on card and calls it ready", async () => {
    const photo = cardPhoto(W, H, STRAIGHT, { noise: 4 });
    const copy = photo.data.slice();
    const r = await processor.detectCard(photo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(maxCornerError(r.value.corners, STRAIGHT)).toBeLessThan(5);
    expect(r.value.level).toBe("ready");
    expect(r.value.aspectRatio).toBeGreaterThan(1.45);
    expect(r.value.aspectRatio).toBeLessThan(1.75);
    expect(sameBytes(photo.data, copy)).toBe(true); // source untouched
  }, T);

  it("2. finds a card with noticeable perspective", async () => {
    const r = await processor.detectCard(cardPhoto(W, H, TILTED, { noise: 4 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(maxCornerError(r.value.corners, TILTED)).toBeLessThan(5);
  }, T);

  it("3. finds the card on a cluttered, textured background", async () => {
    const rand = rng(3);
    const clutter = Array.from({ length: 9 }, () => {
      const x = rand() * W, y = rand() * H, s = 30 + rand() * 70;
      const poly: Point[] = [{ x, y }, { x: x + s, y: y + rand() * 20 }, { x: x + s * 0.8, y: y + s }, { x: x - 10, y: y + s * 0.7 }];
      return { poly, colour: [rand() * 255, rand() * 255, rand() * 255] as [number, number, number] };
    });
    const r = await processor.detectCard(cardPhoto(W, H, TILTED, { clutter, stripes: 14, noise: 6 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(maxCornerError(r.value.corners, TILTED)).toBeLessThan(8);
  }, T);

  it("4. finds a low-contrast card, asking for verification at most", async () => {
    const r = await processor.detectCard(
      cardPhoto(W, H, STRAIGHT, { background: [205, 208, 200], card: [235, 238, 228], noise: 3 }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(maxCornerError(r.value.corners, STRAIGHT)).toBeLessThan(8);
  }, T);

  it("5. with a hand over a corner, is accurate (corner inferred from the visible sides) or asks for verification", async () => {
    const finger: Point[] = [{ x: 520, y: 380 }, { x: 640, y: 380 }, { x: 650, y: 520 }, { x: 540, y: 530 }];
    const r = await processor.detectCard(
      cardPhoto(W, H, STRAIGHT, { overlays: [{ poly: finger, colour: [205, 150, 125] }], noise: 4 }),
    );
    // A confident ("ready") result must be right; otherwise it must not claim confidence.
    if (r.ok) {
      if (r.value.level === "ready") expect(maxCornerError(r.value.corners, STRAIGHT)).toBeLessThan(6);
    } else {
      expect(r.error.code).toBe("no-card-found");
    }
  }, T);

  // KNOWN FAILURE (docs/card-crop.md, limitation 3): a hand covering most of one side makes the
  // detector follow the hand's edge, and the result can still be rated "ready". it.fails keeps the
  // problem visible: this test will start failing (loudly) once the behaviour is fixed.
  it.fails("5b. KNOWN FAILURE: a hand across most of a side can still produce a confident wrong card", async () => {
    const hand: Point[] = [{ x: 260, y: 400 }, { x: 540, y: 400 }, { x: 540, y: 470 }, { x: 260, y: 470 }];
    const r = await processor.detectCard(
      cardPhoto(W, H, STRAIGHT, { overlays: [{ poly: hand, colour: [205, 150, 125] }], noise: 4 }),
    );
    if (r.ok && r.value.level === "ready") expect(maxCornerError(r.value.corners, STRAIGHT)).toBeLessThan(6);
  }, T);

  it("5c. returns corners inside the photo even when the frame cuts the card off", async () => {
    const cut: Quad = [{ x: 560, y: 180 }, { x: 960, y: 182 }, { x: 959, y: 434 }, { x: 561, y: 432 }];
    const r = await processor.detectCard(cardPhoto(W, H, cut, { noise: 4 }));
    if (r.ok) {
      for (const p of r.value.corners) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(H);
      }
    }
  }, T);

  it("6. reports no card for a featureless image", async () => {
    const r = await processor.detectCard(solid(W, H, 128));
    expect(r).toMatchObject({ ok: false, error: { code: "no-card-found" } });
  }, T);

});

describe("detectCardCorners (full-resolution pipeline)", () => {
  it("maps corners from the downscaled copy back to a large photo and keeps the source intact", async () => {
    const scale = 3;
    const bigCard = STRAIGHT.map((p) => ({ x: p.x * scale, y: p.y * scale })) as unknown as Quad;
    const photo = cardPhoto(W * scale, H * scale, bigCard);
    const copy = photo.data.slice();
    const r = await detectCardCorners(processor, photo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(maxCornerError(r.value.corners, bigCard)).toBeLessThan(5 * scale);
    expect(r.value.warnings).not.toContain("low-resolution");
    expect(sameBytes(photo.data, copy)).toBe(true);
  }, T);

  it("warns when the card would be cropped at low resolution", async () => {
    const r = await detectCardCorners(processor, cardPhoto(W, H, STRAIGHT));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings).toContain("low-resolution");
  }, T);

  it("rejects an invalid raster with a structured error", async () => {
    const r = await detectCardCorners(processor, { width: 10, height: 10, data: new Uint8ClampedArray(4) });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  });
});
