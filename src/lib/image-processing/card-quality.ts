import type { CardQualityIssue, RasterImage } from "../../types/repair";
import { downscale } from "./downscale";

/** Long side of the copy used to measure blur, so the measure does not depend on photo size. */
export const QUALITY_MAX_SIDE = 640;
/** Variance of the Laplacian below this on a card with printed detail suggests blur. A heuristic. */
export const BLUR_VARIANCE_MIN = 25;
/** Pixels at or above this luminance count as blown out. A white card in good light stays below it. */
const GLARE_LUMINANCE = 250;
/** Glare is reported when it covers at least this share of the card. */
export const GLARE_SHARE_MIN = 0.03;

const luminance = (d: Uint8ClampedArray, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

/**
 * Cheap, conventional checks on a cropped card for problems that enhancement cannot repair.
 * These are heuristics tuned on synthetic images; they should be re-calibrated on real photos.
 * Does not modify the image.
 */
export function measureCardQuality(image: RasterImage): CardQualityIssue[] {
  const small = downscale(image, QUALITY_MAX_SIDE).image;
  const { width: w, height: h, data } = small;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const l = luminance(data, p * 4);
    gray[p] = l;
  }

  const issues: CardQualityIssue[] = [];
  let bright = 0;
  for (let p = 0; p < n; p++) if (gray[p]! >= GLARE_LUMINANCE) bright++;
  if (bright / n >= GLARE_SHARE_MIN) issues.push("glare");

  if (w >= 8 && h >= 8) {
    let sum = 0, sumSq = 0, count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = 4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!;
        sum += lap; sumSq += lap * lap; count++;
      }
    }
    const mean = sum / count;
    if (sumSq / count - mean * mean < BLUR_VARIANCE_MIN) issues.push("blur");
  }
  return issues;
}
