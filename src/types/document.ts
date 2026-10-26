/** Raster formats accepted for upload. */
export type ImageFormat = "jpeg" | "png" | "webp";

export interface ImageDimensions {
  width: number;
  height: number;
}

/** A successfully validated and decoded upload. The source file is never modified. */
export interface SourceDocument {
  id: string;
  name: string;
  size: number;
  format: ImageFormat;
  /** Display dimensions (EXIF orientation applied by the browser). */
  width: number;
  height: number;
  /** The untouched original file. */
  file: File;
  /** Object URL of the untouched original. Revoke when the document is removed. */
  originalUrl: string;
}

export interface RejectedFile {
  id: string;
  name: string;
  reason: string;
}
