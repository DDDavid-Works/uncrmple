import type { ImageDimensions, ImageFormat } from "../../types/document";

const ascii = (b: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...b.subarray(start, start + len));

/** Identify the format from magic bytes. File extensions and MIME types are not trusted. */
export function sniffFormat(b: Uint8Array): ImageFormat | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return null;
}

/**
 * Read the stored pixel dimensions from the file header without decoding the image,
 * so oversized images can be rejected before any large allocation.
 * Returns null if the header is truncated or malformed. EXIF rotation is not applied.
 */
export function readDimensions(b: Uint8Array, format: ImageFormat): ImageDimensions | null {
  switch (format) {
    case "png": return readPng(b);
    case "jpeg": return readJpeg(b);
    case "webp": return readWebp(b);
  }
}

function readPng(b: Uint8Array): ImageDimensions | null {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function readJpeg(b: Uint8Array): ImageDimensions | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1]!;
    if (marker === 0xff) { i++; continue; }
    // Standalone markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
    const len = v.getUint16(i + 2);
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function readWebp(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") {
    const w = (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
    const h = (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1;
    return { width: w, height: h };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = v.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  return null;
}
