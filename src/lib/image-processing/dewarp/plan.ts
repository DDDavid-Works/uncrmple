import type { Dewarp, ImageProcessor, Quad, RasterImage, Result, ShiftMap } from "../../../types/repair";
import { toGray } from "../assessment/pixels";
import { TILT_MAX_SIDE } from "../deskew";
import { downscale } from "../downscale";
import { scaleQuad } from "../geometry";
import { bendScore } from "./bend";
import { buildShiftMap } from "./shift-map";
import { traceLines } from "./trace";

/** Thresholds are first estimates; tune them against real photographs. */
export const DEWARP = {
  /** Mean line bend (share of page height) below which the page counts as flat already. */
  minBend: 0.0012,
  /**
   * Flattening is kept only if it cuts the mean bend by at least this share, does not make the
   * worst lines (90th percentile) bend more, and leaves at least `minLinesKept` of the scored lines
   * traceable (fewer means it garbled the page).
   */
  minImprovement: 0.25,
  minLinesKept: 0.6,
};

/**
 * Decide whether to flatten the page inside `quad` (rotation included), by trying it on a
 * downscaled copy: trace the lines, build a shift map, apply it, trace again, and keep the map only
 * if the lines came out clearly straighter. The map is resolution independent, so it applies to
 * the full-size warp of the same quad. `page` is the page outline when `quad` is a rotated frame
 * around it (see `planDeskew`). Engine failures are returned as errors.
 */
export async function planDewarp(
  processor: ImageProcessor, image: RasterImage, quad: Quad, page?: Quad,
): Promise<Result<{ map: ShiftMap | null; dewarp: Dewarp }>> {
  const small = downscale(image, TILT_MAX_SIDE).image;
  const sx = small.width / image.width, sy = small.height / image.height;
  const smallQuad = scaleQuad(quad, sx, sy);
  const smallPage = page && scaleQuad(page, sx, sy);
  const plain = await processor.correctPerspective(small, smallQuad, undefined, smallPage);
  if (!plain.ok) return plain;
  const { width, height } = plain.value;
  const trace = traceLines(toGray(plain.value));
  const before = bendScore(trace, width, height);
  const built = buildShiftMap(trace, width, height);
  const skip = (skipped: Dewarp["skipped"], bendAfter: number | null = null) => ({
    ok: true as const,
    value: { map: null, dewarp: { applied: false, skipped, bendBefore: before?.mean ?? null, bendAfter, coverage: built.stats.coverage } },
  });

  if (!built.map) return skip(built.skipped);
  if (!before) return skip("too-little-evidence");
  if (before.mean < DEWARP.minBend) return skip("already-flat");

  const flattened = await processor.correctPerspective(small, smallQuad, built.map, smallPage);
  if (!flattened.ok) return flattened;
  const after = bendScore(traceLines(toGray(flattened.value)), width, height);
  if (!after || after.lines < before.lines * DEWARP.minLinesKept) return skip("not-improved", after?.mean ?? null);
  const improved = after.mean <= before.mean * (1 - DEWARP.minImprovement) && after.p90 <= before.p90;
  if (!improved) return skip("not-improved", after.mean);
  return {
    ok: true,
    value: { map: built.map, dewarp: { applied: true, bendBefore: before.mean, bendAfter: after.mean, coverage: built.stats.coverage } },
  };
}
