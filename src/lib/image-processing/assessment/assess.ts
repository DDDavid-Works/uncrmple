import type { Assessment } from "../../../types/assessment";
import type { ImageProcessor, Quad, RasterImage, Result } from "../../../types/repair";
import { downscale } from "../downscale";
import { scaleQuad } from "../geometry";
import { DETECTION_MAX_SIDE, validateRaster } from "../pipeline";
import { classifyLikeness, measureContent, withLikeness } from "./likeness";
import { measureCompleteness, measureGeometry, measureResolution } from "./geometry-findings";
import { measureLighting, measureReadability, measureSharpness } from "./photometric";
import { blockStats, insetMask, quadMask, shrinkQuad, toGray } from "./pixels";
import { summarise } from "./verdict";

/** Longest side of the copy used for pixel measurements (sharpness needs more detail than detection). */
export const ANALYSIS_MAX_SIDE = 1600;
/** Share of the page pulled in from each edge so the page border does not count as content. */
const PAGE_INSET = 0.04;
const FRAME_INSET = 0.02;
const BLOCKS_ACROSS = 24;

/**
 * Estimate how repairable a photo is, before repairing it. Page detection goes through the
 * processor; every other measure is plain arithmetic on a downscaled copy. The source image is
 * never modified. A page that is simply not found is a finding, not an error; engine failures
 * are returned as errors.
 */
export async function assessPhoto(processor: ImageProcessor, image: RasterImage): Promise<Result<Assessment>> {
  const input = validateRaster(image);
  if (!input.ok) return input;

  const small = downscale(image, DETECTION_MAX_SIDE).image;
  const detected = await processor.detectDocument(small);
  let quad: Quad | null = null;
  let edgeSupport: number | undefined;
  if (detected.ok) {
    quad = scaleQuad(detected.value.corners, image.width / small.width, image.height / small.height);
    edgeSupport = detected.value.edgeSupport;
  } else if (detected.error.code !== "no-document-found") {
    return detected;
  }

  const analysis = downscale(image, ANALYSIS_MAX_SIDE).image;
  const gray = toGray(analysis);
  const scaled = quad && scaleQuad(quad, analysis.width / image.width, analysis.height / image.height);
  const mask = scaled
    ? quadMask(analysis.width, analysis.height, shrinkQuad(scaled, PAGE_INSET))
    : insetMask(analysis.width, analysis.height, FRAME_INSET);
  const block = Math.max(16, Math.round(Math.max(analysis.width, analysis.height) / BLOCKS_ACROSS));
  const stats = blockStats(gray, mask, block);

  const findings = [
    measureGeometry(quad, edgeSupport),
    measureLighting(stats, gray, mask),
    measureSharpness(gray, mask),
    measureResolution(quad, image.width, image.height),
    measureCompleteness(quad, image.width, image.height),
    measureReadability(stats),
  ];
  const likeness = classifyLikeness({
    quad,
    edgeSupport,
    width: image.width,
    height: image.height,
    content: measureContent(analysis, gray, mask, block),
  });
  return {
    ok: true,
    value: { ...withLikeness(summarise(findings), likeness), findings, pageDetected: quad !== null },
  };
}
