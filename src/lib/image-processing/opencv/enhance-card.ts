import type { CardEnhanceOptions, RasterImage, Result } from "../../../types/repair";
import { hasCardEnhancement, validateCardEnhanceOptions } from "../card-options";
import { processingFailed } from "./detect";
import type { OpenCv } from "./loader";

/** Longest side of the copy used to estimate the lighting field. */
const LIGHT_MAX_SIDE = 256;
/** Blur radius for the lighting field, as a fraction of that side: far larger than any printed detail. */
const LIGHT_SIGMA_FRACTION = 0.25;
/** Lighting gain is limited so large dark or bright printed areas are never "corrected" away. */
const LIGHT_GAIN_RANGE: readonly [number, number] = [0.8, 1.25];
/** Contrast: black/white points at these luminance percentiles, never stretching more than ~1.6x. */
const BLACK_PERCENTILE = 0.005;
const WHITE_PERCENTILE = 0.995;
const MAX_BLACK_POINT = 60;
const MIN_WHITE_POINT = 180;
const MIN_LEVEL_RANGE = 160;
/** Bilateral denoise: small window, low colour tolerance, so text edges and fine print survive. */
const DENOISE = { diameter: 5, sigmaColor: 20, sigmaSpace: 5 };
/** Unsharp mask: result = (1 + amount) * image - amount * blurred. */
const SHARPEN = { sigma: 1.0, amount: 0.5 };

interface Disposable { delete(): void }
type Mat = InstanceType<OpenCv["Mat"]>;

/**
 * Conservative touch-ups for a cropped card, applied in a fixed order: lighting, contrast,
 * denoise, sharpen, grayscale. Every step only rescales or smooths existing pixels; nothing is
 * synthesised. Selecting no option is an error rather than a silent no-op "success".
 * Returns a new image; the input is never modified. All OpenCV objects are released.
 */
export function enhanceCard(cv: OpenCv, image: RasterImage, options: CardEnhanceOptions): Result<RasterImage> {
  const valid = validateCardEnhanceOptions(options);
  if (!valid.ok) return valid;
  if (!hasCardEnhancement(options)) {
    return { ok: false, error: { code: "invalid-input", message: "No enhancement was selected." } };
  }

  const owned = new Set<Disposable>();
  const own = <T extends Disposable>(x: T): T => (owned.add(x), x);
  const release = (x: Disposable) => {
    if (owned.delete(x)) x.delete();
  };

  try {
    const rgba = own(new cv.Mat(image.height, image.width, cv.CV_8UC4));
    rgba.data.set(image.data);
    let rgb = own(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    release(rgba);

    if (options.evenLighting) {
      const next = own(new cv.Mat());
      flattenLighting(cv, rgb, next, own, release);
      release(rgb);
      rgb = next;
    }
    if (options.autoContrast) {
      stretchContrast(cv, rgb, own);
    }
    if (options.denoise) {
      const next = own(new cv.Mat());
      cv.bilateralFilter(rgb, next, DENOISE.diameter, DENOISE.sigmaColor, DENOISE.sigmaSpace);
      release(rgb);
      rgb = next;
    }
    if (options.sharpen) {
      const blur = own(new cv.Mat());
      cv.GaussianBlur(rgb, blur, new cv.Size(0, 0), SHARPEN.sigma);
      const next = own(new cv.Mat());
      cv.addWeighted(rgb, 1 + SHARPEN.amount, blur, -SHARPEN.amount, 0, next);
      release(blur);
      release(rgb);
      rgb = next;
    }

    const out = own(new cv.Mat());
    if (options.grayscale) {
      const gray = own(new cv.Mat());
      cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
      cv.cvtColor(gray, out, cv.COLOR_GRAY2RGBA);
    } else {
      cv.cvtColor(rgb, out, cv.COLOR_RGB2RGBA);
    }
    if (out.cols !== image.width || out.rows !== image.height) {
      return processingFailed("Card enhancement produced an unexpected size", null);
    }
    // Copy out of the WASM heap before the Mats are released.
    return { ok: true, value: { width: image.width, height: image.height, data: new Uint8ClampedArray(out.data) } };
  } catch (e) {
    return processingFailed("Card enhancement failed", e);
  } finally {
    for (const o of owned) o.delete();
  }
}

/**
 * Divide out a very smooth luminance field so gentle gradients vanish. The same gain is applied
 * to every channel (hue preserved) and is clamped, so only mild unevenness is corrected.
 */
function flattenLighting(
  cv: OpenCv,
  rgb: Mat,
  dst: Mat,
  own: <T extends Disposable>(x: T) => T,
  release: (x: Disposable) => void,
): void {
  const scale = Math.min(1, LIGHT_MAX_SIDE / Math.max(rgb.cols, rgb.rows));
  const small = own(new cv.Mat());
  cv.resize(
    rgb, small,
    new cv.Size(Math.max(1, Math.round(rgb.cols * scale)), Math.max(1, Math.round(rgb.rows * scale))),
    0, 0, cv.INTER_AREA,
  );
  const gray = own(new cv.Mat());
  cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);
  release(small);
  const field = own(new cv.Mat());
  cv.GaussianBlur(gray, field, new cv.Size(0, 0), LIGHT_SIGMA_FRACTION * Math.max(gray.cols, gray.rows));
  let mean = 0;
  for (let i = 0; i < gray.data.length; i++) mean += gray.data[i]!;
  mean /= gray.data.length;
  release(gray);

  const gainSmall = own(new cv.Mat(field.rows, field.cols, cv.CV_32FC1));
  const g = gainSmall.data32F;
  for (let i = 0; i < field.data.length; i++) {
    const raw = mean / Math.max(1, field.data[i]!);
    g[i] = Math.min(LIGHT_GAIN_RANGE[1], Math.max(LIGHT_GAIN_RANGE[0], raw));
  }
  release(field);
  const gain = own(new cv.Mat());
  cv.resize(gainSmall, gain, new cv.Size(rgb.cols, rgb.rows), 0, 0, cv.INTER_LINEAR);
  release(gainSmall);

  const rgbF = own(new cv.Mat());
  rgb.convertTo(rgbF, cv.CV_32FC3);
  const channels = own(new cv.MatVector());
  cv.split(rgbF, channels);
  release(rgbF);
  for (let c = 0; c < 3; c++) {
    const ch = channels.get(c);
    cv.multiply(ch, gain, ch);
    ch.delete();
  }
  release(gain);
  const merged = own(new cv.Mat());
  cv.merge(channels, merged);
  release(channels);
  merged.convertTo(dst, cv.CV_8UC3);
  release(merged);
}

/** Linear stretch with the same curve on every channel (hue preserved), in place. */
function stretchContrast(cv: OpenCv, rgb: Mat, own: <T extends Disposable>(x: T) => T): void {
  const gray = own(new cv.Mat());
  cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
  const black = Math.min(MAX_BLACK_POINT, percentile(gray.data, BLACK_PERCENTILE));
  const white = Math.max(black + MIN_LEVEL_RANGE, Math.min(255, Math.max(MIN_WHITE_POINT, percentile(gray.data, WHITE_PERCENTILE))));
  const table = new Uint8Array(256);
  for (let v = 0; v < 256; v++) table[v] = Math.max(0, Math.min(255, Math.round(((v - black) * 255) / (white - black))));
  const lut = own(new cv.Mat(1, 256, cv.CV_8UC1));
  lut.data.set(table);
  cv.LUT(rgb, lut, rgb);
}

function percentile(data: Uint8Array, p: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]!]!++;
  const target = data.length * p;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= target) return v;
  }
  return 255;
}
