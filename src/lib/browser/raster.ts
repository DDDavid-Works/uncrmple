import type { RasterImage, Result } from "../../types/repair";

/**
 * A scratch canvas: a page canvas on the main thread, an OffscreenCanvas in a worker (which has
 * no document). Both are drawn on the same way; only encoding differs (see encode).
 */
type Canvas = HTMLCanvasElement | OffscreenCanvas;
const makeCanvas = (): Canvas =>
  typeof document === "undefined" ? new OffscreenCanvas(0, 0) : document.createElement("canvas");

function encode(canvas: Canvas, type: string, quality?: number): Promise<Blob | null> {
  // Checked by feature, not instanceof: HTMLCanvasElement does not exist in a worker.
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decode a file to RGBA pixels at full resolution, applying EXIF orientation.
 * Browser-specific adapter; the processing engine itself only sees RasterImage.
 */
export async function fileToRaster(file: Blob): Promise<Result<RasterImage>> {
  let bitmap: ImageBitmap | null = null;
  const canvas = makeCanvas();
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
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
  const canvas = makeCanvas();
  try {
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("Canvas is not available");
    ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
    const blob = await encode(canvas, "image/png");
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
  const canvas = makeCanvas();
  try {
    bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0);
    const jpeg = await encode(canvas, "image/jpeg", quality);
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
