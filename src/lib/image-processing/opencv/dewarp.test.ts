// @vitest-environment node
import type { Quad, RasterImage, ShiftMap } from "../../../types/repair";
import { bentTextPage, onBackground, sameBytes } from "../../../tests/synthetic";
import { toGray } from "../assessment/pixels";
import { planDeskew } from "../deskew";
import { planDewarp } from "../dewarp/plan";
import { traceLines } from "../dewarp/trace";
import { downscale } from "../downscale";
import { repair } from "../pipeline";
import { loadOpenCv } from "./loader";
import { createOpenCvProcessor } from "./processor";
import { correctPerspective } from "./warp";

const PW = 800, PH = 1000;
const X = 120, Y = 90, W = 1040, H = 1200;
const PAGE: Quad = [{ x: X, y: Y }, { x: X + PW, y: Y }, { x: X + PW, y: Y + PH }, { x: X, y: Y + PH }];
const processor = createOpenCvProcessor();
const tan2 = Math.tan((2 * Math.PI) / 180);
/** A curled page whose print also leans by about 2°. */
const bentAndTilted = (x: number, y: number) => 12 * Math.sin((Math.PI * x) / PW) * (0.4 + (0.6 * y) / PH) + (x - PW / 2) * tan2;

const photo = (): RasterImage => onBackground(bentTextPage(PW, PH, bentAndTilted).image, W, H, X, Y);

/** Largest rise-and-fall of long traced lines well inside the page. */
function worstLineRange(page: RasterImage): number {
  const small = downscale(page, 1200).image;
  const lines = traceLines(toGray(small)).lines.filter(
    (l) =>
      l.points[l.points.length - 1]!.x - l.points[0]!.x > 0.4 * small.width &&
      l.points.every((p) => p.y > 0.08 * small.height && p.y < 0.92 * small.height),
  );
  expect(lines.length).toBeGreaterThan(20);
  return Math.max(...lines.map((l) => Math.max(...l.points.map((p) => p.y)) - Math.min(...l.points.map((p) => p.y))));
}

function meanAbsDiff(a: RasterImage, b: RasterImage): number {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) sum += Math.abs(a.data[i]! - b.data[i]!);
  return sum / (a.data.length / 4);
}

async function engine() {
  const cv = await loadOpenCv();
  if (!cv.ok) throw new Error(cv.error.message);
  return cv.value;
}

describe("one-pass straighten and flatten with OpenCV", () => {
  it("matches the plain perspective warp when the map is zero", async () => {
    const cv = await engine();
    const img = photo();
    const zero: ShiftMap = { columns: 2, rows: 1, shifts: new Float32Array(2) };
    const plain = correctPerspective(cv, img, PAGE);
    const remapped = correctPerspective(cv, img, PAGE, zero);
    if (!plain.ok || !remapped.ok) throw new Error("warp failed");
    expect([remapped.value.width, remapped.value.height]).toEqual([plain.value.width, plain.value.height]);
    expect(meanAbsDiff(plain.value, remapped.value)).toBeLessThan(0.5);
  }, 120_000);

  it("gives identical output whatever the band size (no seams)", async () => {
    const cv = await engine();
    const img = photo();
    const map: ShiftMap = { columns: 3, rows: 2, shifts: Float32Array.from([0, 0.01, 0, 0.005, -0.004, 0.005]) };
    const whole = correctPerspective(cv, img, PAGE, map);
    const banded = correctPerspective(cv, img, PAGE, map, undefined, (PW + 1) * 7); // 7-row bands and a short last band
    if (!whole.ok || !banded.ok) throw new Error("warp failed");
    expect(whole.value.height % 7).not.toBe(0);
    expect(sameBytes(whole.value.data, banded.value.data)).toBe(true);
  }, 120_000);

  it("rejects a malformed map instead of warping with it", async () => {
    const r = await processor.correctPerspective(photo(), PAGE, { columns: 2, rows: 1, shifts: Float32Array.from([0, 0.5]) });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  }, 120_000);

  it("levels a curled, tilted page in one warp of the photo, leaving the photo untouched", async () => {
    const img = photo();
    const copy = img.data.slice();
    const plain = await processor.correctPerspective(img, PAGE);
    if (!plain.ok) throw new Error(plain.error.message);
    const before = worstLineRange(plain.value);

    const deskew = await planDeskew(processor, img, PAGE);
    if (!deskew.ok) throw new Error(deskew.error.message);
    expect(Math.abs(deskew.value.deskew.applied)).toBeGreaterThan(1);
    const bend = await planDewarp(processor, img, deskew.value.quad, PAGE);
    if (!bend.ok) throw new Error(bend.error.message);
    expect(bend.value.dewarp.applied).toBe(true);

    const flat = await processor.correctPerspective(img, deskew.value.quad, bend.value.map!, PAGE);
    if (!flat.ok) throw new Error(flat.error.message);
    const after = worstLineRange(flat.value);
    expect(before).toBeGreaterThan(20);
    expect(after).toBeLessThan(2.5);
    expect(sameBytes(img.data, copy)).toBe(true);
  }, 120_000);

  it("repair flattens a curled page automatically and reports it", async () => {
    const img = photo();
    const copy = img.data.slice();
    const r = await repair(processor, img);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.dewarp).toMatchObject({ applied: true });
    expect(r.value.dewarp.bendAfter!).toBeLessThan(r.value.dewarp.bendBefore! * 0.75);
    expect(worstLineRange(r.value.straightened)).toBeLessThan(2.5);
    expect(sameBytes(img.data, copy)).toBe(true);
  }, 120_000);

  it("repair leaves a flat page unflattened", async () => {
    const flatPhoto = onBackground(bentTextPage(PW, PH, () => 0).image, W, H, X, Y);
    const r = await repair(processor, flatPhoto);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.dewarp).toMatchObject({ applied: false, skipped: "already-flat" });
  }, 120_000);

  it("repair can be told not to flatten", async () => {
    const r = await repair(processor, photo(), { dewarp: false });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.dewarp).toMatchObject({ applied: false, skipped: "off", bendBefore: null });
    expect(worstLineRange(r.value.straightened)).toBeGreaterThan(5);
  }, 120_000);
});
