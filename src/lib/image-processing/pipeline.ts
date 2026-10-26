import type {
  ImageProcessor, RasterImage, RepairError, RepairOptions, RepairResult, Result,
} from "../../types/repair";
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
 * Detect (or accept) the page corners, correct perspective, then even out lighting and apply the
 * output style. Every failure is returned as a
 * structured error; an unchanged image is never reported as a successful repair.
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

  const warped = await processor.correctPerspective(image, corners);
  if (!warped.ok) return warped;

  const enhanced = await processor.enhance(warped.value, style.value);
  if (!enhanced.ok) return enhanced;
  return {
    ok: true,
    value: { image: enhanced.value, corners, source, style: style.value.style, areaFraction, edgeSupport },
  };
}
