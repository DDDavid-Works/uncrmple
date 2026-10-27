import type { ImageProcessor, Quad, RasterImage } from "../../../types/repair";
import { bentTextPage, sameBytes, solid } from "../../../tests/synthetic";
import { planDewarp } from "./plan";

const W = 600, H = 800;
const QUAD: Quad = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
const curl = (x: number, y: number) => 10 * Math.sin((Math.PI * x) / W) * (0.4 + (0.6 * y) / H);
const curved = () => bentTextPage(W, H, curl).image;
const flat = () => bentTextPage(W, H, () => 0).image;

/** A processor whose warp returns `plain` without a shift map and `trial` with one. */
function fake(plain: RasterImage, trial: RasterImage | "fail"): ImageProcessor {
  return {
    detectDocument: async () => ({ ok: false, error: { code: "no-document-found", message: "unused" } }),
    enhance: async (image) => ({ ok: true, value: image }),
    async correctPerspective(_image, _quad, shift) {
      if (!shift) return { ok: true, value: plain };
      if (trial === "fail") return { ok: false, error: { code: "processing-failed", message: "engine broke" } };
      return { ok: true, value: trial };
    },
  };
}

describe("planDewarp", () => {
  it("keeps the map when the trial makes the lines clearly straighter", async () => {
    const photo = solid(W, H, 128);
    const copy = photo.data.slice();
    const r = await planDewarp(fake(curved(), flat()), photo, QUAD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map).not.toBeNull();
    expect(r.value.dewarp.applied).toBe(true);
    expect(r.value.dewarp.bendAfter!).toBeLessThan(r.value.dewarp.bendBefore! / 2);
    expect(r.value.dewarp.coverage!).toBeGreaterThan(0.5);
    expect(sameBytes(photo.data, copy)).toBe(true);
  });

  it("drops the map when the trial does not straighten the lines", async () => {
    const r = await planDewarp(fake(curved(), curved()), solid(W, H, 128), QUAD);
    expect(r.ok && r.value).toMatchObject({ map: null, dewarp: { applied: false, skipped: "not-improved" } });
  });

  it("drops the map when the trial loses the lines (a garbled page is not a straight one)", async () => {
    const r = await planDewarp(fake(curved(), solid(W, H, 230)), solid(W, H, 128), QUAD);
    expect(r.ok && r.value).toMatchObject({ map: null, dewarp: { applied: false, skipped: "not-improved" } });
  });

  it("leaves an already flat page alone without a trial", async () => {
    const r = await planDewarp(fake(flat(), "fail"), solid(W, H, 128), QUAD);
    expect(r.ok && r.value).toMatchObject({ map: null, dewarp: { applied: false, skipped: "already-flat" } });
  });

  it("does not guess on a page without lines", async () => {
    const r = await planDewarp(fake(solid(W, H, 230), "fail"), solid(W, H, 128), QUAD);
    expect(r.ok && r.value).toMatchObject({ map: null, dewarp: { applied: false, skipped: "too-little-evidence" } });
  });

  it("returns engine failures as errors", async () => {
    const r = await planDewarp(fake(curved(), "fail"), solid(W, H, 128), QUAD);
    expect(r).toMatchObject({ ok: false, error: { code: "processing-failed" } });
  });
});
