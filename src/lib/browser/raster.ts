import type { RasterImage, Result } from "../../types/repair";

/**
 * Decode a file to RGBA pixels at full resolution, applying EXIF orientation.
 * Browser-specific adapter; the processing engine itself only sees RasterImage.
 */
export async function fileToRaster(file: Blob): Promise<Result<RasterImage>> {
  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement("canvas");
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { ok: true, value: { width: canvas.width, height: canvas.height, data } };
  } catch {
    return {
      ok: false,
      error: {
        code: "invalid-input",
        message: "The photo could not be read for processing. It may be too large for this device's memory.",
      },
    };
  } finally {
    bitmap?.close();
    // Release the canvas backing store promptly.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Encode pixels as a lossless PNG blob. */
export async function rasterToPng(image: RasterImage): Promise<Result<Blob>> {
  const canvas = document.createElement("canvas");
  try {
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Encoding failed");
    return { ok: true, value: blob };
  } catch {
    return {
      ok: false,
      error: { code: "processing-failed", message: "The repaired image could not be encoded for display." },
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export interface EncodedJpeg {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Decode an image blob and re-encode it as JPEG (for PDF pages). Browser-specific adapter. */
export async function blobToJpeg(blob: Blob, quality = 0.92): Promise<Result<EncodedJpeg>> {
  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement("canvas");
  try {
    bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!jpeg) throw new Error("Encoding failed");
    return {
      ok: true,
      value: { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: bitmap.width, height: bitmap.height },
    };
  } catch {
    return {
      ok: false,
      error: { code: "processing-failed", message: "A repaired page could not be prepared for the PDF." },
    };
  } finally {
    bitmap?.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
