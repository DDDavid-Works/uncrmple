import type { CardDetection, CardImageProcessor, RasterImage, Result } from "../../types/repair";
import { downscale } from "./downscale";
import { outputSize, scaleQuad } from "./geometry";
import { DETECTION_MAX_SIDE, validateRaster } from "./pipeline";

/** A card cropped to fewer pixels than this on its long side will look soft. */
export const LOW_RESOLUTION_LONG_SIDE_PX = 600;

/**
 * Detect the card on a downscaled copy and return corners in full-resolution pixels, with the
 * resolution warning evaluated on the full-size crop. Never mutates the source image.
 */
export async function detectCardCorners(
  processor: CardImageProcessor,
  image: RasterImage,
): Promise<Result<CardDetection>> {
  const input = validateRaster(image);
  if (!input.ok) return input;

  const small = downscale(image, DETECTION_MAX_SIDE);
  const detected = await processor.detectCard(small.image);
  if (!detected.ok) return detected;

  const corners = scaleQuad(
    detected.value.corners,
    image.width / small.image.width,
    image.height / small.image.height,
  );
  const size = outputSize(corners);
  const warnings = [...detected.value.warnings];
  if (Math.max(size.width, size.height) < LOW_RESOLUTION_LONG_SIDE_PX && !warnings.includes("low-resolution")) {
    warnings.push("low-resolution");
  }
  return { ok: true, value: { ...detected.value, corners, warnings } };
}
