import type { Assessment, Finding } from "../../../types/assessment";
import type { DetectionResult, ImageProcessor, Quad, RasterImage, Result } from "../../../types/repair";
import { boxBlur, sameBytes, shade, solid, textSheet } from "../../../tests/synthetic";
import { assessPhoto } from "./assess";
import { classifyLikeness, measureContent } from "./likeness";
import { measureCompleteness, measureGeometry, measureResolution } from "./geometry-findings";
import { measureLighting, measureReadability, measureSharpness } from "./photometric";
import { blockStats, quadMask, toGray } from "./pixels";
import { summarise } from "./verdict";

const W = 800, H = 600;
const PAGE: Quad = [{ x: 30, y: 30 }, { x: 770, y: 30 }, { x: 770, y: 570 }, { x: 30, y: 570 }];

/** Fake engine; `detect` corners are in full-photo pixels (`fullWidth` wide) and scaled to the copy it receives. */
function processorFor(detect: Result<DetectionResult>, fullWidth = W): ImageProcessor {
  return {
    detectDocument: async (image) => {
      if (!detect.ok) return detect;
      const k = image.width / fullWidth;
      const c = detect.value.corners;
      const corners = c.map((p) => ({ x: p.x * k, y: p.y * k })) as unknown as Quad;
      return { ok: true, value: { ...detect.value, corners } };
    },
    // Tilt is a secondary measure: an engine that cannot warp leaves the findings without it.
    correctPerspective: async () => ({ ok: false, error: { code: "processing-failed", message: "unavailable in this test" } }),
    enhance: async () => { throw new Error("not used"); },
  };
}
const found = (corners: Quad = PAGE, edgeSupport = 0.9): Result<DetectionResult> => ({
  ok: true,
  value: { corners, areaFraction: 0.8, method: "edges", edgeSupport },
});
const notFound: Result<DetectionResult> = { ok: false, error: { code: "no-document-found", message: "none" } };

const levelOf = (a: Assessment, dim: Finding["dimension"]) => a.findings.find((f) => f.dimension === dim)!.level;

async function assess(image = textSheet(W, H), detect: Result<DetectionResult> = found()) {
  const r = await assessPhoto(processorFor(detect, image.width), image);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function stats(image = textSheet(W, H)) {
  const gray = toGray(image);
  const mask = quadMask(W, H, PAGE);
  return { gray, mask, blocks: blockStats(gray, mask, 32) };
}

describe("sharpness", () => {
  it("rates crisp text as good", () => {
    const { gray, mask } = stats();
    expect(measureSharpness(gray, mask).level).toBe("good");
  });
  it("rates slightly soft text as good and moderately blurred text as moderate", () => {
    const soft = stats(boxBlur(textSheet(W, H), 1));
    expect(measureSharpness(soft.gray, soft.mask).level).toBe("good");
    const blurred = stats(boxBlur(textSheet(W, H), 2));
    expect(measureSharpness(blurred.gray, blurred.mask).level).toBe("moderate");
  });
  it("rates heavily blurred text as poor", () => {
    const { gray, mask } = stats(boxBlur(textSheet(W, H), 3));
    expect(measureSharpness(gray, mask).level).toBe("poor");
  });
  it("does not guess on a blank page", () => {
    const { gray, mask } = stats(solid(W, H, 220));
    expect(measureSharpness(gray, mask)).toMatchObject({ level: "unknown" });
  });
  it("is not fooled by a shadow", () => {
    const { gray, mask } = stats(shade(textSheet(W, H), (x) => 1 - 0.5 * (x / W)));
    expect(measureSharpness(gray, mask).level).toBe("good");
  });
});

describe("lighting", () => {
  it("accepts even lighting", () => {
    const { gray, mask, blocks } = stats();
    expect(measureLighting(blocks, gray, mask).level).toBe("good");
  });
  it("flags a strong shadow gradient", () => {
    const { gray, mask, blocks } = stats(shade(textSheet(W, H), (x) => 1 - 0.55 * (x / W)));
    expect(measureLighting(blocks, gray, mask).level).toBe("poor");
  });
  it("flags glare", () => {
    const img = shade(textSheet(W, H, 200), (x, y) => (Math.hypot(x - 400, y - 300) < 160 ? 1.27 : 1));
    const { gray, mask, blocks } = stats(img);
    const f = measureLighting(blocks, gray, mask);
    expect(f.level).not.toBe("good");
    expect(f.detail).toMatch(/glare/);
  });
  it("is unknown when the page is too small", () => {
    const gray = toGray(solid(W, H, 200));
    expect(measureLighting([], gray, new Uint8Array(W * H)).level).toBe("unknown");
  });
});

describe("readability", () => {
  it("accepts dark text on light paper", () => {
    expect(measureReadability(stats().blocks).level).toBe("good");
  });
  it("flags very faint text", () => {
    expect(measureReadability(stats(textSheet(W, H, 225, 170)).blocks).level).toBe("poor");
  });
  it("does not guess when there is no text", () => {
    expect(measureReadability(stats(solid(W, H, 220)).blocks).level).toBe("unknown");
  });
});

describe("geometry findings", () => {
  it("reports an unfound page as a problem needing manual corners", () => {
    expect(measureGeometry(null, undefined)).toMatchObject({ level: "poor" });
  });
  it("rates a square-on page as good and an angled one as moderate", () => {
    expect(measureGeometry(PAGE, 0.9).level).toBe("good");
    const angled: Quad = [{ x: 100, y: 30 }, { x: 700, y: 30 }, { x: 770, y: 570 }, { x: 30, y: 570 }];
    expect(measureGeometry(angled, 0.9).level).toBe("moderate");
  });
  it("rates a very steep angle as poor", () => {
    const steep: Quad = [{ x: 300, y: 30 }, { x: 500, y: 30 }, { x: 770, y: 570 }, { x: 30, y: 570 }];
    expect(measureGeometry(steep, 0.9).level).toBe("poor");
  });
  it("lowers the level when the outline is uncertain", () => {
    expect(measureGeometry(PAGE, 0.3).level).toBe("moderate");
  });
  it("mentions print that leans inside a square page without lowering the level", () => {
    const f = measureGeometry(PAGE, 0.9, { angle: -1.8, confidence: 0.9, bands: [-1.8, -1.8, -1.7], bend: 0.1 });
    expect(f.level).toBe("good");
    expect(f.detail).toContain("lean about 1.8°");
  });
  it("ignores a lean that is too small or too unclear to correct", () => {
    expect(measureGeometry(PAGE, 0.9, { angle: 0.1, confidence: 0.9, bands: [], bend: 0 }).detail).not.toContain("lean");
    expect(measureGeometry(PAGE, 0.9, { angle: 2, confidence: 0.1, bands: [], bend: 0 }).detail).not.toContain("lean");
  });
  it("warns that a bent page may only be partly flattened", () => {
    const curved = measureGeometry(PAGE, 0.9, { angle: 1.5, confidence: 0.9, bands: [3, 1.2, 0], bend: 3 });
    expect(curved.level).toBe("moderate");
    expect(curved.detail).toContain("bend by about 3.0°");
    expect(curved.detail).toContain("flattens curved lines where it can follow");
    expect(curved.detail).toContain("may still leave some lines sloping");
    expect(measureGeometry(PAGE, 0.9, { angle: 2, confidence: 0.9, bands: [5, 2, 0], bend: 5 }).level).toBe("poor");
  });
  it("counts page sides lying on the photo border", () => {
    expect(measureCompleteness(PAGE, W, H).level).toBe("good");
    expect(measureCompleteness([{ x: 30, y: 0 }, { x: 770, y: 0 }, { x: 770, y: 570 }, { x: 30, y: 570 }], W, H).level).toBe("moderate");
    expect(measureCompleteness([{ x: 0, y: 0 }, { x: 770, y: 0 }, { x: 770, y: 570 }, { x: 0, y: 570 }], W, H).level).toBe("poor");
    expect(measureCompleteness(null, W, H).level).toBe("unknown");
  });
  it("grades resolution by the long side of the page", () => {
    expect(measureResolution(null, 3000, 2000).level).toBe("good");
    expect(measureResolution(null, 1200, 900).level).toBe("moderate");
    expect(measureResolution(PAGE, W, H).level).toBe("poor");
  });
  it("grades resolution by the size of the text when enough lines are found", () => {
    // A small page with large type reads fine; the page size alone would call it poor.
    const moderate = measureResolution(PAGE, W, H, { rowPitch: 11.3, lines: 40 });
    expect(moderate.level).toBe("moderate");
    expect(moderate.detail).toMatch(/Lines of text are about 11 px apart: readable/);
    expect(measureResolution(PAGE, W, H, { rowPitch: 24, lines: 40 }).level).toBe("good");
    expect(measureResolution(PAGE, W, H, { rowPitch: 7, lines: 40 }).level).toBe("poor");
  });
  it("falls back to the page size when too few lines of text are found", () => {
    expect(measureResolution(PAGE, W, H, { rowPitch: 30, lines: 3 }).level).toBe("poor");
    expect(measureResolution(null, 3000, 2000, { rowPitch: 5, lines: 40 }).level).toBe("good");
  });
});

describe("summarise", () => {
  const f = (dimension: Finding["dimension"], level: Finding["level"], confidence = 0.9): Finding => ({
    dimension, level, confidence, detail: "",
  });
  const base = (): Finding[] => [
    f("geometry", "good"), f("lighting", "good"), f("sharpness", "good"),
    f("resolution", "good"), f("completeness", "good"), f("readability", "good"),
  ];
  const withFinding = (over: Finding) => base().map((x) => (x.dimension === over.dimension ? over : x));

  it("is good when everything is fine, or only fixable issues exist", () => {
    expect(summarise(base()).verdict).toBe("good");
    expect(summarise(withFinding(f("lighting", "moderate"))).verdict).toBe("good");
  });
  it("is limited for a soft image or an unfound page", () => {
    expect(summarise(withFinding(f("sharpness", "moderate"))).verdict).toBe("limited");
    expect(summarise(withFinding(f("geometry", "poor"))).verdict).toBe("limited");
  });
  it("is poor for a confident unrecoverable problem", () => {
    const r = summarise(withFinding(f("sharpness", "poor")));
    expect(r.verdict).toBe("poor");
    expect(r.summary).toMatch(/sharpness/);
  });
  it("downgrades a low-confidence unrecoverable problem to limited", () => {
    expect(summarise(withFinding(f("sharpness", "poor", 0.3))).verdict).toBe("limited");
  });
  it("makes no claim when too little was measured", () => {
    const r = summarise([f("geometry", "good"), f("lighting", "unknown"), f("sharpness", "unknown"), f("readability", "unknown")]);
    expect(r.verdict).toBe("limited");
    expect(r.summary).toMatch(/too little/i);
  });
});

/** A vivid, smoothly varying "scene" with no paper-like colour, standing in for a plain photo. */
function scene(width: number, height: number): RasterImage {
  const img = solid(width, height, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      img.data[i] = 30 + (200 * x) / width;
      img.data[i + 1] = 200 - (180 * y) / height;
      img.data[i + 2] = 20;
    }
  }
  return img;
}

describe("page likeness", () => {
  it("calls a detected, paper-like page a document and keeps its verdict", async () => {
    const a = await assess(textSheet(2400, 1800, 225, 40, 120), found([{ x: 90, y: 90 }, { x: 2310, y: 90 }, { x: 2310, y: 1710 }, { x: 90, y: 1710 }]));
    expect(a.likeness).toBe("document");
    expect(a.verdict).toBe("good");
  });

  it("calls a plain photo with no page outline not-document and never a good candidate", async () => {
    const a = await assess(scene(W, H), notFound);
    expect(a.likeness).toBe("not-document");
    expect(a.verdict).toBe("poor");
    expect(a.summary).toMatch(/No document detected/);
  });

  it("is not fooled by a spurious outline around a plain photo", async () => {
    const a = await assess(scene(W, H), found());
    expect(a.likeness).toBe("not-document");
    expect(a.verdict).toBe("poor");
  });

  it("treats a flat, paper-like image without an outline (scan or screenshot) as uncertain, not rejected", async () => {
    const a = await assess(textSheet(W, H), notFound);
    expect(a.likeness).toBe("uncertain");
    expect(a.summary).toMatch(/without cropping/);
  });

  const PAPER = { paperShare: 0.85, saturation: 0.05, paperLevel: 200, edgeDensity: 0.15 };
  const classify = (content: Parameters<typeof classifyLikeness>[0]["content"], quad: Quad | null = PAGE, edgeSupport = 0.9) =>
    classifyLikeness({ quad, edgeSupport, width: W, height: H, content });

  it("distrusts a tiny or weakly supported outline", () => {
    const tiny: Quad = [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 90 }, { x: 10, y: 90 }];
    expect(classify(PAPER, tiny)).toBe("uncertain");
    expect(classify(PAPER, PAGE, 0.1)).toBe("uncertain");
    expect(classify(PAPER)).toBe("document");
  });

  it("rejects content with little paper and few edges even when an outline was found", () => {
    // Measured on a real outdoor photo (paper 0.62, edges 0.08) and on a card photo (0.64, 0.01).
    expect(classify({ paperShare: 0.62, saturation: 0.13, paperLevel: 212, edgeDensity: 0.08 })).toBe("not-document");
    expect(classify({ paperShare: 0.64, saturation: 0.34, paperLevel: 168, edgeDensity: 0.01 })).toBe("not-document");
  });

  it("rejects vivid colour even on a paper-like layout", () => {
    expect(classify({ ...PAPER, saturation: 0.6 })).toBe("not-document");
  });

  it("only doubts, and does not reject, a sparse page with plenty of paper", () => {
    // A page with a few lines of text has few edges but is almost all paper.
    expect(classify({ ...PAPER, edgeDensity: 0.04 })).toBe("uncertain");
  });

  it("does not reject a flat, paper-like image without an outline (scan or screenshot)", () => {
    expect(classify(PAPER, null)).toBe("uncertain");
  });

  it("makes no document claim when there are too few pixels to measure", () => {
    expect(classify(null, null)).toBe("not-document");
    expect(classify(null)).toBe("uncertain");
  });

  it("measures paper against each block's own level, so a shadow does not count against a page", () => {
    const flat = textSheet(W, H);
    const shadowed = shade(flat, (x) => 1 - 0.55 * (x / W));
    const mask = quadMask(W, H, PAGE);
    const a = measureContent(flat, toGray(flat), mask, 32)!;
    const b = measureContent(shadowed, toGray(shadowed), mask, 32)!;
    expect(a.paperShare).toBeGreaterThan(0.7);
    expect(b.paperShare).toBeGreaterThan(0.7);
  });

  it("measures colour and edges inside the mask only", () => {
    const img = textSheet(W, H);
    const gray = toGray(img);
    const stats = measureContent(img, gray, quadMask(W, H, PAGE), 32)!;
    expect(stats.saturation).toBeLessThan(0.01);
    expect(stats.edgeDensity).toBeGreaterThan(0.09);
    expect(measureContent(img, gray, new Uint8Array(W * H), 32)).toBeNull();
    const blank = solid(W, H, 220);
    expect(measureContent(blank, toGray(blank), quadMask(W, H, PAGE), 32)!.edgeDensity).toBe(0);
  });

  it("does not count a dark, uniform area as paper", () => {
    const dark = solid(W, H, 60);
    expect(measureContent(dark, toGray(dark), quadMask(W, H, PAGE), 32)!.paperShare).toBe(0);
  });

  it("leaves the source untouched", async () => {
    const photo = scene(W, H);
    const copy = photo.data.slice();
    await assess(photo, notFound);
    expect(sameBytes(photo.data, copy)).toBe(true);
  });
});

describe("assessPhoto", () => {
  it("measures a sharp page and leaves the source untouched", async () => {
    const photo = textSheet(W, H);
    const copy = photo.data.slice();
    const a = await assess(photo);
    expect(a.pageDetected).toBe(true);
    expect(a.findings).toHaveLength(6);
    expect(levelOf(a, "sharpness")).toBe("good");
    expect(levelOf(a, "readability")).toBe("good");
    expect(sameBytes(photo.data, copy)).toBe(true);
    // An 800 px photo is below the resolution target, so the best possible verdict is "limited".
    expect(levelOf(a, "resolution")).toBe("poor");
  });

  it("calls a large sharp page a good candidate", async () => {
    const big = textSheet(2400, 1800, 225, 40, 120);
    const a = await assess(big, found([{ x: 90, y: 90 }, { x: 2310, y: 90 }, { x: 2310, y: 1710 }, { x: 90, y: 1710 }]));
    expect(a.verdict).toBe("good");
  });

  it("calls a blurred page a poor candidate", async () => {
    const a = await assess(boxBlur(textSheet(W, H), 3));
    expect(levelOf(a, "sharpness")).toBe("poor");
    expect(a.verdict).toBe("poor");
  });

  it("reports a missing page as a finding, still measuring the whole photo", async () => {
    const a = await assess(textSheet(W, H), notFound);
    expect(a.pageDetected).toBe(false);
    expect(levelOf(a, "geometry")).toBe("poor");
    expect(levelOf(a, "completeness")).toBe("unknown");
    expect(levelOf(a, "sharpness")).toBe("good");
  });

  it("returns engine failures as errors instead of an assessment", async () => {
    const r = await assessPhoto(
      processorFor({ ok: false, error: { code: "engine-unavailable", message: "down" } }),
      textSheet(W, H),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "engine-unavailable" } });
  });

  it("rejects malformed input", async () => {
    const r = await assessPhoto(processorFor(found()), { width: 10, height: 10, data: new Uint8ClampedArray(3) });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  });
});
