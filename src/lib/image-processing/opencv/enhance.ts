import type { EnhanceOptions, RasterImage, Result } from "../../../types/repair";
import { validateEnhanceOptions } from "../options";
import { processingFailed } from "./detect";
import type { OpenCv } from "./loader";

/** Longest side of the copy used to estimate the lighting field. */
const BACKGROUND_MAX_SIDE = 512;
/** Closing kernel as a fraction of that side; must exceed text stroke width. */
const KERNEL_FRACTION = 1 / 15;
/**
 * The estimated background is never allowed below this fraction of the typical paper level, so
 * large dark areas (stamps, photos, filled boxes) are not bleached to white. Shadows darker than
 * this are only partly corrected.
 */
const BACKGROUND_FLOOR = 0.5;
/**
 * After lighting correction, paper becomes pure white: the white point is this fraction of the
 * paper level, taken as the 75th luminance percentile (paper is always a large share of the page).
 */
const WHITE_POINT_FRACTION = 0.95;
const PAPER_PERCENTILE = 0.75;
const MAX_WHITE_POINT = 250;
/** Smallest allowed gap between black and white points. */
const MIN_LEVEL_RANGE = 64;
/** Black point is this percentile of luminance, so a few dark pixels do not set the scale. */
const BLACK_PERCENTILE = 0.005;
const MAX_BLACK_POINT = 90;

interface Disposable { delete(): void }

/**
 * Lighting correction then output style. Lighting is estimated per colour channel on a small copy
 * (morphological closing removes text, then smoothing) and divided out, which evens shadows and
 * neutralises colour casts without altering strokes. No sharpening or denoising is applied.
 * Returns a new image; the input is never modified.
 */
export function enhance(cv: OpenCv, image: RasterImage, options: EnhanceOptions): Result<RasterImage> {
  const valid = validateEnhanceOptions(options);
  if (!valid.ok) return valid;

  const owned = new Set<Disposable>();
  const own = <T extends Disposable>(x: T): T => (owned.add(x), x);
  const release = (x: Disposable) => {
    if (owned.delete(x)) x.delete();
  };

  try {
    const rgba = own(new cv.Mat(image.height, image.width, cv.CV_8UC4));
    rgba.data.set(image.data);
    const rgb = own(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    release(rgba);

    const flat = own(new cv.Mat());
    flattenLighting(cv, rgb, flat, own, release);
    release(rgb);

    let result: InstanceType<OpenCv["Mat"]>;
    if (options.style === "blackwhite") {
      const gray = own(new cv.Mat());
      cv.cvtColor(flat, gray, cv.COLOR_RGB2GRAY);
      const bw = own(new cv.Mat());
      cv.threshold(gray, bw, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      result = bw;
    } else {
      const gray = own(new cv.Mat());
      cv.cvtColor(flat, gray, cv.COLOR_RGB2GRAY);
      const lut = levelsLut(cv, gray.data, own);
      if (options.style === "grayscale") {
        cv.LUT(gray, lut, gray);
        result = gray;
      } else {
        // Same curve on every channel keeps hue; only brightness range is stretched.
        cv.LUT(flat, lut, flat);
        result = flat;
      }
    }

    const out = own(new cv.Mat());
    cv.cvtColor(result, out, result.channels() === 1 ? cv.COLOR_GRAY2RGBA : cv.COLOR_RGB2RGBA);
    if (out.cols !== image.width || out.rows !== image.height) {
      return processingFailed("Enhancement produced an unexpected size", null);
    }
    // Copy out of the WASM heap before the Mats are released.
    return { ok: true, value: { width: image.width, height: image.height, data: new Uint8ClampedArray(out.data) } };
  } catch (e) {
    return processingFailed("Enhancement failed", e);
  } finally {
    for (const o of owned) o.delete();
  }
}

/** dst = rgb / estimatedBackground * 255, per channel. */
function flattenLighting(
  cv: OpenCv,
  rgb: InstanceType<OpenCv["Mat"]>,
  dst: InstanceType<OpenCv["Mat"]>,
  own: <T extends Disposable>(x: T) => T,
  release: (x: Disposable) => void,
): void {
  const longest = Math.max(rgb.cols, rgb.rows);
  const scale = Math.min(1, BACKGROUND_MAX_SIDE / longest);
  const small = own(new cv.Mat());
  cv.resize(
    rgb, small,
    new cv.Size(Math.max(1, Math.round(rgb.cols * scale)), Math.max(1, Math.round(rgb.rows * scale))),
    0, 0, cv.INTER_AREA,
  );

  const k = oddAtLeast(9, Math.round(Math.max(small.cols, small.rows) * KERNEL_FRACTION));
  const bg = own(new cv.Mat());
  const kernel = own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k)));
  cv.morphologyEx(small, bg, cv.MORPH_CLOSE, kernel);
  cv.GaussianBlur(bg, bg, new cv.Size(k, k), 0);

  // Floor each channel relative to its own typical paper level.
  const levels = channelPercentile(bg.data, bg.channels(), 0.9);
  const floor = own(
    new cv.Mat(bg.rows, bg.cols, cv.CV_8UC3, new cv.Scalar(...levels.map((l) => Math.max(16, l * BACKGROUND_FLOOR)), 0)),
  );
  cv.max(bg, floor, bg);
  release(floor);
  release(small);

  const bgFull = own(new cv.Mat());
  cv.resize(bg, bgFull, new cv.Size(rgb.cols, rgb.rows), 0, 0, cv.INTER_LINEAR);
  release(bg);
  cv.divide(rgb, bgFull, dst, 255, -1);
  release(bgFull);
}

/** Linear stretch: black point at a low luminance percentile, white point relative to the paper level. */
function levelsLut(cv: OpenCv, grayData: Uint8Array, own: <T extends Disposable>(x: T) => T) {
  const black = Math.min(MAX_BLACK_POINT, percentile(grayData, BLACK_PERCENTILE));
  const paper = percentile(grayData, PAPER_PERCENTILE);
  const white = Math.max(black + MIN_LEVEL_RANGE, Math.min(MAX_WHITE_POINT, Math.round(paper * WHITE_POINT_FRACTION)));
  const range = white - black;
  const table = new Uint8Array(256);
  for (let v = 0; v < 256; v++) table[v] = Math.max(0, Math.min(255, Math.round(((v - black) * 255) / range)));
  const lut = own(new cv.Mat(1, 256, cv.CV_8UC1));
  lut.data.set(table);
  return lut;
}

function percentile(data: Uint8Array, p: number, stride = 1, offset = 0): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = offset; i < data.length; i += stride) {
    hist[data[i]!]!++;
    n++;
  }
  const target = n * p;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= target) return v;
  }
  return 255;
}

function channelPercentile(data: Uint8Array, channels: number, p: number): number[] {
  return Array.from({ length: channels }, (_, c) => percentile(data, p, channels, c));
}

function oddAtLeast(min: number, n: number): number {
  const v = Math.max(min, n);
  return v % 2 === 0 ? v + 1 : v;
}
