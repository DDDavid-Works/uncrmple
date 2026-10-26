import type { Point, Quad } from "../../types/repair";
import {
  estimateAspectRatio, perspectiveRatio, reduceToQuad, refineQuadByLines, scoreCard, shapeScore,
} from "./card-geometry";
import { orderCorners } from "./geometry";

const rect = (w: number, h: number, x = 100, y = 100): Quad => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];
const FULL = { imageWidth: 800, imageHeight: 600 };
const ALL: [number, number, number, number] = [1, 1, 1, 1];

describe("card geometry", () => {
  it("estimates the aspect ratio as long side over short side", () => {
    expect(estimateAspectRatio(rect(317, 200))).toBeCloseTo(1.585, 2);
    expect(estimateAspectRatio(rect(200, 317))).toBeCloseTo(1.585, 2);
  });

  it("scores card proportions high and extreme proportions zero", () => {
    expect(shapeScore(rect(317, 200))).toBe(1);
    expect(shapeScore(rect(600, 100))).toBe(0);
    expect(shapeScore(rect(200, 200))).toBeLessThan(1);
  });

  it("reports perspective as the ratio of opposite sides", () => {
    expect(perspectiveRatio(rect(300, 200))).toBeCloseTo(1);
    const keystone: Quad = [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 350, y: 300 }, { x: 150, y: 300 }];
    expect(perspectiveRatio(keystone)).toBeCloseTo(1.5);
  });

  it("is ready only when every side is visible", () => {
    const quad = rect(317, 200);
    const good = scoreCard({ quad, ...FULL, edgeSupport: 0.95, sideVisibility: ALL });
    expect(good.level).toBe("ready");
    const covered = scoreCard({ quad, ...FULL, edgeSupport: 0.95, sideVisibility: [1, 1, 1, 0.1] });
    expect(covered.level).toBe("verify");
    expect(covered.warnings).toContain("edge-unclear");
    expect(covered.confidence).toBeLessThan(0.7);
  });

  it("offers nothing for weak or non-card shapes", () => {
    expect(scoreCard({ quad: rect(317, 200), ...FULL, edgeSupport: 0, sideVisibility: [0, 0, 0, 0] }).level).toBeNull();
    expect(scoreCard({ quad: rect(600, 100), ...FULL, edgeSupport: 1, sideVisibility: ALL }).level).toBeNull();
  });

  it("flags a card touching the photo border as possibly cut off, never ready", () => {
    const s = scoreCard({ quad: rect(317, 200, 0, 100), ...FULL, edgeSupport: 1, sideVisibility: ALL });
    expect(s.warnings).toContain("card-cut-off");
    expect(s.level).toBe("verify");
  });
});

describe("refineQuadByLines", () => {
  /** Outline of a rectangle with its corners cut off (like rounded corners), plus side points. */
  function chamferedOutline(q: Quad, cut: number): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i < 4; i++) {
      const a = q[i]!;
      const b = q[(i + 1) % 4]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = cut; d <= len - cut; d += 2) {
        pts.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
      }
    }
    return pts;
  }

  it("recovers true corners from a quad whose corners were cut in", () => {
    const truth = rect(317, 200);
    const cutIn: Quad = [
      { x: 108, y: 108 }, { x: 409, y: 108 }, { x: 409, y: 292 }, { x: 108, y: 292 },
    ];
    const refined = refineQuadByLines(cutIn, chamferedOutline(truth, 15));
    refined.forEach((p, i) => {
      expect(Math.hypot(p.x - truth[i]!.x, p.y - truth[i]!.y)).toBeLessThan(1.5);
    });
  });

  it("keeps the quad when there is no outline to fit", () => {
    const quad = rect(317, 200);
    expect(refineQuadByLines(quad, [])).toEqual(quad);
  });
});

describe("reduceToQuad", () => {
  it("collapses chamfered corners onto the true corners", () => {
    const octagon: Point[] = [
      { x: 120, y: 100 }, { x: 380, y: 100 }, { x: 400, y: 130 }, { x: 400, y: 270 },
      { x: 380, y: 300 }, { x: 120, y: 300 }, { x: 100, y: 270 }, { x: 100, y: 130 },
    ];
    const q = reduceToQuad(octagon);
    expect(q).not.toBeNull();
    const truth = rect(300, 200);
    orderCorners(q!).forEach((p, i) => {
      expect(Math.hypot(p.x - truth[i]!.x, p.y - truth[i]!.y)).toBeLessThan(1e-6);
    });
  });

  it("returns null for too few vertices", () => {
    expect(reduceToQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeNull();
  });
});
