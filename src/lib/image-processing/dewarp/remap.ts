import type { Point, Quad, RepairError, Result, ShiftMap } from "../../../types/repair";
import { homography, rectQuad, type Homography } from "../geometry";

/** Source coordinate written for output pixels outside the page: far enough out that bicubic sampling sees only the fill. */
export const OUTSIDE = -16;

/** A shift map with values beyond this share of the page height is corrupt, not a bend. */
const MAX_VALID_SHIFT = 0.1;

const invalid = (message: string): Result<never> => ({
  ok: false,
  error: { code: "invalid-input", message } satisfies RepairError,
});

/** Check that a shift map is well formed before it is used to allocate and sample. */
export function validateShiftMap(map: ShiftMap): Result<ShiftMap> {
  if (!Number.isInteger(map.columns) || !Number.isInteger(map.rows) || map.columns < 2 || map.rows < 1) {
    return invalid("The page-flattening map has an invalid grid size.");
  }
  if (map.shifts.length !== map.columns * map.rows) return invalid("The page-flattening map does not match its grid size.");
  for (const v of map.shifts) {
    if (!Number.isFinite(v) || Math.abs(v) > MAX_VALID_SHIFT) return invalid("The page-flattening map has out-of-range values.");
  }
  return { ok: true, value: map };
}

/** Where each output pixel of the straightened (and flattened) page comes from in the photo. */
export interface SourceMapper {
  width: number;
  height: number;
  /**
   * Source x and y for output rows [y0, y1), written row-major ((y1 - y0) × width) into `mapX` and
   * `mapY`. Output pixel (x, y) first moves by the shift map, then goes through the perspective
   * transform of the quad, so one interpolation of the photo does both. Pixels that land outside
   * the page outline (when one is given) get `OUTSIDE` for both coordinates.
   */
  fill(y0: number, y1: number, mapX: Float32Array, mapY: Float32Array): void;
}

/** True for points inside (or on) the convex quad. */
function insideQuad(quad: Quad): (x: number, y: number) => boolean {
  const edges = quad.map((p, i) => [p, quad[(i + 1) % 4]!] as [Point, Point]);
  const cross = ([a, b]: [Point, Point], x: number, y: number) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
  // Corners may run either way round; the third corner lies on the inside of the first edge.
  const sign = Math.sign(cross(edges[0]!, quad[2].x, quad[2].y)) || 1;
  return (x, y) => edges.every((e) => cross(e, x, y) * sign >= 0);
}

/**
 * `quad` is the area of the photo that becomes the `width × height` output (rotation included).
 * With `page`, only points inside that outline are sampled from the photo.
 */
export function sourceMapper(quad: Quad, width: number, height: number, shift: ShiftMap | null, page: Quad | null = null): SourceMapper | null {
  const toSource: Homography | null = homography(rectQuad(width, height), quad);
  if (!toSource) return null;
  const inside = page ? insideQuad(page) : null;
  const [a, b, c, d, e, f, g, h, k] = toSource;
  const rowNodes = new Float64Array(shift?.columns ?? 0);

  return {
    width,
    height,
    fill(y0, y1, mapX, mapY) {
      for (let y = y0; y < y1; y++) {
        // The shift map interpolated down to this row (held beyond the first and last row centres).
        if (shift) {
          const fy = Math.min(shift.rows - 1, Math.max(0, (y / height) * shift.rows - 0.5));
          const r0 = Math.floor(fy), r1 = Math.min(shift.rows - 1, r0 + 1), t = fy - r0;
          for (let n = 0; n < shift.columns; n++) {
            rowNodes[n] = (shift.shifts[r0 * shift.columns + n]! * (1 - t) + shift.shifts[r1 * shift.columns + n]! * t) * height;
          }
        }
        const out = (y - y0) * width;
        for (let x = 0; x < width; x++) {
          let yy = y;
          if (shift) {
            const fx = (x / width) * (shift.columns - 1);
            const n0 = Math.floor(fx), n1 = Math.min(shift.columns - 1, n0 + 1);
            yy += rowNodes[n0]! + (rowNodes[n1]! - rowNodes[n0]!) * (fx - n0);
          }
          const w = g * x + h * yy + k;
          const sx = (a * x + b * yy + c) / w, sy = (d * x + e * yy + f) / w;
          const keep = !inside || inside(sx, sy);
          mapX[out + x] = keep ? sx : OUTSIDE;
          mapY[out + x] = keep ? sy : OUTSIDE;
        }
      }
    },
  };
}
