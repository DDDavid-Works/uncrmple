import type { Assessment } from "../../types/assessment";
import type {
  CardDetection, CardEnhanceOptions, CardImageProcessor, CardQualityIssue, OutputStyle, Quad, QuarterTurn,
  RasterImage, RepairResult, Result,
} from "../../types/repair";
import { fileToRaster, rasterToPng } from "../browser/raster";
import { assessPhoto } from "../image-processing/assessment/assess";
import { detectCardCorners } from "../image-processing/card-pipeline";
import { measureCardQuality } from "../image-processing/card-quality";
import { createOpenCvProcessor } from "../image-processing/opencv/processor";
import { repair, validateRaster } from "../image-processing/pipeline";
import { isQuarterTurn, rotateQuarter } from "../image-processing/rotate";

export interface RepairJob {
  file: Blob;
  /** Use these corners instead of detecting the page. */
  corners?: Quad;
  style: OutputStyle;
  rotate: QuarterTurn;
  /** Also encode the straightened page (skipped when the caller already has it). */
  straightened: boolean;
}

/** A repaired page, encoded for display; everything but the pixels of RepairResult. */
export interface RepairedPage extends Omit<RepairResult, "image" | "straightened"> {
  png: Blob;
  straightenedPng: Blob | null;
  width: number;
  height: number;
}

export interface CroppedCard {
  /** The crop's pixels, kept by the caller so touch-ups need not crop again. */
  crop: RasterImage;
  png: Blob;
  quality: CardQualityIssue[];
}

/**
 * Whole processing jobs, from the photo file to encoded results. Each runs where it is called:
 * in the engine worker, or on the page when a worker cannot be used (see client.ts).
 */
export interface Engine {
  repair(job: RepairJob): Promise<Result<RepairedPage>>;
  assess(file: Blob): Promise<Result<Assessment>>;
  detectCard(file: Blob): Promise<Result<CardDetection>>;
  /** Crop the card inside `corners`, then turn it clockwise by `rotate`; touch-ups apply to the turned crop. */
  cropCard(file: Blob, corners: Quad, rotate: QuarterTurn): Promise<Result<CroppedCard>>;
  enhanceCard(crop: RasterImage, options: CardEnhanceOptions): Promise<Result<Blob>>;
}

export function localEngine(processor: CardImageProcessor = createOpenCvProcessor()): Engine {
  return {
    async repair({ file, corners, style, rotate, straightened }) {
      const raster = await fileToRaster(file);
      if (!raster.ok) return raster;
      const repaired = await repair(processor, raster.value, { corners, enhance: { style }, rotate });
      if (!repaired.ok) return repaired;
      const { image, straightened: flat, ...details } = repaired.value;
      const png = await rasterToPng(image);
      if (!png.ok) return png;
      const flatPng = straightened ? await rasterToPng(flat) : null;
      if (flatPng && !flatPng.ok) return flatPng;
      return {
        ok: true,
        value: { ...details, png: png.value, straightenedPng: flatPng?.value ?? null, width: image.width, height: image.height },
      };
    },

    async assess(file) {
      const raster = await fileToRaster(file);
      if (!raster.ok) return raster;
      return assessPhoto(processor, raster.value);
    },

    async detectCard(file) {
      const raster = await fileToRaster(file);
      if (!raster.ok) return raster;
      const valid = validateRaster(raster.value);
      if (!valid.ok) return valid;
      return detectCardCorners(processor, raster.value);
    },

    async cropCard(file, corners, rotate) {
      if (!isQuarterTurn(rotate)) return { ok: false, error: { code: "invalid-input", message: "A card can only be rotated by 0, 90, 180 or 270 degrees." } };
      const raster = await fileToRaster(file);
      if (!raster.ok) return raster;
      const warped = await processor.correctPerspective(raster.value, corners);
      if (!warped.ok) return warped;
      const crop = rotateQuarter(warped.value, rotate);
      const png = await rasterToPng(crop);
      if (!png.ok) return png;
      return { ok: true, value: { crop, png: png.value, quality: measureCardQuality(crop) } };
    },

    async enhanceCard(crop, options) {
      const enhanced = await processor.enhanceCard(crop, options);
      if (!enhanced.ok) return enhanced;
      return rasterToPng(enhanced.value);
    },
  };
}
