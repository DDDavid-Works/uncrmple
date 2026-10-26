import type { ImageDimensions } from "../../types/document";

/**
 * Confirm the browser can decode the image and report its display dimensions
 * (EXIF orientation applied). The object URL is owned by the caller.
 */
export async function probeImage(url: string): Promise<ImageDimensions> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error("The browser could not decode this image. It may be corrupt.");
  }
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new Error("The decoded image has no pixels.");
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}
