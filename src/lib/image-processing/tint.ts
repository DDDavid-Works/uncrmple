import type { RasterImage } from "../../types/repair";
import type { Gray } from "./boundary";

/**
 * How much a one-level colour difference is magnified. A white receipt on a light desk can differ
 * from it by barely any brightness and only 5-8 levels of red minus blue (a warm desk, neutral
 * paper); at this gain that becomes a step of 30-50, well past BOUNDARY_STEP, while the ±2 level
 * noise of a phone JPEG is evened out by the blur and by boundaryContrast's probe averaging.
 */
export const TINT_GAIN = 6;
/** Box blur radius (px) applied to each tint channel before use. */
const BLUR_RADIUS = 2;

/**
 * Two colour-difference images that ignore brightness: warm against cool (red minus blue) and
 * green against magenta (green minus the mean of red and blue), each centred on 128 and magnified
 * by TINT_GAIN. Neutral paper is 128 in both whatever its brightness, so the edge of a sheet shows
 * where the surface around it has any tint at all, even when the two are equally bright. Print on
 * the page is neutral too and leaves no trace. The source image is not modified.
 */
export function tintChannels(image: RasterImage): [Gray, Gray] {
  const { width, height, data } = image;
  const warm = new Uint8Array(width * height);
  const green = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < warm.length; i += 4, p++) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    warm[p] = clamp(128 + TINT_GAIN * (r - b));
    green[p] = clamp(128 + TINT_GAIN * (g - (r + b) / 2));
  }
  return [
    { width, height, data: boxBlur(warm, width, height, BLUR_RADIUS) },
    { width, height, data: boxBlur(green, width, height, BLUR_RADIUS) },
  ];
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Separable box blur with clamped borders; returns a new array. */
function boxBlur(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const tmp = new Float32Array(src.length);
  const out = new Uint8Array(src.length);
  const n = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[row + Math.min(width - 1, Math.max(0, x + k))]!;
      tmp[row + x] = sum / n;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(height - 1, Math.max(0, y + k)) * width + x]!;
      out[y * width + x] = Math.round(sum / n);
    }
  }
  return out;
}
