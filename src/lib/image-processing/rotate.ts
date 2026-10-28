import type { QuarterTurn, RasterImage } from "../../types/repair";

export const QUARTER_TURNS: readonly QuarterTurn[] = [0, 90, 180, 270];

export const isQuarterTurn = (v: unknown): v is QuarterTurn => QUARTER_TURNS.includes(v as QuarterTurn);

/** `turn` turned a further quarter clockwise (`by` 90) or anticlockwise (`by` -90). */
export const addQuarterTurn = (turn: QuarterTurn, by: 90 | -90): QuarterTurn => ((turn + by + 360) % 360) as QuarterTurn;

/**
 * The image turned clockwise by `turn` degrees, as a new image; the input is returned unchanged
 * (not copied) for 0. Pixels move whole, so nothing is resampled.
 */
export function rotateQuarter(image: RasterImage, turn: QuarterTurn): RasterImage {
  if (turn === 0) return image;
  const { width: w, height: h } = image;
  // Whole pixels as 32-bit words; a view needs 4-byte alignment, which a sliced buffer may lack.
  const bytes = image.data.byteOffset % 4 === 0 ? image.data : image.data.slice();
  const src = new Uint32Array(bytes.buffer, bytes.byteOffset, w * h);
  const out = new Uint8ClampedArray(w * h * 4);
  const dst = new Uint32Array(out.buffer);
  const ow = turn === 180 ? w : h;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      // Destination of source pixel (x, y).
      const i =
        turn === 90 ? x * ow + (h - 1 - y)
        : turn === 180 ? (h - 1 - y) * ow + (w - 1 - x)
        : (w - 1 - x) * ow + y;
      dst[i] = src[row + x]!;
    }
  }
  return turn === 180 ? { width: w, height: h, data: out } : { width: h, height: w, data: out };
}
