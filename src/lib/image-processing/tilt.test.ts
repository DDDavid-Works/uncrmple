import { leaningTextPhoto, solid } from "../../tests/synthetic";
import { toGray } from "./assessment/pixels";
import { measureTilt } from "./tilt";

const SHEET = { x: 0, y: 0, width: 700, height: 900 };
const sheet = (angleAt: (t: number) => number) => toGray(leaningTextPhoto(SHEET.width, SHEET.height, SHEET, angleAt));

describe("measureTilt", () => {
  it("finds level print as level, with high confidence", () => {
    const t = measureTilt(sheet(() => 0));
    expect(t).not.toBeNull();
    expect(Math.abs(t!.angle)).toBeLessThan(0.1);
    expect(t!.confidence).toBeGreaterThan(0.8);
    expect(t!.bend).toBeLessThan(0.3);
  });

  it.each([2.5, -1.7, 0.6, 4.4])("measures print leaning by %f°", (deg) => {
    const t = measureTilt(sheet(() => deg));
    expect(t!.angle).toBeCloseTo(deg, 1);
    expect(t!.confidence).toBeGreaterThan(0.8);
    expect(t!.bend).toBeLessThan(0.3);
  });

  it("reports bending when the top leans more than the bottom (curved page)", () => {
    const t = measureTilt(sheet((y) => 3 * (1 - y)));
    expect(t!.bend).toBeGreaterThan(1);
    const [top, mid, bottom] = t!.bands;
    expect(top!).toBeGreaterThan(mid!);
    expect(mid!).toBeGreaterThan(bottom!);
  });

  it("returns null for a blank page instead of guessing an angle", () => {
    expect(measureTilt(toGray(solid(600, 800, 230)))).toBeNull();
  });

  it("gives low confidence for ink without line structure", () => {
    const img = solid(600, 800, 230);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 6000; n++) {
      const x = Math.floor(rand() * 596), y = Math.floor(rand() * 796);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const i = ((y + dy) * 600 + x + dx) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 40;
      }
    }
    const t = measureTilt(toGray(img));
    expect(t === null || t.confidence < 0.5).toBe(true);
  });
});
