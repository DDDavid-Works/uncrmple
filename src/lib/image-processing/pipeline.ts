import type {
  ImageProcessor, Quad, RasterImage, RepairError, RepairOptions, RepairResult, Result, ShiftMap,
} from "../../types/repair";
import { frameLikeness } from "./assessment/likeness";
import { DESKEW, measurePageTilt, planDeskew } from "./deskew";
import { planDewarp } from "./dewarp/plan";
import { downscale } from "./downscale";
import { fullFrameQuad, scaleQuad, validateQuad } from "./geometry";
import { DEFAULT_ENHANCE_OPTIONS, validateEnhanceOptions } from "./options";
import { isQuarterTurn, rotateQuarter } from "./rotate";

/** Longest side of the copy used for page detection. */
export const DETECTION_MAX_SIDE = 800;

/**
 * An outline this weakly on real edges that still covers most of the photo is usually a page shot
 * so tight that its edges are outside the frame, with a shadow or fold taken for a side. Cropping to
 * it distorts the page; cleaning up the whole photo keeps it intact, so that is the default and the
 * outline is offered instead (see RepairResult.detectedOutline). A photo where no outline is found
 * at all is cleaned up whole too, if it still looks like paper and print (a page filling the frame,
 * a scan); a scene or a plain image is left alone and the error stands (see frameLikeness).
 */
export const WHOLE_IMAGE = { maxEdgeSupport: 0.4, minAreaFraction: 0.7 } as const;

const fail = (error: RepairError): Result<never> => ({ ok: false, error });

export function validateRaster(image: RasterImage): Result<RasterImage> {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return fail({ code: "invalid-input", message: "The image has invalid dimensions." });
  }
  if (data.length !== width * height * 4) {
    return fail({ code: "invalid-input", message: "The image pixel data does not match its dimensions." });
  }
  return { ok: true, value: image };
}

/**
 * Flatten the lines on the unrotated page; returns the flattening when it applies and leaves the
 * page level (within the deskew tolerance), otherwise null.
 */
async function levelByFlattening(
  processor: ImageProcessor, image: RasterImage, corners: Quad,
): Promise<Result<{ map: ShiftMap; dewarp: RepairResult["dewarp"] } | null>> {
  const plan = await planDewarp(processor, image, corners);
  if (!plan.ok) return plan;
  const { map, dewarp } = plan.value;
  if (!map) return { ok: true, value: null };
  const tilt = await measurePageTilt(processor, image, corners, map);
  if (!tilt.ok) return tilt;
  const level = tilt.value !== null && Math.abs(tilt.value.angle) < DESKEW.minDeg;
  return { ok: true, value: level ? { map, dewarp } : null };
}

/**
 * Detect (or accept) the page corners, correct perspective (levelling any tilt the print still
 * has inside the page outline, and flattening curved lines when that is shown to help), then even
 * out lighting and apply the output style. Every failure is returned as a structured error; an
 * unchanged image is never reported as a successful repair.
 */
export async function repair(
  processor: ImageProcessor,
  image: RasterImage,
  options: RepairOptions = {},
): Promise<Result<RepairResult>> {
  const style = validateEnhanceOptions(options.enhance ?? DEFAULT_ENHANCE_OPTIONS);
  if (!style.ok) return style;
  const turn = options.rotate ?? 0;
  if (!isQuarterTurn(turn)) return fail({ code: "invalid-input", message: "A page can only be rotated by 0, 90, 180 or 270 degrees." });
  const input = validateRaster(image);
  if (!input.ok) return input;

  let corners = options.corners;
  let source: RepairResult["source"] = "manual";
  let areaFraction: number | undefined;
  let edgeSupport: number | undefined;
  let detectedOutline: Quad | undefined;

  if (corners) {
    const valid = validateQuad(corners, image.width, image.height);
    if (!valid.ok) return valid;
  } else {
    // Detect on a small copy, then map the corners back to full resolution.
    const small = downscale(image, DETECTION_MAX_SIDE);
    const detected = await processor.detectDocument(small.image);
    if (!detected.ok) {
      if (detected.error.code !== "no-document-found") return detected;
      if (frameLikeness(image) === "not-document") {
        return fail({
          code: "no-document-found",
          message:
            "No page was found, and this does not look like a photo of a paper page. To repair it anyway, mark the corners yourself or clean up the whole image.",
        });
      }
      corners = fullFrameQuad(image.width, image.height);
      source = "whole-image";
    } else {
      const found = scaleQuad(
        detected.value.corners,
        image.width / small.image.width,
        image.height / small.image.height,
      );
      const { method, areaFraction: area, edgeSupport: support } = detected.value;
      if (support < WHOLE_IMAGE.maxEdgeSupport && area >= WHOLE_IMAGE.minAreaFraction) {
        corners = fullFrameQuad(image.width, image.height);
        source = "whole-image";
        detectedOutline = found;
      } else {
        corners = found;
        source = method;
        areaFraction = area;
        edgeSupport = support;
      }
    }
  }

  // Paper that is not flat can leave the print leaning inside a square outline: measure that and
  // fold the correction into the single full-resolution warp.
  // A levelled page is warped through a rotated frame around it; `page` tells the warp which part
  // of that frame is the page (the rest is filled with white rather than cut from the page).
  let warpQuad = corners;
  let page: Quad | undefined;
  let deskew: RepairResult["deskew"] = { measured: null, applied: 0, skipped: "off", bent: false };
  if (options.deskew !== false) {
    const plan = await planDeskew(processor, image, corners);
    if (!plan.ok) return plan;
    warpQuad = plan.value.quad;
    deskew = plan.value.deskew;
    if (deskew.applied !== 0) page = corners;
  }

  // Curved or creased paper bends the lines; flatten them in the same warp when a trial on a small
  // copy shows it makes them clearly straighter.
  let shift: ShiftMap | undefined;
  let dewarp: RepairResult["dewarp"] = { applied: false, skipped: "off", bendBefore: null, bendAfter: null, coverage: null };
  // Lines that bend cannot all be levelled by one rotation: a page photographed at an angle can
  // lean at the top and lie level at the bottom. Rotating by the overall angle then tilts the rest
  // of the page (and, for a whole-photo cleanup, the photo's own edges). Flattening the lines
  // without the rotation is preferred when the flattened page then measures level.
  if (deskew.applied !== 0 && deskew.bent && options.dewarp !== false) {
    const flat = await levelByFlattening(processor, image, corners);
    if (!flat.ok) return flat;
    if (flat.value) {
      warpQuad = corners;
      page = undefined;
      deskew = { ...deskew, applied: 0, skipped: "flattened" };
      shift = flat.value.map;
      dewarp = flat.value.dewarp;
    }
  }
  if (options.dewarp !== false && deskew.skipped !== "flattened") {
    const plan = await planDewarp(processor, image, warpQuad, page);
    if (!plan.ok) return plan;
    shift = plan.value.map ?? undefined;
    dewarp = plan.value.dewarp;
  }

  const warped = await processor.correctPerspective(image, warpQuad, shift, page);
  if (!warped.ok) return warped;

  const enhanced = await processor.enhance(warped.value, style.value);
  if (!enhanced.ok) return enhanced;
  // Turned last, so detection, levelling and the corners all stay in the photo's own orientation.
  return {
    ok: true,
    value: {
      image: rotateQuarter(enhanced.value, turn),
      straightened: rotateQuarter(warped.value, turn),
      corners,
      deskew,
      dewarp,
      source,
      style: style.value.style,
      areaFraction,
      edgeSupport,
      detectedOutline,
    },
  };
}
