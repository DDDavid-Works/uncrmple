import type { Quad, RasterImage, Result } from "../../../types/repair";
import { outputSize, validateQuad } from "../geometry";
import { processingFailed } from "./detect";
import type { OpenCv } from "./loader";

/**
 * Map the quad to an upright rectangle using bicubic interpolation (no sharpening or
 * denoising). Returns a new image; the input is never modified.
 */
export function correctPerspective(cv: OpenCv, image: RasterImage, quad: Quad): Result<RasterImage> {
  const valid = validateQuad(quad, image.width, image.height);
  if (!valid.ok) return valid;

  const { width, height } = outputSize(quad);
  const owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(x: T): T => (owned.push(x), x);

  try {
    const src = own(new cv.Mat(image.height, image.width, cv.CV_8UC4));
    src.data.set(image.data);
    const from = own(cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y])));
    const to = own(
      cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]),
    );
    const transform = own(cv.getPerspectiveTransform(from, to));
    const dst = own(new cv.Mat());
    cv.warpPerspective(
      src, dst, transform, new cv.Size(width, height),
      cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar(),
    );
    if (dst.cols !== width || dst.rows !== height) {
      return processingFailed("Perspective correction produced an unexpected size", null);
    }
    // Copy out of the WASM heap before the Mats are released.
    return { ok: true, value: { width, height, data: new Uint8ClampedArray(dst.data) } };
  } catch (e) {
    return processingFailed("Perspective correction failed", e);
  } finally {
    for (const o of owned) o.delete();
  }
}
