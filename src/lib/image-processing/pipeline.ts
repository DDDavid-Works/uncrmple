import type {
  ImageProcessor, Quad, RasterImage, RepairError, RepairOptions, RepairResult, Result, ShiftMap,
} from "../../types/repair";
import { planDeskew } from "./deskew";
import { planDewarp } from "./dewarp/plan";
import { downscale } from "./downscale";
import { scaleQuad, validateQuad } from "./geometry";
import { DEFAULT_ENHANCE_OPTIONS, validateEnhanceOptions } from "./options";

/** Longest side of the copy used for page detection. */
export const DETECTION_MAX_SIDE = 800;

const fail = (error: RepairError): Result<never> => ({ ok: false, error });

export function validateRaster(image: RasterImage): Result<RasterImage> {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return fail({ code: "invalid-input", message: "The image has invalid dimensions." });
  }
  if (data.length !== width * height * 4) {
    return fail({ code: "invalid-input", message: "The image pixel data does not match its dimensions." });
  }
  return { ok: true, value: image };
}

/**
 * Detect (or accept) the page corners, correct perspective (levelling any tilt the print still
 * has inside the page outline, and flattening curved lines when that is shown to help), then even
 * out lighting and apply the output style. Every failure is returned as a structured error; an
 * unchanged image is never reported as a successful repair.
 */
export async function repair(
  processor: ImageProcessor,
  image: RasterImage,
  options: RepairOptions = {},
): Promise<Result<RepairResult>> {
  const style = validateEnhanceOptions(options.enhance ?? DEFAULT_ENHANCE_OPTIONS);
  if (!style.ok) return style;
  const input = validateRaster(image);
  if (!input.ok) return input;

  let corners = options.corners;
  let source: RepairResult["source"] = "manual";
  let areaFraction: number | undefined;
  let edgeSupport: number | undefined;

  if (corners) {
    const valid = validateQuad(corners, image.width, image.height);
    if (!valid.ok) return valid;
  } else {
    // Detect on a small copy, then map the corners back to full resolution.
    const small = downscale(image, DETECTION_MAX_SIDE);
    const detected = await processor.detectDocument(small.image);
    if (!detected.ok) return detected;
    corners = scaleQuad(
      detected.value.corners,
      image.width / small.image.width,
      image.height / small.image.height,
    );
    source = detected.value.method;
    areaFraction = detected.value.areaFraction;
    edgeSupport = detected.value.edgeSupport;
  }

  // Paper that is not flat can leave the print leaning inside a square outline: measure that and
  // fold the correction into the single full-resolution warp.
  // A levelled page is warped through a rotated frame around it; `page` tells the warp which part
  // of that frame is the page (the rest is filled with white rather than cut from the page).
  let warpQuad = corners;
  let page: Quad | undefined;
  let deskew: RepairResult["deskew"] = { measured: null, applied: 0, skipped: "off", bent: false };
  if (options.deskew !== false) {
    const plan = await planDeskew(processor, image, corners);
    if (!plan.ok) return plan;
    warpQuad = plan.value.quad;
    deskew = plan.value.deskew;
    if (deskew.applied !== 0) page = corners;
  }

  // Curved or creased paper bends the lines; flatten them in the same warp when a trial on a small
  // copy shows it makes them clearly straighter.
  let shift: ShiftMap | undefined;
  let dewarp: RepairResult["dewarp"] = { applied: false, skipped: "off", bendBefore: null, bendAfter: null, coverage: null };
  if (options.dewarp !== false) {
    const plan = await planDewarp(processor, image, warpQuad, page);
    if (!plan.ok) return plan;
    shift = plan.value.map ?? undefined;
    dewarp = plan.value.dewarp;
  }

  const warped = await processor.correctPerspective(image, warpQuad, shift, page);
  if (!warped.ok) return warped;

  const enhanced = await processor.enhance(warped.value, style.value);
  if (!enhanced.ok) return enhanced;
  return {
    ok: true,
    value: {
      image: enhanced.value,
      straightened: warped.value,
      corners,
      deskew,
      dewarp,
      source,
      style: style.value.style,
      areaFraction,
      edgeSupport,
    },
  };
}
