import type { Assessment } from "../../../types/assessment";
import type { ImageProcessor, Quad, RasterImage, Result } from "../../../types/repair";
import { straightenSmall } from "../deskew";
import { traceLines } from "../dewarp/trace";
import { measureTilt } from "../tilt";
import { downscale } from "../downscale";
import { scaleQuad } from "../geometry";
import { DETECTION_MAX_SIDE, validateRaster } from "../pipeline";
import { ANALYSIS_MAX_SIDE, blockSize, classifyLikeness, FRAME_INSET, measureContent, withLikeness } from "./likeness";
import { measureCompleteness, measureGeometry, measureResolution } from "./geometry-findings";
import type { TextSize } from "./geometry-findings";
import { measureLighting, measureReadability, measureSharpness } from "./photometric";
import { blockStats, insetMask, quadMask, shrinkQuad, toGray } from "./pixels";
import { summarise } from "./verdict";

/** Share of the page pulled in from each edge so the page border does not count as content. */
const PAGE_INSET = 0.04;

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

  // Lean and bend of the printed lines, and the size of the text, once the page is straightened.
  // Secondary measures: if the engine cannot warp here, the findings simply go without them
  // (repair reports its own errors).
  const straight = quad ? await straightenSmall(processor, image, quad) : null;
  const straightGray = straight?.ok ? toGray(straight.value.page) : null;
  const tilt = straightGray ? measureTilt(straightGray) : null;
  let text: TextSize | null = null;
  if (straight?.ok && straightGray) {
    const trace = traceLines(straightGray);
    const textLines = trace.lines.filter((l) => l.kind === "text").length;
    if (trace.rowPitch !== null) text = { rowPitch: trace.rowPitch * straight.value.scale, lines: textLines };
  }

  const analysis = downscale(image, ANALYSIS_MAX_SIDE).image;
  const gray = toGray(analysis);
  const scaled = quad && scaleQuad(quad, analysis.width / image.width, analysis.height / image.height);
  const mask = scaled
    ? quadMask(analysis.width, analysis.height, shrinkQuad(scaled, PAGE_INSET))
    : insetMask(analysis.width, analysis.height, FRAME_INSET);
  const block = blockSize(analysis);
  const stats = blockStats(gray, mask, block);

  const findings = [
    measureGeometry(quad, edgeSupport, tilt),
    measureLighting(stats, gray, mask),
    measureSharpness(gray, mask),
    measureResolution(quad, image.width, image.height, text),
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
