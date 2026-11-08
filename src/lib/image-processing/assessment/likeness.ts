import type { Assessment, PageLikeness } from "../../../types/assessment";
import type { Quad, RasterImage } from "../../../types/repair";
import { downscale } from "../downscale";
import { polygonArea, scaleQuad } from "../geometry";
import { histPercentile, insetMask, quadMask, shrinkQuad, toGray, type Gray } from "./pixels";

/** Longest side of the copy used for pixel measurements (sharpness needs more detail than detection). */
export const ANALYSIS_MAX_SIDE = 1600;
/** Share of the page pulled in from each edge so the page border does not count as content. */
export const PAGE_INSET = 0.04;
/** Share of the photo left out at each edge when there is no page outline to measure inside. */
export const FRAME_INSET = 0.02;
/** Blocks across the longer side of the copy, for the per-block paper level. */
export const BLOCKS_ACROSS = 24;

export const blockSize = (image: RasterImage) => Math.max(16, Math.round(Math.max(image.width, image.height) / BLOCKS_ACROSS));

/** Thresholds are first estimates; tune them against real photographs. */
export const LIKENESS = {
  /** A detected outline smaller than this share of the photo is probably not the page. */
  minAreaFraction: 0.15,
  /** Below this edge support the outline is not trusted. */
  minEdgeSupport: 0.3,
  /** Pixels within this fraction below the paper level count as paper. */
  paperBand: 0.2,
  /** Paper dominates a document photo; measured on test photos: pages 0.74-0.92, scenes and cards 0.46-0.64. */
  minPaperShare: 0.7,
  /** Below this paper share, with few edges, the content is clearly not a page (see minEdgeDensity). */
  maxNonPaperShare: 0.65,
  /** Mean colour saturation (0..1); paper, ink and pencil are close to neutral. */
  maxSaturation: 0.35,
  /** Mean saturation above which the content is vivid colour, not paper and ink; measured: pages 0.04-0.18, a house photo 0.45, a card on a table 0.60. */
  vividSaturation: 0.4,
  /** Text and rules give a page many strong edges; measured on test photos: pages 0.10-0.26, cards and scenes 0.01-0.08. */
  minEdgeDensity: 0.09,
  /**
   * Sparse pages (handwriting, a receipt with a few short lines) have fewer edges; measured: a
   * handwritten note 0.059, a prescription 0.070, a receipt 0.086, all with paper share 0.89-0.94.
   * Accepted down to this edge density when the paper share is at least sparsePaperShare; cards and
   * scenes are ruled out by paper share and colour (measured 0.48-0.64 paper share).
   */
  minSparseEdgeDensity: 0.05,
  sparsePaperShare: 0.8,
  /**
   * Below this there is no print at all: a plain or blank image. Measured over the whole frame of the
   * test photos: document photos 0.052-0.30, other scenes 0.030-0.18, a plain image 0.
   */
  minPrintDensity: 0.015,
  /** Paper must be reasonably bright. */
  minPaperLevel: 110,
  /** A block darker than this cannot be paper, however uniform it is (night scenes, dark tables). */
  minBlockPaperLevel: 90,
  /** Gradient magnitude (grey levels per pixel) counted as a strong edge. */
  strongGradient: 20,
  minPixels: 1000,
};

export interface ContentStats {
  /**
   * Share (0..1) of measured pixels close to the paper level of their own block, so a shadow
   * across the page does not count against it. Blocks too dark to be paper count as non-paper.
   */
  paperShare: number;
  /** Mean saturation (0..1) of measured pixels. */
  saturation: number;
  /** Median of the per-block paper levels (90th percentile luminance per block). */
  paperLevel: number;
  /** Share (0..1) of measured pixels on a strong edge. */
  edgeDensity: number;
}

/**
 * Tone, colour and edge statistics inside the mask, or null when there are too few pixels to say.
 * `block` is the grid size used for the per-block paper level.
 */
export function measureContent(image: RasterImage, gray: Gray, mask: Uint8Array, block: number): ContentStats | null {
  const { width, height } = gray;
  const { data } = image;
  const hist = new Uint32Array(256);
  const papers: number[] = [];
  let n = 0;
  let paper = 0;
  let sat = 0;
  for (let by = 0; by + block <= height; by += block) {
    for (let bx = 0; bx + block <= width; bx += block) {
      hist.fill(0);
      let count = 0;
      for (let y = by; y < by + block; y++) {
        for (let x = bx; x < bx + block; x++) {
          if (mask[y * width + x]) {
            hist[gray.data[y * width + x]!]!++;
            count++;
          }
        }
      }
      if (count < 0.6 * block * block) continue;
      const level = histPercentile(hist, count, 0.9);
      papers.push(level);
      n += count;
      if (level >= LIKENESS.minBlockPaperLevel) {
        for (let v = Math.ceil(level * (1 - LIKENESS.paperBand)); v < 256; v++) paper += hist[v]!;
      }
      for (let y = by; y < by + block; y++) {
        for (let x = bx; x < bx + block; x++) {
          const i = y * width + x;
          if (!mask[i]) continue;
          const r = data[i * 4]!, g = data[i * 4 + 1]!, b = data[i * 4 + 2]!;
          const max = Math.max(r, g, b);
          if (max > 0) sat += (max - Math.min(r, g, b)) / max;
        }
      }
    }
  }
  if (n < LIKENESS.minPixels) return null;
  papers.sort((a, b) => a - b);
  return { paperShare: paper / n, saturation: sat / n, paperLevel: papers[papers.length >> 1]!, edgeDensity: measureEdgeDensity(gray, mask) };
}

/** Share of pixels inside the mask on a strong edge (central-difference gradient). */
function measureEdgeDensity(gray: Gray, mask: Uint8Array): number {
  const { width, height, data } = gray;
  let n = 0;
  let strong = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      n++;
      const gx = (data[i + 1]! - data[i - 1]!) / 2;
      const gy = (data[i + width]! - data[i - width]!) / 2;
      if (Math.hypot(gx, gy) >= LIKENESS.strongGradient) strong++;
    }
  }
  return n ? strong / n : 0;
}

export interface LikenessInput {
  /** Page outline in full-photo pixels, or null when none was found. */
  quad: Quad | null;
  edgeSupport?: number;
  width: number;
  height: number;
  content: ContentStats | null;
}

export function classifyLikeness({ quad, edgeSupport, width, height, content }: LikenessInput): PageLikeness {
  const outlineOk =
    quad !== null &&
    polygonArea(quad) >= LIKENESS.minAreaFraction * width * height &&
    (edgeSupport === undefined || edgeSupport >= LIKENESS.minEdgeSupport);
  if (!content) return outlineOk ? "uncertain" : "not-document";
  const paperLike =
    content.paperLevel >= LIKENESS.minPaperLevel &&
    content.paperShare >= LIKENESS.minPaperShare &&
    content.saturation <= LIKENESS.maxSaturation &&
    (content.edgeDensity >= LIKENESS.minEdgeDensity ||
      (content.edgeDensity >= LIKENESS.minSparseEdgeDensity && content.paperShare >= LIKENESS.sparsePaperShare));
  // Clearly not a page whatever outline was found: little paper and few edges, vivid colour, or no print at all.
  const clearlyNotPaper =
    (content.paperShare < LIKENESS.maxNonPaperShare && content.edgeDensity < LIKENESS.minEdgeDensity) ||
    content.saturation > LIKENESS.vividSaturation ||
    content.edgeDensity < LIKENESS.minPrintDensity;
  if (clearlyNotPaper) return "not-document";
  if (outlineOk && paperLike) return "document";
  return "uncertain";
}

/**
 * Whether a photo looks like a paper page, measured inside the page outline (full-photo pixels) or,
 * without one, over the whole frame: the photo check's measures and thresholds, for deciding
 * whether to repair at all. "not-document" for a scene, a face, vivid colour or a plain image.
 */
export function photoLikeness(image: RasterImage, quad: Quad | null, edgeSupport?: number): PageLikeness {
  const analysis = downscale(image, ANALYSIS_MAX_SIDE).image;
  const gray = toGray(analysis);
  const scaled = quad && scaleQuad(quad, analysis.width / image.width, analysis.height / image.height);
  const mask = scaled
    ? quadMask(analysis.width, analysis.height, shrinkQuad(scaled, PAGE_INSET))
    : insetMask(analysis.width, analysis.height, FRAME_INSET);
  return classifyLikeness({
    quad,
    edgeSupport,
    width: image.width,
    height: image.height,
    content: measureContent(analysis, gray, mask, blockSize(analysis)),
  });
}

/**
 * Fold the likeness into the verdict. A photo that does not look like a document is never called
 * a good repair candidate, whatever the individual measurements say.
 */
export function withLikeness(
  base: Pick<Assessment, "verdict" | "summary">,
  likeness: PageLikeness,
): Pick<Assessment, "likeness" | "verdict" | "summary"> {
  if (likeness === "document") return { ...base, likeness };
  if (likeness === "not-document") {
    return {
      likeness,
      verdict: "poor",
      summary:
        "No document detected. This does not look like a photo of a paper page, so a document repair could make it look worse. You can mark the corners yourself, clean up the whole image without cropping, or leave it as it is.",
    };
  }
  // A "good" summary would contradict the doubt, so it is replaced; a "limited" or "poor" one names
  // the problems behind the verdict, so it is kept and the doubt follows it.
  return {
    likeness,
    verdict: base.verdict === "good" ? "limited" : base.verdict,
    summary: base.verdict === "good" ? UNCONFIRMED_PAGE : `${base.summary} ${UNCONFIRMED_PAGE}`,
  };
}

const UNCONFIRMED_PAGE =
  "A paper page could not be confirmed in this photo. If it is a flat scan or a screenshot, you can clean up the whole image without cropping; otherwise mark the corners yourself. Check the result against the original.";
