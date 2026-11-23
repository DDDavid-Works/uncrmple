// @vitest-environment node
import type { Quad, RasterImage } from "../../../types/repair";
import { createOpenCvProcessor } from "./processor";

const processor = createOpenCvProcessor();
const W = 800, H = 600;
/** A receipt lying a little askew in the middle of the photo, about a quarter of the frame. */
const RECEIPT: Quad = [{ x: 160, y: 166 }, { x: 577, y: 121 }, { x: 607, y: 372 }, { x: 203, y: 450 }];

const inside = (q: Quad, x: number, y: number) =>
  q.every((a, i) => {
    const b = q[(i + 1) % 4]!;
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
  });

/** Distance from (x, y) to the receipt's outline, for its faint rim. */
function rimDistance(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = RECEIPT[i]!, b = RECEIPT[(i + 1) % 4]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

/** 3×3 mean of every colour channel (the shared synthetic blur keeps only grey). */
function blurColour(src: RasterImage): RasterImage {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            sum += data[(yy * width + xx) * 4 + c]!;
            n++;
          }
        }
        out[(y * width + x) * 4 + c] = sum / n;
      }
      out[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/**
 * A white receipt on a pale desk as a phone shoots it: the two are equally bright (the camera
 * exposes for the white), the light falls off from bottom to top across both, the paper's edge is
 * only a faint rim, and a block of print sits inside. On a warm desk the paper is a little more
 * neutral than its surroundings; on a neutral desk nothing tells them apart but the rim.
 */
function paleDesk(desk: [number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const light = 0.85 + (0.3 * y) / H;
    for (let x = 0; x < W; x++) {
      const onPaper = inside(RECEIPT, x + 0.5, y + 0.5);
      let rgb: [number, number, number] = onPaper ? [150, 150, 150] : desk;
      if (rimDistance(x + 0.5, y + 0.5) < 1.5) rgb = rgb.map((v) => v - 14) as typeof rgb;
      const print = onPaper && x > 250 && x < 520 && y > 200 && y < 380 && y % 14 < 4 && x % 6 < 4;
      if (print) rgb = [70, 70, 70];
      const i = (y * W + x) * 4;
      data[i] = Math.min(255, rgb[0] * light);
      data[i + 1] = Math.min(255, rgb[1] * light);
      data[i + 2] = Math.min(255, rgb[2] * light);
      data[i + 3] = 255;
    }
  }
  return blurColour({ width: W, height: H, data });
}

describe("a white receipt on a pale desk of the same brightness", () => {
  it("finds the receipt on a warm desk from the change of tint at its edge", async () => {
    const r = await processor.detectDocument(paleDesk([153, 150, 144]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.method).toBe("colour");
    r.value.corners.forEach((c, i) => {
      expect(Math.hypot(c.x - RECEIPT[i]!.x, c.y - RECEIPT[i]!.y)).toBeLessThan(8);
    });
    expect(r.value.edgeSupport).toBeGreaterThan(0.6);
  }, 120_000);

  it("does not make up an outline on a neutral desk, where only a faint rim marks the paper", async () => {
    const r = await processor.detectDocument(paleDesk([150, 150, 150]));
    expect(r.ok && r.value.method === "colour").toBe(false);
  }, 120_000);
});
