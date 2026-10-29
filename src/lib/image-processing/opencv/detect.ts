import type { DetectionMethod, DetectionResult, Point, Quad, RasterImage, Result } from "../../../types/repair";
import { boundaryContrast, BOUNDARY_STEP, lineStep } from "../boundary";
import type { Gray } from "../boundary";
import { mergeSegments, quadsFromLines } from "../card-lines";
import { extendSides } from "../extend";
import { snapFrameSides } from "../frame-sides";
import type { Segment } from "../card-lines";
import { isConvex, isPlausiblePage, orderCorners, pointInQuad, polygonArea } from "../geometry";
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

/** Fixed, sensitive Canny thresholds for the line cue: a white page on a white surface leaves only a faint edge. */
const LINE_CANNY: readonly [number, number] = [10, 30];
/** Hough: votes needed for a line, and the longest gap bridged inside one segment. */
const HOUGH_THRESHOLD = 40;
const HOUGH_MAX_GAP_PX = 6;
const MAX_SEGMENTS = 800;
/** Segments and merged lines shorter than these fractions of the shorter image side are ignored. */
const MIN_SEGMENT_FRACTION = 0.1;
const MIN_LINE_FRACTION = 0.12;
/** Long/short side ratios accepted for line-built pages: square notes to long receipts. */
const PAGE_ASPECT: readonly [number, number] = [1, 4];
const LINE_QUADS = 24;
/**
 * Folds, shaded bands and box borders inside a page are straight brightness steps too, so a
 * line-built quad can be a part of the page. A traced (contour) candidate that encloses the winner
 * is taken instead when it scores at least this fraction of the winner's score.
 */
const MIN_ENCLOSING_SCORE_RATIO = 0.7;
const ENCLOSING_SLACK_PX = 8;

interface Disposable { delete(): void }
type Own = <T extends Disposable>(x: T) => T;

export interface Candidate {
  points: Point[];
  area: number;
  method: DetectionMethod;
  support: number;
  /** How much of the outline separates two surfaces (see boundaryContrast). */
  contrast: number;
}

/** Filled by detectDocument when passed, for development diagnostics: every candidate considered. */
export interface DetectionTrace {
  candidates: Candidate[];
}

/**
 * Find the page quadrilateral. Several independent segmentations (edges, brightness, low colour
 * saturation) and long straight boundary lines each propose quads; every proposal is scored by how
 * well its sides follow real image edges and how much they separate two surfaces, so a corner stuck
 * on the frame, a patch of bright background or a table printed on the page is not mistaken for it.
 * Expects a moderately sized image (see downscale); all temporary OpenCV objects are released.
 */
export function detectDocument(cv: OpenCv, image: RasterImage, trace?: DetectionTrace): Result<DetectionResult> {
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
    // Support is measured on these median-based edges only: sensitive edges sit next to almost any
    // line on a page full of text, which would make every candidate look well supported.
    const nearEdge = own(new cv.Mat());
    cv.dilate(edges, nearEdge, nearKernel);


    const grey: Gray = { data: gray.data, width: image.width, height: image.height };
    const candidates: Candidate[] = [];
    const add = (points: Point[], method: DetectionMethod) => {
      const support = edgeSupport(points, nearEdge.data, image.width, image.height);
      candidates.push({ points, area: polygonArea(points), method, support, contrast: boundaryContrast(points, grey) });
    };
    const collect = (mask: InstanceType<OpenCv["Mat"]>, method: DetectionMethod) => {
      for (const q of quadsFrom(cv, mask, imageArea, own)) add(q.points, method);
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

    // Cue 4: straight sides. Text and ruled tables keep the outline of a page from closing into one
    // clean contour, so quads are also built from long straight lines, keeping only lines that
    // separate two surfaces (a printed table border has the same paper on both sides).
    const sensitive = own(new cv.Mat());
    cv.Canny(blur, sensitive, LINE_CANNY[0], LINE_CANNY[1]);
    const minSide = Math.min(image.width, image.height);
    const segments = houghSegments(cv, sensitive, MIN_SEGMENT_FRACTION * minSide, own);
    segments.sort((a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1));
    const straight = mergeSegments(segments.slice(0, MAX_SEGMENTS), MIN_LINE_FRACTION * minSide);
    const boundaries = straight.filter((l) => lineStep(grey, l) >= BOUNDARY_STEP);
    for (const quad of quadsFromLines(boundaries, {
      width: image.width, height: image.height,
      minAreaFraction: MIN_AREA_FRACTION, maxAreaFraction: MAX_AREA_FRACTION,
      support: (q) => edgeSupport(q, nearEdge.data, image.width, image.height), minSupport: MIN_EDGE_SUPPORT,
      aspectRange: PAGE_ASPECT, maxQuads: LINE_QUADS,
    })) {
      add([...quad], "lines");
    }

    // Outlines no flat page could make (slivers, one side far shorter than its opposite) are
    // dropped before ranking, so a plausible candidate can still win.
    if (trace) trace.candidates = candidates;
    const viable = candidates.filter((c) => c.support >= MIN_EDGE_SUPPORT && isPlausiblePage(c.points));
    // Sides on real edges, that separate the page from what surrounds it, and as much of the photo
    // as that allows: an inner table scores low on contrast, a patch of background on support.
    const score = (c: Candidate) => c.support * c.contrast * Math.sqrt(c.area / imageArea);
    const ranked = viable.sort((a, b) => score(b) - score(a))[0];
    const best =
      ranked?.method === "lines"
        ? viable
            .filter((c) =>
              c.method !== "lines" &&
              c.area > ranked.area &&
              score(c) >= MIN_ENCLOSING_SCORE_RATIO * score(ranked) &&
              ranked.points.every((p) => pointInQuad(c.points, p, ENCLOSING_SLACK_PX)))
            .sort((a, b) => b.area - a.area)[0] ?? ranked
        : ranked;
    if (!best) {
      return {
        ok: false,
        error: {
          code: "no-document-found",
          message:
            "No clear page boundary was found. Use Adjust corners to mark the page yourself, or try a photo where all four page edges are visible against a contrasting background.",
        },
      };
    }
    const ordered = orderCorners(best.points);
    // A side left on the photo's frame may belong on a faint page edge just inside it.
    const toFrameEdge = (q: Quad) => snapFrameSides(q, straight, sensitive.data, image.width, image.height);
    // A line-built page can stop at a band or fold printed on the page; move such sides out to the edge.
    const extended = best.method === "lines" ? extendSides(ordered, boundaries, grey) : ordered;
    if (extended !== ordered) {
      const corners = toFrameEdge(extended);
      return {
        ok: true,
        value: {
          corners,
          areaFraction: polygonArea(corners) / imageArea,
          method: best.method,
          edgeSupport: edgeSupport(corners, nearEdge.data, image.width, image.height),
        },
      };
    }
    // The hull of a crumpled page overshoots its curved sides; pull them in past strips of background.
    const trimmed = trimBackground(ordered, neutral.data, image.width, image.height);
    const trimmedSupport = edgeSupport(trimmed, nearEdge.data, image.width, image.height);
    // Keep the trim only if the new outline still follows real edges about as well as the old one.
    const useTrimmed =
      trimmed !== ordered && trimmedSupport >= best.support - MAX_SUPPORT_LOSS && isPlausiblePage(trimmed);
    const kept = useTrimmed ? trimmed : ordered;
    const corners = toFrameEdge(kept);
    return {
      ok: true,
      value: {
        corners,
        areaFraction: polygonArea(corners) / imageArea,
        method: best.method,
        edgeSupport:
          corners !== kept ? edgeSupport(corners, nearEdge.data, image.width, image.height)
          : useTrimmed ? trimmedSupport : best.support,
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

/** Straight segments found in an edge map (probabilistic Hough). */
function houghSegments(cv: OpenCv, edgeMap: InstanceType<OpenCv["Mat"]>, minLength: number, own: Own): Segment[] {
  const lines = own(new cv.Mat());
  cv.HoughLinesP(edgeMap, lines, 1, Math.PI / 180, HOUGH_THRESHOLD, minLength, HOUGH_MAX_GAP_PX);
  const d = lines.data32S;
  const out: Segment[] = [];
  for (let i = 0; i + 3 < d.length; i += 4) out.push({ x1: d[i]!, y1: d[i + 1]!, x2: d[i + 2]!, y2: d[i + 3]! });
  return out;
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
