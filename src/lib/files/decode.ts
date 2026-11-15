import type { ImageDimensions } from "../../types/document";

/**
 * Confirm the browser can decode the image and report its display dimensions (EXIF orientation
 * applied). Decodes with createImageBitmap where available: a detached <img>'s decode() can wait
 * for the page to render, which made adding a photo take seconds; the bitmap decodes at once.
 * Falls back to <img> decoding from `url`, which the caller owns.
 */
export async function probeImage(file: Blob, url: string): Promise<ImageDimensions> {
  if (typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = null; // some browsers refuse some formats here; try the <img> route below
    }
    if (bitmap) {
      const { width, height } = bitmap;
      bitmap.close();
      if (width === 0 || height === 0) throw new Error("The decoded image has no pixels.");
      return { width, height };
    }
  }
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
