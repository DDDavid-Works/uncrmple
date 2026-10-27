import type { Quad } from "../../types/repair";
import { deskewDecision, deskewQuad, isBent } from "./deskew";
import { applyHomography, homography, rectQuad } from "./geometry";

const deg = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const tilt = (angle: number, confidence = 0.9, bend: number | null = 0) => ({ angle, confidence, bands: [], bend });

describe("homography", () => {
  it("maps the four corners exactly and is projective in between", () => {
    const to: Quad = [{ x: 150, y: 90 }, { x: 660, y: 130 }, { x: 630, y: 520 }, { x: 110, y: 470 }];
    const h = homography(rectQuad(500, 400), to)!;
    rectQuad(500, 400).forEach((p, i) => {
      const q = applyHomography(h, p);
      expect(q.x).toBeCloseTo(to[i]!.x, 6);
      expect(q.y).toBeCloseTo(to[i]!.y, 6);
    });
  });
  it("returns null for degenerate corners", () => {
    const p = { x: 1, y: 1 };
    expect(homography(rectQuad(10, 10), [p, p, p, p])).toBeNull();
  });
});

describe("deskewQuad", () => {
  const page: Quad = [{ x: 200, y: 200 }, { x: 899, y: 200 }, { x: 899, y: 1099 }, { x: 200, y: 1099 }];

  it("returns the page itself for a zero angle", () => {
    const q = deskewQuad(page, 700, 900, 0)!;
    q.forEach((p, i) => {
      expect(p.x).toBeCloseTo(page[i]!.x, 6);
      expect(p.y).toBeCloseTo(page[i]!.y, 6);
    });
  });

  it("rotates the sampled area by the measured angle about the page centre", () => {
    const q = deskewQuad(page, 700, 900, 2)!;
    expect(deg(q[0], q[1])).toBeCloseTo(2, 6);
    expect(deg(q[3], q[2])).toBeCloseTo(2, 6);
    expect((q[0].x + q[2].x) / 2).toBeCloseTo(549.5, 6);
    expect((q[0].y + q[2].y) / 2).toBeCloseTo(649.5, 6);
  });

  it("enlarges the frame just enough to hold the whole page, so nothing printed is cut off", () => {
    for (const angle of [2, -3.5]) {
      const q = deskewQuad(page, 700, 900, angle)!;
      // Every page corner lies inside (or on) the rotated frame.
      for (const p of page) {
        for (let i = 0; i < 4; i++) {
          const a = q[i]!, b = q[(i + 1) % 4]!;
          expect((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)).toBeGreaterThanOrEqual(-1e-6);
        }
      }
      const r = (Math.abs(angle) * Math.PI) / 180;
      expect(Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y)).toBeCloseTo(699 * Math.cos(r) + 899 * Math.sin(r), 3);
      expect(Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y)).toBeCloseTo(699 * Math.sin(r) + 899 * Math.cos(r), 3);
    }
  });

  it("may reach beyond the photo (the warp fills that with white)", () => {
    const full: Quad = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1400 }, { x: 0, y: 1400 }];
    const q = deskewQuad(full, 1001, 1401, 5)!;
    expect(Math.min(...q.map((p) => p.x))).toBeLessThan(0);
  });
});

describe("deskewDecision", () => {
  it("corrects a clear tilt within range", () => {
    expect(deskewDecision(tilt(1.4))).toEqual({ applied: 1.4 });
    expect(deskewDecision(tilt(-3))).toEqual({ applied: -3 });
  });
  it("explains every case it leaves alone", () => {
    expect(deskewDecision(null)).toEqual({ applied: 0, skipped: "not-measurable" });
    expect(deskewDecision(tilt(2, 0.2))).toEqual({ applied: 0, skipped: "unclear" });
    expect(deskewDecision(tilt(0.1))).toEqual({ applied: 0, skipped: "level" });
    expect(deskewDecision(tilt(5.8))).toEqual({ applied: 0, skipped: "too-steep" });
  });
  it("flags bending from the band spread", () => {
    expect(isBent(tilt(1, 0.9, 1.6))).toBe(true);
    expect(isBent(tilt(1, 0.9, 0.4))).toBe(false);
    expect(isBent(tilt(1, 0.9, null))).toBe(false);
  });
});
