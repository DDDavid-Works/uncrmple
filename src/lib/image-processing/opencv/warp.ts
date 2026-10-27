import type { Quad, RasterImage, Result, ShiftMap } from "../../../types/repair";
import { sourceMapper, validateShiftMap } from "../dewarp/remap";
import { outputSize, validateFrame, validateQuad } from "../geometry";
import { processingFailed } from "./detect";
import type { OpenCv } from "./loader";

/** Output pixels per remap band: keeps the two float coordinate maps at about 16 MB. */
export const BAND_PIXELS = 2_000_000;

/**
 * Map the quad to an upright rectangle using bicubic interpolation (no sharpening or
 * denoising). With a shift map, the page is also flattened in the same interpolation. With
 * `page`, `quad` is a frame around that outline (it may reach beyond the photo) and everything
 * outside the outline comes out white. Returns a new image; the input is never modified.
 */
export function correctPerspective(
  cv: OpenCv,
  image: RasterImage,
  quad: Quad,
  shift?: ShiftMap,
  page?: Quad,
  bandPixels: number = BAND_PIXELS,
): Result<RasterImage> {
  const valid = page ? validateQuad(page, image.width, image.height) : validateQuad(quad, image.width, image.height);
  if (!valid.ok) return valid;
  if (page) {
    const frame = validateFrame(quad);
    if (!frame.ok) return frame;
  }
  if (shift) {
    const map = validateShiftMap(shift);
    if (!map.ok) return map;
  }
  if (shift || page) return remapPage(cv, image, quad, shift ?? null, page ?? null, bandPixels);

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

/** Fill for the area outside the page outline: blank paper. */
const PAPER = [255, 255, 255, 255] as const;

/**
 * Perspective correction plus flattening as one bicubic remap of the photo. The output is built in
 * horizontal bands so the coordinate maps stay small even for very large pages.
 */
function remapPage(cv: OpenCv, image: RasterImage, quad: Quad, shift: ShiftMap | null, page: Quad | null, bandPixels: number): Result<RasterImage> {
  const { width, height } = outputSize(quad);
  const mapper = sourceMapper(quad, width, height, shift, page);
  if (!mapper) return processingFailed("Page flattening could not map the page corners", null);
  const bandRows = Math.max(1, Math.min(height, Math.floor(bandPixels / width)));
  const out = new Uint8ClampedArray(width * height * 4);
  const owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(x: T): T => (owned.push(x), x);

  try {
    const src = own(new cv.Mat(image.height, image.width, cv.CV_8UC4));
    src.data.set(image.data);
    const mapX = own(new cv.Mat(bandRows, width, cv.CV_32FC1));
    const mapY = own(new cv.Mat(bandRows, width, cv.CV_32FC1));
    const dst = own(new cv.Mat());
    for (let y0 = 0; y0 < height; y0 += bandRows) {
      const rows = Math.min(bandRows, height - y0);
      // The last band may be shorter: use views of the first `rows` rows of the maps.
      const xs = rows === bandRows ? mapX : own(mapX.rowRange(0, rows));
      const ys = rows === bandRows ? mapY : own(mapY.rowRange(0, rows));
      mapper.fill(y0, y0 + rows, xs.data32F, ys.data32F);
      // Outside a page outline the map points off the photo, where the constant fill applies.
      if (page) cv.remap(src, dst, xs, ys, cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar(...PAPER));
      else cv.remap(src, dst, xs, ys, cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
      if (dst.cols !== width || dst.rows !== rows) {
        return processingFailed("Page flattening produced an unexpected size", null);
      }
      out.set(dst.data, y0 * width * 4);
    }
    return { ok: true, value: { width, height, data: out } };
  } catch (e) {
    return processingFailed("Page flattening failed", e);
  } finally {
    for (const o of owned) o.delete();
  }
}
