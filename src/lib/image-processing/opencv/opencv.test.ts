// @vitest-environment node
import type { Quad } from "../../../types/repair";
import { pagePhoto, sameBytes, solid } from "../../../tests/synthetic";
import { polygonArea } from "../geometry";
import { assessPhoto } from "../assessment/assess";
import { repair } from "../pipeline";
import { createOpenCvProcessor } from "./processor";

const W = 800, H = 600;
const PAGE: Quad = [{ x: 150, y: 90 }, { x: 660, y: 130 }, { x: 630, y: 520 }, { x: 110, y: 470 }];
const processor = createOpenCvProcessor();

describe("OpenCV engine on a synthetic skewed page", () => {
  it("detects the four corners", async () => {
    const r = await processor.detectDocument(pagePhoto(W, H, PAGE));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.value.corners.forEach((c, i) => {
      expect(Math.hypot(c.x - PAGE[i]!.x, c.y - PAGE[i]!.y)).toBeLessThan(8);
    });
    expect(r.value.areaFraction).toBeCloseTo(polygonArea(PAGE) / (W * H), 1);
  }, 120_000);

  it("produces an upright page with no background at the edges", async () => {
    const photo = pagePhoto(W, H, PAGE);
    const copy = photo.data.slice();
    // This page's stripes are drawn level in the photo, not on the page, so levelling would rotate
    // (and enlarge) the output; this test is about the perspective warp alone.
    const r = await repair(processor, photo, { deskew: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { image } = r.value;
    // Expected size ~ edge lengths of the page.
    expect(image.width).toBeGreaterThan(480);
    expect(image.width).toBeLessThan(540);
    expect(image.height).toBeGreaterThan(370);
    expect(image.height).toBeLessThan(420);
    // Interior of the border ring must be paper, not dark background (allow thin text rows).
    let bright = 0, total = 0;
    for (let x = 6; x < image.width - 6; x++) {
      for (const y of [6, image.height - 7]) {
        total++;
        if (image.data[(y * image.width + x) * 4]! > 150) bright++;
      }
    }
    expect(bright / total).toBeGreaterThan(0.6);
    expect(sameBytes(photo.data, copy)).toBe(true); // source untouched
  }, 120_000);

  it("reports no page for a featureless image rather than succeeding", async () => {
    const r = await repair(processor, solid(W, H, 128));
    expect(r).toMatchObject({ ok: false, error: { code: "no-document-found" } });
  }, 120_000);

  it("assesses the page with the real engine without modifying the photo", async () => {
    const photo = pagePhoto(W, H, PAGE);
    const copy = photo.data.slice();
    const r = await assessPhoto(processor, photo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pageDetected).toBe(true);
    expect(r.value.findings.map((f) => f.dimension)).toEqual([
      "geometry", "lighting", "sharpness", "resolution", "completeness", "readability",
    ]);
    expect(r.value.findings.find((f) => f.dimension === "geometry")?.level).not.toBe("poor");
    expect(sameBytes(photo.data, copy)).toBe(true);
  }, 120_000);

  it("rejects invalid corners at the engine level", async () => {
    const r = await processor.correctPerspective(solid(W, H, 200), [PAGE[0], PAGE[2], PAGE[1], PAGE[3]]);
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-corners" } });
  }, 120_000);
});
