import type { DetectionMethod, DetectionResult, Point, RasterImage, Result } from "../../../types/repair";
import { isConvex, orderCorners, polygonArea } from "../geometry";
import { trimBackground } from "../refine";
import type { OpenCv } from "./loader";

/** Candidates covering nearly the whole frame are image borders, not a distinguishable page. */
const MAX_AREA_FRACTION = 0.97;
const MIN_AREA_FRACTION = 0.1;
const EPSILONS = [0.02, 0.03, 0.05];
/** Quads kept per mask, largest first. */
const QUADS_PER_MASK = 4;
/** A side counts as supported if an image edge lies within this many pixels of it. */
const EDGE_RADIUS_PX = 5;
/** Candidates whose sides are almost nowhere on a real edge are rejected (curved or stacked pages score low). */
export const MIN_EDGE_SUPPORT = 0.25;

/** A background trim is rejected if it lowers edge support by more than this. */
const MAX_SUPPORT_LOSS = 0.1;

interface Disposable { delete(): void }
type Own = <T extends Disposable>(x: T) => T;

interface Candidate {
  points: Point[];
  area: number;
  method: DetectionMethod;
  support: number;
}

/**
 * Find the page quadrilateral. Several independent segmentations (edges, brightness, low colour
 * saturation) each propose quads; every proposal is scored by how well its sides follow real image
 * edges, so a corner stuck on the frame or a patch of bright background is not mistaken for the page.
 * Expects a moderately sized image (see downscale); all temporary OpenCV objects are released.
 */
export function detectDocument(cv: OpenCv, image: RasterImage): Result<DetectionResult> {
  const owned: Disposable[] = [];
  const own: Own = (x) => (owned.push(x), x);
  const imageArea = image.width * image.height;

  try {
    const rgba = own(new cv.Mat(image.height, image.width, cv.CV_8UC4));
    rgba.data.set(image.data);
    const gray = own(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const blur = own(new cv.Mat());
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

    // Real edges, used both as a segmentation cue and to score every candidate.
    const median = medianOf(blur.data);
    const lower = Math.max(10, 0.66 * median);
    const upper = Math.min(255, Math.max(lower + 20, 1.33 * median));
    const edges = own(new cv.Mat());
    cv.Canny(blur, edges, lower, upper);
    const nearKernel = own(
      cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2 * EDGE_RADIUS_PX + 1, 2 * EDGE_RADIUS_PX + 1)),
    );
    const nearEdge = own(new cv.Mat());
    cv.dilate(edges, nearEdge, nearKernel);


    const candidates: Candidate[] = [];
    const collect = (mask: InstanceType<OpenCv["Mat"]>, method: DetectionMethod) => {
      for (const q of quadsFrom(cv, mask, imageArea, own)) {
        const points = q.points;
        const support = edgeSupport(points, nearEdge.data, image.width, image.height);
        candidates.push({ points, area: polygonArea(points), method, support });
      }
    };

    // Cue 1: edges, thickened to close gaps.
    const closeEdges = own(new cv.Mat());
    cv.dilate(edges, closeEdges, own(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))));
    collect(closeEdges, "edges");

    // Cue 2: bright page on a darker background.
    const bright = own(new cv.Mat());
    cv.threshold(blur, bright, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    cv.morphologyEx(bright, bright, cv.MORPH_CLOSE, own(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9))));
    collect(bright, "brightness");

    // Cue 3: paper is nearly colourless; coloured backgrounds (cloth, wood, tables) are not.
    const neutral = colourlessMask(cv, rgba, gray, own);
    collect(neutral, "colour");

    const viable = candidates.filter((c) => c.support >= MIN_EDGE_SUPPORT);
    const score = (c: Candidate) => c.support * Math.sqrt(c.area / imageArea);
    const best = viable.sort((a, b) => score(b) - score(a))[0];
    if (!best) {
      return {
        ok: false,
        error: {
          code: "no-document-found",
          message:
            "No clear page boundary was found. Try a photo where all four page edges are visible against a contrasting background.",
        },
      };
    }
    // The hull of a crumpled page overshoots its curved sides; pull them in past strips of background.
    const ordered = orderCorners(best.points);
    const trimmed = trimBackground(ordered, neutral.data, image.width, image.height);
    const trimmedSupport = edgeSupport(trimmed, nearEdge.data, image.width, image.height);
    // Keep the trim only if the new outline still follows real edges about as well as the old one.
    const useTrimmed = trimmed !== ordered && trimmedSupport >= best.support - MAX_SUPPORT_LOSS;
    const corners = useTrimmed ? trimmed : ordered;
    return {
      ok: true,
      value: {
        corners,
        areaFraction: polygonArea(corners) / imageArea,
        method: best.method,
        edgeSupport: useTrimmed ? trimmedSupport : best.support,
      },
    };
  } catch (e) {
    return processingFailed("Document detection failed", e);
  } finally {
    for (const o of owned) o.delete();
  }
}

/** Low-saturation, not-too-dark pixels: where a (white or grey) page can be. */
function colourlessMask(
  cv: OpenCv,
  rgba: InstanceType<OpenCv["Mat"]>,
  gray: InstanceType<OpenCv["Mat"]>,
  own: Own,
): InstanceType<OpenCv["Mat"]> {
  const rgb = own(new cv.Mat());
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  const hsv = own(new cv.Mat());
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  const channels = own(new cv.MatVector());
  cv.split(hsv, channels);
  const sat = own(channels.get(1));
  const satBlur = own(new cv.Mat());
  cv.GaussianBlur(sat, satBlur, new cv.Size(5, 5), 0);
  const low = own(new cv.Mat());
  cv.threshold(satBlur, low, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
  // Dark text and shadow are colourless too; require some brightness only to drop black borders.
  const lit = own(new cv.Mat());
  cv.threshold(gray, lit, 50, 255, cv.THRESH_BINARY);
  const mask = own(new cv.Mat());
  cv.bitwise_and(low, lit, mask);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, own(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9))));
  // Opening severs thin bridges to bright patches of background.
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, own(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7))));
  return mask;
}

/** The largest convex four-sided shapes found in a binary mask. */
function quadsFrom(
  cv: OpenCv,
  binary: InstanceType<OpenCv["Mat"]>,
  imageArea: number,
  own: Own,
): { points: Point[]; area: number }[] {
  const contours = own(new cv.MatVector());
  const hierarchy = own(new cv.Mat());
  cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const found: { points: Point[]; area: number }[] = [];
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const hull = new cv.Mat();
    try {
      if (cv.contourArea(contour) < MIN_AREA_FRACTION * imageArea) continue;
      cv.convexHull(contour, hull);
      const perimeter = cv.arcLength(hull, true);
      for (const eps of EPSILONS) {
        const approx = new cv.Mat();
        try {
          cv.approxPolyDP(hull, approx, eps * perimeter, true);
          if (approx.rows !== 4) continue;
          const d = approx.data32S;
          const points: Point[] = [0, 1, 2, 3].map((k) => ({ x: d[k * 2]!, y: d[k * 2 + 1]! }));
          const area = polygonArea(points);
          if (isConvex(points) && area >= MIN_AREA_FRACTION * imageArea && area <= MAX_AREA_FRACTION * imageArea) {
            found.push({ points, area });
          }
          break;
        } finally {
          approx.delete();
        }
      }
    } finally {
      hull.delete();
      contour.delete();
    }
  }
  return found.sort((a, b) => b.area - a.area).slice(0, QUADS_PER_MASK);
}

/** Outline samples this close to the image border are neutral: a cut-off page has no edge there. */
const BORDER_MARGIN_PX = 15;

/**
 * Mean of `goodness(index)` (0..1) over samples along the quad outline, averaged over the four
 * sides. Samples in the border margin are skipped; a side left with no samples scores neutral 0.5.
 */
function outlineMean(
  quad: readonly Point[],
  width: number,
  height: number,
  goodness: (pixelIndex: number) => number,
): number {
  let total = 0;
  for (let s = 0; s < 4; s++) {
    const a = quad[s]!;
    const b = quad[(s + 1) % 4]!;
    const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    let tested = 0;
    let sum = 0;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
      const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
      if (x < BORDER_MARGIN_PX || y < BORDER_MARGIN_PX || x >= width - BORDER_MARGIN_PX || y >= height - BORDER_MARGIN_PX) continue;
      tested++;
      sum += goodness(y * width + x);
    }
    total += tested === 0 ? 0.5 : sum / tested;
  }
  return total / 4;
}

/** Fraction (0..1) of the quad outline that lies on a real image edge (see outlineMean). */
export function edgeSupport(quad: readonly Point[], nearEdge: Uint8Array, width: number, height: number): number {
  return outlineMean(quad, width, height, (i) => (nearEdge[i] ? 1 : 0));
}

function medianOf(data: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]!]!++;
  let seen = 0;
  const half = data.length / 2;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= half) return v;
  }
  return 128;
}

export function processingFailed(what: string, e: unknown): { ok: false; error: { code: "processing-failed"; message: string } } {
  const detail = e instanceof Error ? `: ${e.message}` : "";
  return { ok: false, error: { code: "processing-failed", message: `${what}${detail}` } };
}
