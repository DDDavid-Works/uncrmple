// @vitest-environment node
import type { Quad, RasterImage } from "../../../types/repair";
import { boxBlur, solid } from "../../../tests/synthetic";
import { createOpenCvProcessor } from "./processor";

const processor = createOpenCvProcessor();
const W = 450, H = 600;
/** A page filling most of a small photo, as in a tightly framed phone shot sent through a messenger. */
const PAGE: Quad = [{ x: 34, y: 28 }, { x: 431, y: 17 }, { x: 441, y: 587 }, { x: 39, y: 583 }];

const inside = (q: Quad, x: number, y: number) =>
  q.every((a, i) => {
    const b = q[(i + 1) % 4]!;
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
  });

/**
 * White paper on a light wall: the photo is so bright overall that brightness-scaled edge
 * thresholds (about 135 and 255 here) miss the paper's soft edge. A block of text sits inside wide
 * margins, as on a typed contract.
 */
function brightScene(wall: number, paper: number): RasterImage {
  const img = solid(W, H, wall);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(PAGE, x + 0.5, y + 0.5)) continue;
      const text = x >= 95 && x < 400 && y >= 50 && y < 560 && y % 12 < 4 && x % 5 < 3;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = text ? 60 : paper;
    }
  }
  return boxBlur(img, 1);
}

describe("a bright page on a light wall", () => {
  it.each([
    [140, 210],
    [120, 200],
  ])("finds the paper edge (wall %i, paper %i)", async (wall, paper) => {
    const r = await processor.detectDocument(brightScene(wall, paper));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.value.corners.forEach((c, i) => {
      expect(Math.hypot(c.x - PAGE[i]!.x, c.y - PAGE[i]!.y)).toBeLessThan(8);
    });
    expect(r.value.edgeSupport).toBeGreaterThan(0.5);
  }, 120_000);
});
