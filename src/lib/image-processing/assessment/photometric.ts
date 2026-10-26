import type { Finding } from "../../../types/assessment";
import { histPercentile, type BlockStat, type Gray } from "./pixels";

/** Thresholds are first estimates; tune them against real photographs. */
export const SHARPNESS = {
  /** Ratio of the strongest second derivative to the strongest gradient: about 2 or more for a crisp edge, falling as edges blur. */
  good: 1,
  moderate: 0.6,
  /** Below this strongest gradient there is no usable edge (blank page, flat image). */
  minGradient: 15,
  minPixels: 2000,
};
export const LIGHTING = {
  /** Spread of paper brightness across the page: 1 - (10th / 90th percentile of block levels). */
  spreadModerate: 0.15,
  spreadPoor: 0.35,
  /** Fraction of near-white pixels that counts as glare when the paper is not generally bright. */
  glareModerate: 0.03,
  glarePoor: 0.12,
  glareLevel: 250,
  /** Median paper brightness above which the whole photo is treated as over-exposed, not as glare. */
  overexposed: 246,
  /** Median paper brightness below which the photo is treated as dim. */
  dim: 90,
  minBlocks: 6,
};
export const READABILITY = {
  /** A block holds ink if (paper - ink) / paper is at least this. */
  inkContrast: 0.15,
  minInkBlocks: 3,
  /** Median text contrast. */
  good: 0.5,
  moderate: 0.3,
};

const LEVEL_ORDER = ["good", "moderate", "poor"] as const;
const worst = (a: (typeof LEVEL_ORDER)[number], b: (typeof LEVEL_ORDER)[number]) =>
  LEVEL_ORDER[Math.max(LEVEL_ORDER.indexOf(a), LEVEL_ORDER.indexOf(b))]!;

/**
 * Edge sharpness inside the mask. The ratio of the strongest Laplacian to the strongest gradient
 * does not depend on text contrast or shadow strength, only on how steep the edges are.
 * Limitation: the analysis copy is downscaled, so blur smaller than the scale factor is not seen.
 */
export function measureSharpness(gray: Gray, mask: Uint8Array): Finding {
  const { width, height, data } = gray;
  const lap = new Uint32Array(1021);
  const grad = new Uint32Array(362);
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const l = data[i - 1]! + data[i + 1]! + data[i - width]! + data[i + width]! - 4 * data[i]!;
      const gx = data[i + 1]! - data[i - 1]!;
      const gy = data[i + width]! - data[i - width]!;
      lap[Math.abs(l)]!++;
      grad[Math.round(Math.hypot(gx, gy) / 2)]!++;
      n++;
    }
  }
  const unknown: Finding = {
    dimension: "sharpness",
    level: "unknown",
    confidence: 0.2,
    detail: "There is too little text or fine detail to judge sharpness reliably.",
  };
  if (n < SHARPNESS.minPixels) return unknown;
  const gradTop = histPercentile(grad, n, 0.99);
  if (gradTop < SHARPNESS.minGradient) return unknown;
  const ratio = histPercentile(lap, n, 0.99) / gradTop;
  const confidence = Math.min(1, Math.max(0.3, gradTop / 50));
  if (ratio >= SHARPNESS.good) {
    return { dimension: "sharpness", level: "good", confidence, detail: "Text edges look crisp." };
  }
  if (ratio >= SHARPNESS.moderate) {
    return {
      dimension: "sharpness",
      level: "moderate",
      confidence,
      detail: "The photo is slightly soft. Repair can raise contrast but cannot restore fine detail, so small text may stay hard to read.",
    };
  }
  return {
    dimension: "sharpness",
    level: "poor",
    confidence,
    detail: "The photo looks blurred. Lost detail cannot be recovered; retaking the photo is the best fix.",
  };
}

const median = (sorted: number[]) => sorted[Math.floor(sorted.length / 2)]!;

/** Uneven paper brightness (shadows) and glare, from paper-level statistics per block. */
export function measureLighting(stats: BlockStat[], gray: Gray, mask: Uint8Array): Finding {
  if (stats.length < LIGHTING.minBlocks) {
    return { dimension: "lighting", level: "unknown", confidence: 0.2, detail: "The page area is too small to judge lighting." };
  }
  const papers = stats.map((s) => s.paper).sort((a, b) => a - b);
  const p10 = papers[Math.floor(papers.length * 0.1)]!;
  const p90 = papers[Math.min(papers.length - 1, Math.floor(papers.length * 0.9))]!;
  const typical = median(papers);
  const spread = p90 > 0 ? 1 - p10 / p90 : 0;
  let level: "good" | "moderate" | "poor" =
    spread >= LIGHTING.spreadPoor ? "poor" : spread >= LIGHTING.spreadModerate ? "moderate" : "good";

  const notes: string[] = [];
  if (spread >= LIGHTING.spreadModerate) notes.push("uneven lighting or shadows across the page");

  let glare = 0;
  if (typical >= LIGHTING.overexposed) {
    level = worst(level, "moderate");
    notes.push("the paper is very bright, so faint text may wash out");
  } else {
    let bright = 0;
    let n = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      n++;
      if (gray.data[i]! >= LIGHTING.glareLevel) bright++;
    }
    glare = n ? bright / n : 0;
    if (glare >= LIGHTING.glarePoor) level = worst(level, "poor");
    else if (glare >= LIGHTING.glareModerate) level = worst(level, "moderate");
    if (glare >= LIGHTING.glareModerate) notes.push("bright glare spots that can hide text");
  }
  if (typical < LIGHTING.dim) {
    level = worst(level, "moderate");
    notes.push("the photo is dim");
  }

  const detail = notes.length
    ? `The photo has ${notes.join("; ")}. Shadows can be evened out; glare usually cannot.`
    : "Lighting is fairly even.";
  return { dimension: "lighting", level, confidence: Math.min(1, stats.length / 12), detail };
}

/** Contrast of the darkest content against its local paper, as a proxy for text distinguishability (no OCR). */
export function measureReadability(stats: BlockStat[]): Finding {
  const contrasts = stats
    .filter((s) => s.paper >= 40)
    .map((s) => (s.paper - s.ink) / s.paper)
    .filter((c) => c >= READABILITY.inkContrast)
    .sort((a, b) => a - b);
  if (contrasts.length < READABILITY.minInkBlocks) {
    return {
      dimension: "readability",
      level: "unknown",
      confidence: 0.2,
      detail: "No clear text or marks were found, so text contrast could not be judged.",
    };
  }
  const c = median(contrasts);
  const confidence = Math.min(1, contrasts.length / 10);
  if (c >= READABILITY.good) {
    return { dimension: "readability", level: "good", confidence, detail: "Text stands out clearly from the paper." };
  }
  if (c >= READABILITY.moderate) {
    return { dimension: "readability", level: "moderate", confidence, detail: "Text contrast is modest. Repair should help, but faint writing may stay faint." };
  }
  return {
    dimension: "readability",
    level: "poor",
    confidence,
    detail: "Text is very faint against the paper. Some of it may not be recoverable.",
  };
}
