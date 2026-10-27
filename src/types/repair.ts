export interface Point {
  x: number;
  y: number;
}

/** Document corners in image pixel coordinates, ordered top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Point, Point, Point, Point];

/** Plain RGBA pixel buffer. Independent of DOM types so engines can run anywhere. */
export interface RasterImage {
  width: number;
  height: number;
  /** Length is width * height * 4. */
  data: Uint8ClampedArray;
}

export type RepairErrorCode =
  | "engine-unavailable"
  | "invalid-input"
  | "no-document-found"
  | "no-card-found"
  | "invalid-corners"
  | "processing-failed";

export interface RepairError {
  code: RepairErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: RepairError };

export type DetectionMethod = "edges" | "brightness" | "colour";

export interface DetectionResult {
  corners: Quad;
  /** Fraction (0..1) of the analysed image covered by the detected page. */
  areaFraction: number;
  method: DetectionMethod;
  /** 0..1: how much of the page outline follows real image edges. Low means unreliable. */
  edgeSupport: number;
}

/**
 * Replaceable image-processing implementation (OpenCV.js today; native or server later).
 * Implementations must not mutate their inputs.
 */
export interface ImageProcessor {
  /** Find the page corners. Corners are in the coordinates of the given image. */
  detectDocument(image: RasterImage): Promise<Result<DetectionResult>>;
  /**
   * Warp the quadrilateral to an upright rectangle. With a shift map, also flatten the page in the
   * same interpolation (the map is defined on the upright output). With `page`, `corners` is a
   * frame around that page outline (e.g. rotated to level the print) that may reach beyond the
   * photo: only the inside of `page` is taken from the photo and the rest is filled with white.
   */
  correctPerspective(image: RasterImage, corners: Quad, shift?: ShiftMap, page?: Quad): Promise<Result<RasterImage>>;
  /** Even out lighting and shadows, then apply the output style. Returns a new image. */
  enhance(image: RasterImage, options: EnhanceOptions): Promise<Result<RasterImage>>;
}

export interface RepairOptions {
  /** Use these corners (source-image pixels) instead of detecting automatically. */
  corners?: Quad;
  /** Output style; defaults to DEFAULT_ENHANCE_OPTIONS. */
  enhance?: EnhanceOptions;
  /** Level the printed lines when they still lean after perspective correction. Defaults to true. */
  deskew?: boolean;
  /** Flatten curved lines when that measurably straightens them. Defaults to true. */
  dewarp?: boolean;
}

/**
 * Smooth vertical displacement of a straightened page, independent of resolution: the output
 * pixel at normalised position (u, v) takes the content found `shiftAt(u, v) × page height` lower
 * (positive) or higher (negative) in the straightened page. Values sit on a grid of
 * `columns × rows` nodes: column k at u = k / (columns - 1); row r at v = (r + 0.5) / rows
 * (held constant above the first and below the last row). Plain data, so any engine can apply it.
 */
export interface ShiftMap {
  columns: number;
  rows: number;
  /** Row-major, `rows × columns` values, as fractions of the page height. */
  shifts: Float32Array;
}

/** Why a curved page was not flattened. */
export type DewarpSkip =
  /** Turned off in the options. */
  | "off"
  /** Too few text rows or ruled lines to follow. */
  | "too-little-evidence"
  /** The bend the lines suggest is implausibly large, so the evidence is probably wrong. */
  | "too-large"
  /** The lines are already straight within tolerance. */
  | "already-flat"
  /** Trying it on a small copy did not make the lines clearly straighter. */
  | "not-improved";

export interface Dewarp {
  applied: boolean;
  /** Set when `applied` is false. */
  skipped?: DewarpSkip;
  /** Mean bend of the traced lines before and after flattening, as shares of the page height; null when not measured. */
  bendBefore: number | null;
  bendAfter: number | null;
  /** Share of the page with line evidence; null when not measured. */
  coverage: number | null;
}

/** Why a measured tilt was not corrected. */
export type DeskewSkip =
  /** Too little text or ruled lines to measure. */
  | "not-measurable"
  /** No single angle stands out clearly. */
  | "unclear"
  /** Already level within tolerance. */
  | "level"
  /** Larger than any tilt we trust ourselves to correct. */
  | "too-steep"
  /** Turned off in the options. */
  | "off";

export interface Deskew {
  /** Tilt of the printed lines after perspective correction; null when not measured or not measurable. */
  measured: {
    /** Degrees; positive means lines fall towards the right. */
    angle: number;
    /** 0..1 heuristic, not a calibrated probability. */
    confidence: number;
    /** Per horizontal band, top to bottom; null where a band could not be measured. */
    bands: (number | null)[];
    /** Largest difference between band angles in degrees. */
    bend: number | null;
  } | null;
  /** Rotation applied in degrees (the measured angle that was levelled); 0 when none. */
  applied: number;
  /** Set when `applied` is 0. */
  skipped?: DeskewSkip;
  /** Lines lean differently in different parts of the page (curved or creased paper), so one rotation cannot level them all. */
  bent: boolean;
}

export interface RepairResult {
  image: RasterImage;
  /** The perspective-corrected page before lighting and style cleanup; same size as `image`. */
  straightened: RasterImage;
  /** Page corners used, in source-image pixels (before any deskew rotation). */
  corners: Quad;
  /** Residual tilt found after perspective correction, and what was done about it. */
  deskew: Deskew;
  /** Whether curved lines were flattened, and why not. */
  dewarp: Dewarp;
  source: "manual" | DetectionMethod;
  style: OutputStyle;
  /** Only set for automatic detection. */
  areaFraction?: number;
  edgeSupport?: number;
}

/** Output look. Lighting correction is applied for every style. */
export type OutputStyle = "color" | "grayscale" | "blackwhite";

export interface EnhanceOptions {
  style: OutputStyle;
}

/** Why a card detection deserves a second look. Turned into plain-language messages by the UI. */
export type CardWarning =
  /** At least one side shows little contrast with its surroundings (covered, faint, or glare). */
  | "edge-unclear"
  /** The outline touches or leaves the photo, so part of the card may be cut off. */
  | "card-cut-off"
  /** Strong perspective: the proportions are estimated less accurately. */
  | "strong-perspective"
  /** The card is small in the photo; the crop will have few pixels. */
  | "low-resolution";

/**
 * "ready": all four sides are clearly visible and the shape is plausible.
 * "verify": a card-like shape was found but the user should confirm the corners.
 * A failed detection is a `no-card-found` error, not a level.
 */
export type CardDetectionLevel = "ready" | "verify";

export interface CardDetection {
  corners: Quad;
  /**
   * 0..1 heuristic score combining edge support, side visibility, shape plausibility and size.
   * It is NOT a calibrated probability.
   */
  confidence: number;
  level: CardDetectionLevel;
  /** Long side / short side estimated from the detected geometry (always >= 1). */
  aspectRatio: number;
  /** Fraction of the analysed image covered by the card. */
  areaFraction: number;
  /** 0..1 outline support by real image edges. */
  edgeSupport: number;
  /** Per side (top, right, bottom, left): 0..1 share of the side with visible contrast across it. */
  sideVisibility: readonly [number, number, number, number];
  warnings: CardWarning[];
}

/** An ImageProcessor that can also find cards. Warping reuses `correctPerspective`. */
export interface CardImageProcessor extends ImageProcessor {
  /** Find the card corners in the coordinates of the given image. */
  detectCard(image: RasterImage): Promise<Result<CardDetection>>;
  /** Apply optional touch-ups to a cropped card. Returns a new image; the input is never modified. */
  enhanceCard(image: RasterImage, options: CardEnhanceOptions): Promise<Result<RasterImage>>;
}

/**
 * Optional, conservative touch-ups applied to an already cropped card. All off means "the crop as
 * is". None of these invent content: they only rescale brightness, smooth noise, or sharpen edges.
 */
export interface CardEnhanceOptions {
  /** Flatten gentle lighting gradients (never a strong correction, so photos and dark areas stay). */
  evenLighting: boolean;
  /** Stretch brightness range moderately, keeping hue. */
  autoContrast: boolean;
  /** Mild edge-preserving noise reduction. */
  denoise: boolean;
  /** Light unsharp mask. Cannot recover real blur. */
  sharpen: boolean;
  grayscale: boolean;
}

/** Problems enhancement cannot reliably fix; reported instead of implied to be corrected. */
export type CardQualityIssue = "glare" | "blur";
