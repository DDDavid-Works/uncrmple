import type { Deskew, ImageProcessor, Point, Quad, RasterImage, Result, ShiftMap } from "../../types/repair";
import { toGray } from "./assessment/pixels";
import { downscale } from "./downscale";
import { applyHomography, homography, outputSize, rectQuad, scaleQuad } from "./geometry";
import { measureTilt, type TiltMeasurement } from "./tilt";

/** Thresholds are first estimates; tune them against real photographs. */
export const DESKEW = {
  /** Smaller tilts are left alone: not visible, and every rotation costs a little sharpness at the corners. */
  minDeg: 0.3,
  /** Larger "tilts" are more likely a misreading (e.g. diagonal artwork) than a real residual tilt. */
  maxDeg: 5,
  minConfidence: 0.5,
  /**
   * Band angles differing by at least this many degrees mean the page is curved or creased. On the
   * first real samples, flat pages measured 0.5–0.6° and a visibly curved form 0.74°.
   */
  bendDeg: 0.7,
};
/** Longest side of the straightened copy used to measure tilt. */
export const TILT_MAX_SIDE = 1200;

/**
 * The source quad (the "frame") whose perspective warp yields the page rotated by `-angle` degrees,
 * i.e. with lines that leaned by `angle` made level. `quad` is the page outline in source pixels,
 * `width` and `height` the size of its straightened output. The frame is enlarged just enough to
 * hold the whole rotated page, so no printed content is cut off; it may reach beyond the page and
 * the photo, and the warp fills that area with white. Returns null for degenerate corners.
 */
export function deskewQuad(quad: Quad, width: number, height: number, angle: number): Quad | null {
  const toSource = homography(rectQuad(width, height), quad);
  if (!toSource) return null;
  const c = { x: (width - 1) / 2, y: (height - 1) / 2 };
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  // Bounding box of the page turned by `-angle`, as scale factors on the page's own half-sizes.
  const w = width - 1, h = height - 1;
  const sx = w > 0 ? (w * Math.abs(cos) + h * Math.abs(sin)) / w : 1;
  const sy = h > 0 ? (w * Math.abs(sin) + h * Math.abs(cos)) / h : 1;
  // A level line in the new output corresponds to a line leaning by `angle` in the old one.
  const corner = (p: Point): Point => {
    const dx = (p.x - c.x) * sx, dy = (p.y - c.y) * sy;
    return applyHomography(toSource, { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos });
  };
  const [p0, p1, p2, p3] = rectQuad(width, height).map(corner) as [Point, Point, Point, Point];
  return [p0, p1, p2, p3];
}

/** Decide whether a measured tilt should be corrected. */
export function deskewDecision(tilt: TiltMeasurement | null): Pick<Deskew, "applied" | "skipped"> {
  if (!tilt) return { applied: 0, skipped: "not-measurable" };
  if (tilt.confidence < DESKEW.minConfidence) return { applied: 0, skipped: "unclear" };
  const size = Math.abs(tilt.angle);
  if (size < DESKEW.minDeg) return { applied: 0, skipped: "level" };
  if (size > DESKEW.maxDeg) return { applied: 0, skipped: "too-steep" };
  return { applied: tilt.angle };
}

/** True when the measured lines bend enough that one rotation cannot level the whole page. */
export const isBent = (tilt: TiltMeasurement | null): boolean => tilt?.bend != null && tilt.bend >= DESKEW.bendDeg;

/** Straighten (and, given `shift`, flatten) a downscaled copy of the page and measure the tilt of its printed lines. */
export async function measurePageTilt(
  processor: ImageProcessor, image: RasterImage, quad: Quad, shift?: ShiftMap,
): Promise<Result<TiltMeasurement | null>> {
  const small = downscale(image, TILT_MAX_SIDE).image;
  const smallQuad = scaleQuad(quad, small.width / image.width, small.height / image.height);
  const warped = await (shift ? processor.correctPerspective(small, smallQuad, shift) : processor.correctPerspective(small, smallQuad));
  if (!warped.ok) return warped;
  return { ok: true, value: measureTilt(toGray(warped.value)) };
}

/**
 * Measure the residual tilt of the page inside `quad` and work out the quad to warp so that the
 * printed lines come out level. The returned quad equals `quad` when no correction is applied;
 * otherwise it is a rotated frame around the page, and the warp must be told the page outline
 * (`quad`) so that the area outside it is filled with white.
 */
export async function planDeskew(processor: ImageProcessor, image: RasterImage, quad: Quad): Promise<Result<{ quad: Quad; deskew: Deskew }>> {
  const tilt = await measurePageTilt(processor, image, quad);
  if (!tilt.ok) return tilt;
  const measured = tilt.value;
  const decision = deskewDecision(measured);
  const bent = isBent(measured);
  if (decision.applied === 0) return { ok: true, value: { quad, deskew: { measured, bent, ...decision } } };

  const { width, height } = outputSize(quad);
  const rotated = deskewQuad(quad, width, height, decision.applied);
  if (!rotated) return { ok: true, value: { quad, deskew: { measured, bent, applied: 0, skipped: "not-measurable" } } };
  return { ok: true, value: { quad: rotated, deskew: { measured, bent, applied: decision.applied } } };
}
