// @vitest-environment node
import type { Quad, RasterImage } from "../../../types/repair";
import { leaningTextPhoto, sameBytes } from "../../../tests/synthetic";
import { assessPhoto } from "../assessment/assess";
import { toGray } from "../assessment/pixels";
import { repair } from "../pipeline";
import { measureTilt } from "../tilt";
import { createOpenCvProcessor } from "./processor";

const W = 1000, H = 1200;
const PAGE = { x: 150, y: 120, width: 700, height: 950 };
const processor = createOpenCvProcessor();

describe("deskew with the OpenCV engine", () => {
  it("levels print that leans inside a square page, in one warp, without touching the photo", async () => {
    const photo = leaningTextPhoto(W, H, PAGE, () => 2.2);
    const copy = photo.data.slice();
    const r = await repair(processor, photo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.deskew.applied).toBeCloseTo(2.2, 0);
    expect(r.value.deskew.bent).toBe(false);
    // The reported corners stay the page outline (what the corner editor shows).
    expect(r.value.corners[0].x).toBeCloseTo(PAGE.x, -1);
    const after = measureTilt(toGray(r.value.straightened))!;
    expect(Math.abs(after.angle)).toBeLessThan(0.3);
    expect(sameBytes(photo.data, copy)).toBe(true);
  }, 120_000);

  it("keeps print that runs to the page edges, filling the corners outside the page with white", async () => {
    // Print right up to the paper edge, with corners placed on the page outline by hand.
    const photo = leaningTextPhoto(W, H, PAGE, () => 2.2, 0);
    const corners: Quad = [
      { x: PAGE.x, y: PAGE.y }, { x: PAGE.x + PAGE.width, y: PAGE.y },
      { x: PAGE.x + PAGE.width, y: PAGE.y + PAGE.height }, { x: PAGE.x, y: PAGE.y + PAGE.height },
    ];
    const r = await repair(processor, photo, { corners, dewarp: false });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.deskew.applied).toBeCloseTo(2.2, 0);
    const ink = (img: RasterImage, x0: number, y0: number, w: number, h: number) => {
      let n = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.width + x) * 4]! < 128) n++;
      return n;
    };
    // Same amount of print as the unlevelled warp: nothing cut off at the corners.
    const plain = await repair(processor, photo, { corners, dewarp: false, deskew: false });
    if (!plain.ok) throw new Error(plain.error.message);
    const out = r.value.straightened, ref = plain.value.straightened;
    expect(Math.abs(ink(out, 0, 0, out.width, out.height) / ink(ref, 0, 0, ref.width, ref.height) - 1)).toBeLessThan(0.015);
    // The wedges at the frame corners lie outside the page: blank paper, not the table it lay on.
    for (const [x, y] of [[0, 0], [out.width - 1, 0], [0, out.height - 1], [out.width - 1, out.height - 1]]) {
      expect(out.data[(y! * out.width + x!) * 4]).toBe(255);
    }
  }, 120_000);

  it("leaves level print alone and says why", async () => {
    const r = await repair(processor, leaningTextPhoto(W, H, PAGE, () => 0));
    expect(r.ok && r.value.deskew).toMatchObject({ applied: 0, skipped: "level", bent: false });
  }, 120_000);

  it("can be turned off", async () => {
    const r = await repair(processor, leaningTextPhoto(W, H, PAGE, () => 2.2), { deskew: false });
    expect(r.ok && r.value.deskew).toMatchObject({ applied: 0, skipped: "off", measured: null });
  }, 120_000);

  it("flags a curved page while still correcting its average tilt", async () => {
    const r = await repair(processor, leaningTextPhoto(W, H, PAGE, (t) => 3.5 * (1 - t)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.deskew.bent).toBe(true);
    expect(r.value.deskew.applied).toBeGreaterThan(0.5);
    expect(r.value.deskew.applied).toBeLessThan(3);
  }, 120_000);

  it("assessment reports leaning and bent print from the straightened page", async () => {
    const leaning = await assessPhoto(processor, leaningTextPhoto(W, H, PAGE, () => -1.5));
    const geometry = (r: typeof leaning) => (r.ok ? r.value.findings.find((f) => f.dimension === "geometry")! : null);
    expect(geometry(leaning)?.detail).toMatch(/lean about 1\.5°/);
    const curved = await assessPhoto(processor, leaningTextPhoto(W, H, PAGE, (t) => 3.5 * (1 - t)));
    expect(geometry(curved)?.level).toBe("moderate");
    expect(geometry(curved)?.detail).toMatch(/curved or creased/);
  }, 120_000);
});
