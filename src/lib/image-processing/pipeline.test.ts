import type { ImageProcessor, Quad, RasterImage } from "../../types/repair";
import { sameBytes, solid, textSheet } from "../../tests/synthetic";
import { downscale } from "./downscale";
import { DETECTION_MAX_SIDE, repair } from "./pipeline";

const quad = (w: number, h: number): Quad => [
  { x: w * 0.1, y: h * 0.1 }, { x: w * 0.9, y: h * 0.1 }, { x: w * 0.9, y: h * 0.9 }, { x: w * 0.1, y: h * 0.9 },
];

function fakeProcessor(over: Partial<ImageProcessor> = {}): ImageProcessor & { seen: RasterImage[] } {
  const seen: RasterImage[] = [];
  return {
    seen,
    async detectDocument(image) {
      seen.push(image);
      return { ok: true, value: { corners: quad(image.width, image.height), areaFraction: 0.64, method: "edges", edgeSupport: 0.9 } };
    },
    async correctPerspective() {
      return { ok: true, value: solid(10, 10, 255) };
    },
    async enhance(image) {
      return { ok: true, value: image };
    },
    ...over,
  };
}

describe("downscale", () => {
  it("returns the same object when already small", () => {
    const img = solid(100, 50, 10);
    expect(downscale(img, 800).image).toBe(img);
  });
  it("shrinks, averages and does not mutate the input", () => {
    const img = solid(2000, 1000, 100);
    const before = img.data.slice();
    const { image, scale } = downscale(img, 500);
    expect(image.width).toBe(500);
    expect(image.height).toBe(250);
    expect(scale).toBeCloseTo(0.25);
    expect(image.data[0]).toBe(100);
    expect(sameBytes(img.data, before)).toBe(true);
  });
});

describe("repair", () => {
  it("detects on a downscaled copy and maps corners back to full resolution", async () => {
    const p = fakeProcessor();
    const full = solid(3200, 2400, 128);
    const r = await repair(p, full);
    expect(r.ok).toBe(true);
    expect(Math.max(p.seen[0]!.width, p.seen[0]!.height)).toBe(DETECTION_MAX_SIDE);
    if (r.ok) {
      expect(r.value.corners[0].x).toBeCloseTo(320, 0);
      expect(r.value.corners[2].y).toBeCloseTo(2160, 0);
      expect(r.value.source).toBe("edges");
      expect(r.value.areaFraction).toBe(0.64);
    }
  });

  it("cleans up the whole photo instead of cropping to a weak outline that covers most of it", async () => {
    const weak = (areaFraction: number) => fakeProcessor({
      async detectDocument(image) {
        return { ok: true, value: { corners: quad(image.width, image.height), areaFraction, method: "brightness", edgeSupport: 0.36 } };
      },
    });
    const r = await repair(weak(0.73), solid(400, 300, 1));
    expect(r).toMatchObject({
      ok: true,
      value: { source: "whole-image", corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] },
    });
    if (r.ok) {
      expect(r.value.detectedOutline).toEqual(quad(400, 300));
      expect(r.value.edgeSupport).toBeUndefined();
    }
    // A weak outline on a smaller part of the photo is still used (the app warns about it instead).
    expect(await repair(weak(0.5), solid(400, 300, 1))).toMatchObject({
      ok: true, value: { source: "brightness", corners: quad(400, 300), edgeSupport: 0.36 },
    });
  });

  it("uses manual corners without running detection", async () => {
    const detect = vi.fn();
    const p = fakeProcessor({ detectDocument: detect });
    const r = await repair(p, solid(400, 300, 1), { corners: quad(400, 300) });
    expect(detect).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, value: { source: "manual" } });
  });

  it("rejects invalid manual corners", async () => {
    const r = await repair(fakeProcessor(), solid(400, 300, 1), { corners: quad(4000, 3000) });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-corners" } });
  });

  const notFound = () => fakeProcessor({
    async detectDocument() {
      return { ok: false, error: { code: "no-document-found", message: "none" } };
    },
  });

  it("cleans up the whole photo when no page is found but it looks like paper and print", async () => {
    const r = await repair(notFound(), textSheet(400, 300));
    expect(r).toMatchObject({
      ok: true,
      value: { source: "whole-image", corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] },
    });
    if (r.ok) expect(r.value.detectedOutline).toBeUndefined();
  });

  it("fails rather than cleaning up a photo with no page that does not look like a document", async () => {
    // A dark, plain image: no paper, no print.
    expect(await repair(notFound(), solid(400, 300, 1))).toMatchObject({
      ok: false, error: { code: "no-document-found", message: expect.stringMatching(/does not look like a photo of a paper page/) },
    });
    // Vivid colour, such as a photo of a scene.
    const vivid = solid(400, 300, 0);
    for (let i = 0; i < vivid.data.length; i += 4) vivid.data.set([230, 40, 60], i);
    expect(await repair(notFound(), vivid)).toMatchObject({ ok: false, error: { code: "no-document-found" } });
  });

  it("propagates engine failures during detection instead of returning the original", async () => {
    const p = fakeProcessor({
      async detectDocument() {
        return { ok: false, error: { code: "processing-failed", message: "boom" } };
      },
    });
    expect(await repair(p, textSheet(400, 300))).toMatchObject({ ok: false, error: { code: "processing-failed" } });
  });

  it("propagates warp failure", async () => {
    const p = fakeProcessor({
      async correctPerspective() {
        return { ok: false, error: { code: "processing-failed", message: "boom" } };
      },
    });
    expect(await repair(p, solid(400, 300, 1))).toMatchObject({ ok: false, error: { code: "processing-failed" } });
  });

  it("rejects malformed rasters and never mutates the source", async () => {
    expect(await repair(fakeProcessor(), { width: 10, height: 10, data: new Uint8ClampedArray(5) })).toMatchObject({
      ok: false, error: { code: "invalid-input" },
    });
    const img = solid(1600, 1200, 77);
    const copy = img.data.slice();
    await repair(fakeProcessor(), img);
    expect(sameBytes(img.data, copy)).toBe(true);
  });
});

describe("repair rotation", () => {
  it("turns both the cleaned and the straightened page, after all processing", async () => {
    const warped = solid(30, 10, 90);
    const p = fakeProcessor({ correctPerspective: async () => ({ ok: true, value: warped }) });
    const r = await repair(p, solid(400, 300, 1), { rotate: 90 });
    if (!r.ok) throw new Error(r.error.message);
    expect([r.value.image.width, r.value.image.height]).toEqual([10, 30]);
    expect([r.value.straightened.width, r.value.straightened.height]).toEqual([10, 30]);
    // Corners stay in the photo's own orientation (what the corner editor shows).
    expect(r.value.corners).toEqual(quad(400, 300));
  });

  it("rejects a turn that is not a quarter turn before processing", async () => {
    const p = fakeProcessor();
    const detect = vi.spyOn(p, "detectDocument");
    const r = await repair(p, solid(400, 300, 1), { rotate: 45 as never });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
    expect(detect).not.toHaveBeenCalled();
  });
});

describe("repair output style", () => {
  it("defaults to colour and passes the chosen style to the engine", async () => {
    const enhance = vi.fn(async (image: RasterImage) => ({ ok: true as const, value: image }));
    const def = await repair(fakeProcessor({ enhance }), solid(400, 300, 1));
    expect(def).toMatchObject({ ok: true, value: { style: "color" } });
    expect(enhance).toHaveBeenLastCalledWith(expect.anything(), { style: "color" });

    const bw = await repair(fakeProcessor({ enhance }), solid(400, 300, 1), { enhance: { style: "blackwhite" } });
    expect(bw).toMatchObject({ ok: true, value: { style: "blackwhite" } });
    expect(enhance).toHaveBeenLastCalledWith(expect.anything(), { style: "blackwhite" });
  });

  it("returns the straightened page before cleanup alongside the cleaned result", async () => {
    const warped = solid(10, 10, 90);
    const cleaned = solid(10, 10, 250);
    const p = fakeProcessor({
      correctPerspective: async () => ({ ok: true, value: warped }),
      enhance: async () => ({ ok: true, value: cleaned }),
    });
    const r = await repair(p, solid(400, 300, 1));
    expect(r.ok && r.value.straightened).toBe(warped);
    expect(r.ok && r.value.image).toBe(cleaned);
  });

  it("rejects an unknown style before doing any processing", async () => {
    const detect = vi.fn();
    const r = await repair(fakeProcessor({ detectDocument: detect }), solid(400, 300, 1), {
      enhance: { style: "sepia" as never },
    });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
    expect(detect).not.toHaveBeenCalled();
  });

  it("propagates an enhancement failure instead of returning the un-enhanced image", async () => {
    const p = fakeProcessor({
      async enhance() {
        return { ok: false, error: { code: "processing-failed", message: "boom" } };
      },
    });
    expect(await repair(p, solid(400, 300, 1))).toMatchObject({ ok: false, error: { code: "processing-failed" } });
  });
});
