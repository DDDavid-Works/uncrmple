import type { ImageDimensions, ImageFormat } from "../../types/document";
import { MAX_FILE_BYTES, MAX_PIXELS, MAX_SIDE_PX, MIN_SIDE_PX } from "./limits";
import { readDimensions, sniffFormat } from "./sniff";

export type ValidationResult =
  | { ok: true; format: ImageFormat; dimensions: ImageDimensions }
  | { ok: false; reason: string };

/** Enough bytes to cover PNG/WebP headers and typical JPEG headers incl. EXIF/ICC segments. */
const HEADER_BYTES = 256 * 1024;

const fail = (reason: string): ValidationResult => ({ ok: false, reason });

/** Pure validation over header bytes; separated from File I/O for testability. */
export function validateImageBytes(header: Uint8Array, size: number): ValidationResult {
  if (size === 0) return fail("The file is empty.");
  if (size > MAX_FILE_BYTES) {
    return fail(`The file is larger than the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`);
  }
  const format = sniffFormat(header);
  if (!format) return fail("Unsupported or unrecognized file. Use a JPG, PNG, or WebP image.");

  const dimensions = readDimensions(header, format);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    return fail("The image header is damaged or unreadable.");
  }
  const { width, height } = dimensions;
  if (Math.min(width, height) < MIN_SIDE_PX) {
    return fail(`The image is too small (${width}×${height}px) to repair.`);
  }
  if (Math.max(width, height) > MAX_SIDE_PX || width * height > MAX_PIXELS) {
    return fail(
      `The image is too large (${width}×${height}px). Limit is ${MAX_PIXELS / 1e6} megapixels and ${MAX_SIDE_PX}px per side.`,
    );
  }
  return { ok: true, format, dimensions };
}

export async function validateImageFile(file: File): Promise<ValidationResult> {
  try {
    const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
    return validateImageBytes(header, file.size);
  } catch {
    return fail("The file could not be read.");
  }
}
