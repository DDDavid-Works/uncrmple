import type { Point, Quad } from "../../types/repair";
import { mergeSegments, quadsFromLines } from "./card-lines";
import type { Segment } from "./card-lines";

const TRUE: Quad = [{ x: 150, y: 120 }, { x: 650, y: 150 }, { x: 620, y: 450 }, { x: 130, y: 400 }];

/** Break one side into several segments with small gaps, like a real edge map would. */
function sideSegments(a: Point, b: Point, pieces = 4, jitter = 0): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces + 0.01, t1 = (i + 1) / pieces - 0.02;
    const j = () => (Math.sin(i * 7.3 + a.x) * jitter);
    out.push({
      x1: a.x + (b.x - a.x) * t0 + j(), y1: a.y + (b.y - a.y) * t0 + j(),
      x2: a.x + (b.x - a.x) * t1 + j(), y2: a.y + (b.y - a.y) * t1 + j(),
    });
  }
  return out;
}
const sides = (q: Quad, jitter = 0) => q.flatMap((p, i) => sideSegments(p, q[(i + 1) % 4]!, 4, jitter));

describe("mergeSegments", () => {
  it("joins broken pieces of one edge into a single strong line", () => {
    const lines = mergeSegments(sideSegments({ x: 0, y: 0 }, { x: 400, y: 0 }, 5));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.tMax - lines[0]!.tMin).toBeGreaterThan(380);
  });

  it("keeps separate edges separate", () => {
    expect(mergeSegments(sides(TRUE))).toHaveLength(4);
  });

  it("merges slightly noisy pieces of the same edge", () => {
    expect(mergeSegments(sideSegments({ x: 0, y: 0 }, { x: 400, y: 20 }, 6, 1.5))).toHaveLength(1);
  });
});

describe("quadsFromLines", () => {
  const support = (q: Quad) => 1 - Math.min(1, q.reduce((s, p, i) => s + Math.hypot(p.x - TRUE[i]!.x, p.y - TRUE[i]!.y), 0) / 400);
  const opts = { width: 800, height: 600, minAreaFraction: 0.02, maxAreaFraction: 0.97, support, minSupport: 0.3 };

  it("recovers the card from its four broken sides", () => {
    const quads = quadsFromLines(mergeSegments(sides(TRUE, 1)), opts);
    expect(quads.length).toBeGreaterThan(0);
    quads[0]!.forEach((p, i) => expect(Math.hypot(p.x - TRUE[i]!.x, p.y - TRUE[i]!.y)).toBeLessThan(6));
  });

  it("still finds it among extra lines from printed boxes and clutter", () => {
    const inner: Quad = [{ x: 200, y: 180 }, { x: 400, y: 190 }, { x: 390, y: 300 }, { x: 190, y: 290 }];
    const clutter: Segment[] = [
      { x1: 20, y1: 560, x2: 780, y2: 540 }, { x1: 700, y1: 20, x2: 690, y2: 580 },
      { x1: 0, y1: 40, x2: 300, y2: 30 },
    ];
    const lines = mergeSegments([...sides(TRUE, 1), ...sides(inner), ...clutter]);
    const quads = quadsFromLines(lines, opts);
    expect(quads.some((q) => q.every((p, i) => Math.hypot(p.x - TRUE[i]!.x, p.y - TRUE[i]!.y) < 6))).toBe(true);
  });

  it("returns nothing for parallel lines only and for too few lines", () => {
    const parallel: Segment[] = [0, 100, 200, 300].map((y) => ({ x1: 50, y1: 100 + y, x2: 700, y2: 100 + y }));
    expect(quadsFromLines(mergeSegments(parallel), opts)).toEqual([]);
    expect(quadsFromLines([], opts)).toEqual([]);
  });

  it("rejects quads that are not card-shaped", () => {
    const sliver: Quad = [{ x: 50, y: 200 }, { x: 750, y: 205 }, { x: 750, y: 260 }, { x: 50, y: 255 }];
    const anySupport = { ...opts, support: () => 1 };
    expect(quadsFromLines(mergeSegments(sides(sliver)), anySupport)).toEqual([]);
  });

  it("clamps corners to the photo when a side runs slightly off-frame", () => {
    const off: Quad = [{ x: 200, y: 100 }, { x: 812, y: 100 }, { x: 812, y: 400 }, { x: 200, y: 400 }];
    const quads = quadsFromLines(mergeSegments(sides(off)), { ...opts, support: () => 1 });
    for (const q of quads) for (const p of q) expect(p.x).toBeLessThanOrEqual(800);
  });
});
