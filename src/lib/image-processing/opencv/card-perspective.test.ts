// @vitest-environment node
import type { Quad, RasterImage } from "../../../types/repair";
import { cardPhoto } from "../../../tests/card-synthetic";
import { sameBytes, solid } from "../../../tests/synthetic";
import { detectCardCorners } from "../card-pipeline";
import { estimateAspectRatio } from "../card-geometry";
import { outputSize } from "../geometry";
import { createOpenCvProcessor } from "./processor";

const W = 800, H = 600;
const processor = createOpenCvProcessor();
const T = 120_000;
const BODY = [235, 238, 228];

/** ID-1 proportions (85.6 x 54 mm = 1.585), near straight-on: 400 x 252. */
const STRAIGHT: Quad = [{ x: 200, y: 180 }, { x: 600, y: 180 }, { x: 600, y: 432 }, { x: 200, y: 432 }];
const TILTED: Quad = [{ x: 170, y: 140 }, { x: 610, y: 190 }, { x: 570, y: 450 }, { x: 140, y: 400 }];

const px = (img: RasterImage, x: number, y: number) => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
};
const near = (a: number[], b: number[], tol: number) => a.every((v, k) => Math.abs(v - b[k]!) <= tol);

/**
 * The complete card is kept when the pixels just inside each edge, away from rounded corners and
 * printed details, are card body and not background: nothing was cropped off, nothing was left over.
 */
function edgesAreCardBody(img: RasterImage, inset = 5) {
  const { width: w, height: h } = img;
  return [
    px(img, w * 0.5, inset), px(img, w * 0.5, h - 1 - inset),
    px(img, inset, h * 0.5), px(img, w - 1 - inset, h * 0.5),
    px(img, w * 0.25, h - 1 - inset), px(img, w * 0.75, h - 1 - inset),
  ].every((p) => near(p, BODY, 30));
}

describe("card perspective correction", () => {
  it("straightens a straight-on card to ID-1 proportions with all four edges intact", async () => {
    const photo = cardPhoto(W, H, STRAIGHT);
    const copy = photo.data.slice();
    const r = await processor.correctPerspective(photo, STRAIGHT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.value.width - 400)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.value.height - 252)).toBeLessThanOrEqual(1);
    expect(r.value.width / r.value.height).toBeCloseTo(1.585, 1);
    expect(edgesAreCardBody(r.value)).toBe(true);
    expect(sameBytes(photo.data, copy)).toBe(true); // original untouched
  }, T);

  it("rectifies a tilted card: upright, card-shaped, no background along the edges", async () => {
    const r = await processor.correctPerspective(cardPhoto(W, H, TILTED), TILTED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(edgesAreCardBody(r.value)).toBe(true);
    // Printed layout is upright afterwards: header band across the top, portrait at lower left.
    const { width: w, height: h } = r.value;
    expect(near(px(r.value, w * 0.5, h * 0.12), [30, 90, 160], 40)).toBe(true);
    expect(near(px(r.value, w * 0.18, h * 0.6), [150, 120, 100], 40)).toBe(true);
    expect(near(px(r.value, w * 0.9, h * 0.6), BODY, 30)).toBe(true);
  }, T);

  it("keeps the full card including its borders after automatic detection", async () => {
    const photo = cardPhoto(W, H, TILTED, { noise: 4 });
    const detected = await detectCardCorners(processor, photo);
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    const r = await processor.correctPerspective(photo, detected.value.corners);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Detection error must not shave content: the edge ring stays card body, with no wide
    // background strip either (checked at a deeper inset on the near-edge side).
    expect(edgesAreCardBody(r.value, 8)).toBe(true);
    const truth = outputSize(TILTED);
    expect(Math.abs(r.value.width - truth.width) / truth.width).toBeLessThan(0.03);
    expect(Math.abs(r.value.height - truth.height) / truth.height).toBeLessThan(0.03);
  }, T);

  it("derives proportions from geometry, not a fixed ratio", async () => {
    const square: Quad = [{ x: 250, y: 150 }, { x: 550, y: 150 }, { x: 550, y: 450 }, { x: 250, y: 450 }];
    const r = await processor.correctPerspective(cardPhoto(W, H, square), square);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.width).toBe(r.value.height);
    expect(estimateAspectRatio(square)).toBeCloseTo(1);
  }, T);

  it("handles a rotated (portrait) card without cropping", async () => {
    const portrait: Quad = [{ x: 300, y: 100 }, { x: 552, y: 100 }, { x: 552, y: 500 }, { x: 300, y: 500 }];
    const r = await processor.correctPerspective(cardPhoto(W, H, portrait), portrait);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.height).toBeGreaterThan(r.value.width);
  }, T);
});

describe("invalid manual corners", () => {
  const photo = solid(W, H, 200);
  const cases: [string, Quad][] = [
    ["crossed (bow-tie) corners", [STRAIGHT[0], STRAIGHT[2], STRAIGHT[1], STRAIGHT[3]]],
    ["a corner outside the photo", [{ x: -5, y: 180 }, STRAIGHT[1], STRAIGHT[2], STRAIGHT[3]]],
    ["a corner beyond the far edge", [STRAIGHT[0], { x: W + 1, y: 180 }, STRAIGHT[2], STRAIGHT[3]]],
    ["NaN coordinates", [{ x: NaN, y: 180 }, STRAIGHT[1], STRAIGHT[2], STRAIGHT[3]]],
    ["infinite coordinates", [STRAIGHT[0], { x: Infinity, y: 180 }, STRAIGHT[2], STRAIGHT[3]]],
    ["a degenerate (collinear) quad", [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }, { x: 400, y: 100 }]],
    ["an area too small to be a card", [{ x: 100, y: 100 }, { x: 110, y: 100 }, { x: 110, y: 110 }, { x: 100, y: 110 }]],
  ];
  it.each(cases)("rejects %s without touching the image", async (_name, quad) => {
    const copy = photo.data.slice();
    const r = await processor.correctPerspective(photo, quad);
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-corners" } });
    expect(sameBytes(photo.data, copy)).toBe(true);
  }, T);
});

describe("large images and resource limits", () => {
  it("caps the output size to the pixel budget while keeping the card shape", () => {
    const huge: Quad = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 12600 }, { x: 0, y: 12600 }];
    const size = outputSize(huge, 50_000_000);
    expect(size.width * size.height).toBeLessThanOrEqual(50_000_000 * 1.001);
    expect(size.width / size.height).toBeCloseTo(20000 / 12600, 2);
  });

  it("warps a large photo at full resolution and repeats without leaking or degrading", async () => {
    const scale = 4;
    const big = STRAIGHT.map((p) => ({ x: p.x * scale, y: p.y * scale })) as unknown as Quad;
    const photo = cardPhoto(W * scale, H * scale, big); // 3200 x 2400
    // Repeated runs would exhaust the WASM heap if Mats were not released.
    for (let i = 0; i < 4; i++) {
      const r = await processor.correctPerspective(photo, big);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(Math.abs(r.value.width - 1600)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.value.height - 1008)).toBeLessThanOrEqual(1);
      expect(edgesAreCardBody(r.value, 20)).toBe(true);
    }
  }, 240_000);

  it("a failed warp does not corrupt later ones", async () => {
    const bad = await processor.correctPerspective(solid(W, H, 1), [STRAIGHT[0], STRAIGHT[2], STRAIGHT[1], STRAIGHT[3]]);
    expect(bad.ok).toBe(false);
    const good = await processor.correctPerspective(cardPhoto(W, H, STRAIGHT), STRAIGHT);
    expect(good.ok).toBe(true);
  }, T);
});
