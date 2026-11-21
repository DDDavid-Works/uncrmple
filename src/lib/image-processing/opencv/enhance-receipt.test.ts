// @vitest-environment node
import type { PaperProfile, RasterImage } from "../../../types/repair";
import { lum, onBackground, sameBytes, shade, textSheet } from "../../../tests/synthetic";
import { repair } from "../pipeline";
import { levels } from "./enhance";
import { createOpenCvProcessor } from "./processor";

const processor = createOpenCvProcessor();

/**
 * A tall receipt with faded thermal print (ink 172 on paper 232), a thin crease and light falling
 * off towards the bottom. textSheet draws ink rows where y % 20 < 6 and ink columns where x % 6 < 4.
 */
const FADED = { width: 240, height: 900, paper: 232, ink: 172, crease: 212, creaseX: 121 };
function fadedReceipt(ink = FADED.ink): RasterImage {
  const sheet = textSheet(FADED.width, FADED.height, FADED.paper, ink, 20);
  // A crease: a 2 px line slightly darker than the paper, drawn on paper only.
  for (let y = 0; y < sheet.height; y++) {
    for (const x of [FADED.creaseX, FADED.creaseX + 1]) {
      const i = (y * sheet.width + x) * 4;
      if (sheet.data[i] === FADED.paper) sheet.data[i] = sheet.data[i + 1] = sheet.data[i + 2] = FADED.crease;
    }
  }
  return shade(sheet, (_x, y) => 1 - (0.2 * y) / FADED.height);
}
const INK = { x: 24, y: 400 }; // 24 % 6 = 0, 400 % 20 = 0
const PAPER = { x: 100, y: 410 }; // 410 % 20 = 10: a blank row
const CREASE = { x: FADED.creaseX, y: 410 };

async function enhanced(src: RasterImage, profile: PaperProfile) {
  const copy = src.data.slice();
  const r = await processor.enhance(src, { style: "grayscale", profile });
  if (!r.ok) throw new Error(r.error.message);
  expect(sameBytes(src.data, copy)).toBe(true); // source untouched
  expect([r.value.width, r.value.height]).toEqual([src.width, src.height]);
  return r.value;
}

describe("levels", () => {
  /** Luminance values: `share` of them at `ink`, the rest at `paper`. */
  const histogram = (ink: number, paper: number, share: number) => {
    const n = 10_000;
    const data = new Uint8Array(n).fill(paper);
    data.fill(ink, 0, Math.round(n * share));
    return data;
  };

  it("takes the receipt black point from faded ink, keeping a minimum range", () => {
    const faded = histogram(180, 250, 0.03);
    expect(levels(faded, "document")).toEqual({ black: 90, white: 238 });
    expect(levels(faded, "receipt")).toEqual({ black: 166, white: 238 });
  });

  it("matches the document curve when the print is already dark", () => {
    const dark = histogram(30, 250, 0.05);
    expect(levels(dark, "receipt")).toEqual(levels(dark, "document"));
  });

  it("never stretches a nearly blank receipt beyond the minimum range", () => {
    const blank = histogram(248, 250, 0.03);
    const { black, white } = levels(blank, "receipt");
    expect(white - black).toBeGreaterThanOrEqual(72);
  });
});

describe("receipt enhancement of faded thermal print", () => {
  it("darkens faded print far more than the document curve, keeping paper white", async () => {
    const src = fadedReceipt();
    const doc = await enhanced(src, "document");
    const rec = await enhanced(src, "receipt");

    expect(lum(doc, INK.x, INK.y)).toBeGreaterThan(140); // the document curve leaves it gray
    expect(lum(rec, INK.x, INK.y)).toBeLessThan(100);
    expect(lum(rec, INK.x, INK.y)).toBeLessThan(lum(doc, INK.x, INK.y) - 60);
    expect(lum(rec, PAPER.x, PAPER.y)).toBeGreaterThan(240);
    // Top and bottom are evened out despite the light fall-off.
    expect(Math.abs(lum(rec, PAPER.x, 50) - lum(rec, PAPER.x, 850))).toBeLessThan(12);
  }, 120_000);

  it("is not thrown off by slivers of table left along the receipt's edges", async () => {
    // A loose crop: 6 px of dark table down each side and across the top and bottom.
    const src = fadedReceipt();
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        if (x < 6 || x >= src.width - 6 || y < 6 || y >= src.height - 6) {
          const i = (y * src.width + x) * 4;
          src.data[i] = src.data[i + 1] = src.data[i + 2] = 45;
        }
      }
    }
    const rec = await enhanced(src, "receipt");
    // Sampled well inside: lighting correction blends the table into the paper right at the edge.
    const ink = { x: 96, y: 400 };
    expect(lum(rec, ink.x, ink.y)).toBeLessThan(100);
    expect(lum(rec, PAPER.x, PAPER.y)).toBeGreaterThan(240);
  }, 120_000);

  it("keeps a crease much lighter than the print", async () => {
    const rec = await enhanced(fadedReceipt(), "receipt");
    // The crease darkens with the stretch (a known cost), but stays far from the print.
    expect(lum(rec, CREASE.x, CREASE.y)).toBeGreaterThan(lum(rec, INK.x, INK.y) + 100);
  }, 120_000);

  it("leaves well-printed receipts like the document curve does", async () => {
    const src = fadedReceipt(40);
    const doc = await enhanced(src, "document");
    const rec = await enhanced(src, "receipt");
    expect(Math.abs(lum(rec, INK.x, INK.y) - lum(doc, INK.x, INK.y))).toBeLessThan(10);
    expect(Math.abs(lum(rec, PAPER.x, PAPER.y) - lum(doc, PAPER.x, PAPER.y))).toBeLessThan(10);
  }, 120_000);

  it("rejects an unknown paper type", async () => {
    const r = await processor.enhance(fadedReceipt(), { style: "grayscale", profile: "napkin" as never });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  }, 120_000);
});

describe("repairing a tall receipt photo", () => {
  it("finds the receipt and keeps its long, narrow proportions", async () => {
    const photo = onBackground(fadedReceipt(), 480, 1000, 120, 50);
    const r = await repair(processor, photo, { enhance: { style: "grayscale", profile: "receipt" } });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.source).not.toBe("whole-image");
    const ratio = r.value.image.height / r.value.image.width;
    expect(ratio).toBeGreaterThan((FADED.height / FADED.width) * 0.9);
    expect(ratio).toBeLessThan((FADED.height / FADED.width) * 1.1);
    expect(r.value.image.width).toBeGreaterThan(FADED.width * 0.9);
  }, 120_000);
});
