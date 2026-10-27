import type { CardDetection, Point, Quad, RasterImage, Result } from "../../../types/repair";
import { mergeSegments, quadsFromLines } from "../card-lines";
import type { Segment } from "../card-lines";
import { reduceToQuad, refineQuadByLines, scoreCard, shapeScore } from "../card-geometry";
import { isConvex, orderCorners, pointInQuad, polygonArea } from "../geometry";
import { edgeSupport, processingFailed } from "./detect";
import type { OpenCv } from "./loader";

/** Cards are often small in the frame: accept shapes from 2% of the image. */
const MIN_AREA_FRACTION = 0.02;
const MAX_AREA_FRACTION = 0.97;
/** Hull simplification before reducing to four corners (fraction of the hull perimeter). */
const SIMPLIFY_EPSILON = 0.004;
const QUADS_PER_MASK = 6;
const EDGE_RADIUS_PX = 4;
const SENSITIVE_CANNY: readonly [number, number] = [8, 24];
/**
 * A card's printed photo box or header looks like a smaller card. If a larger candidate that
 * encloses the winner is still plausible and not much weaker, the larger one is taken.
 */
/** Hough: votes needed for a line, and the longest gap bridged inside one segment. */
const HOUGH_THRESHOLD = 40;
const HOUGH_MAX_GAP_PX = 6;
/** Line-built candidates must follow edges at least this well to be considered. */
const LINE_MIN_SUPPORT = 0.45;
const MAX_SEGMENTS = 800;
/** Line-built quads must beat contour-built ones by this much to be chosen (they are less exact). */
const LINE_RANK_PENALTY = 0.06;
const MAX_ENCLOSING_AREA_RATIO = 10;
const MAX_ENCLOSING_CONFIDENCE_GAP = 0.3;
/** An enclosing candidate must itself look like a card and lie within the photo. */
const MIN_ENCLOSING_SHAPE = 0.3;
/** Colour difference (max channel, 0..255) across a side that counts as a visible boundary. */
const CONTRAST_THRESHOLD = 18;
/** Probe distances (px) inside and outside each side. */
const PROBE_OFFSETS = [3, 4, 5, 6];
const SIDE_START = 0.1;
const SIDE_END = 0.9;

interface Disposable { delete(): void }
type Own = <T extends Disposable>(x: T) => T;
type Mat = InstanceType<OpenCv["Mat"]>;

interface Candidate {
  quad: Quad;
  /** Built from straight lines rather than a traced contour: corners are a few pixels less exact. */
  fromLines?: boolean;
  support: number;
  visibility: [number, number, number, number];
}

/**
 * Find a rectangular card. Several segmentations (grey edges, per-colour-channel edges, bright and
 * dark regions) each propose convex four-sided shapes; corners are refined by fitting straight
 * lines to the outline (cards have rounded corners), and every candidate is scored by edge support,
 * visible contrast on each side, and card-like shape. The best-scoring candidate is returned only
 * when its heuristic confidence is high enough to offer to the user; otherwise `no-card-found`.
 * Expects a moderately sized image (see downscale). All OpenCV objects are released.
 */
export function detectCard(cv: OpenCv, image: RasterImage): Result<CardDetection> {
  const owned: Disposable[] = [];
  const own: Own = (x) => (owned.push(x), x);
  const { width, height } = image;
  const imageArea = width * height;

  try {
    const rgba = own(new cv.Mat(height, width, cv.CV_8UC4));
    rgba.data.set(image.data);
    const rgb = own(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    const gray = own(new cv.Mat());
    cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
    const blur = own(new cv.Mat());
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

    // Edge map 1: luminance. Edge map 2: each colour channel, with more sensitive thresholds, so a
    // card that differs from its background in hue but not brightness still produces an outline.
    const edges = own(new cv.Mat());
    autoCanny(cv, blur, edges, 0.66, 1.33);
    const channels = own(new cv.MatVector());
    cv.split(rgb, channels);
    const colourEdges = own(new cv.Mat());
    edges.copyTo(colourEdges);
    for (let c = 0; c < 3; c++) {
      const ch = own(channels.get(c));
      const chBlur = own(new cv.Mat());
      cv.GaussianBlur(ch, chBlur, new cv.Size(5, 5), 0);
      const e = own(new cv.Mat());
      // Fixed, sensitive thresholds: gradient strength does not scale with brightness.
      cv.Canny(chBlur, e, SENSITIVE_CANNY[0], SENSITIVE_CANNY[1]);
      cv.bitwise_or(colourEdges, e, colourEdges);
    }

    const k = 2 * EDGE_RADIUS_PX + 1;
    const nearKernel = own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k)));
    const nearEdge = own(new cv.Mat());
    cv.dilate(colourEdges, nearEdge, nearKernel);

    const candidates: Candidate[] = [];
    const collect = (mask: Mat) => {
      for (const q of quadsFrom(cv, mask, imageArea, own)) {
        const refined = refineQuadByLines(q.points, q.outline);
        // Line fitting can extend a side past the photo border; a card cannot lie outside the photo.
        const quad = orderCorners(refined.map((p) => ({ x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) }))) as Quad;
        const area = polygonArea(quad);
        if (!isConvex(quad) || area < MIN_AREA_FRACTION * imageArea || area > MAX_AREA_FRACTION * imageArea) continue;
        candidates.push({
          quad,
          support: edgeSupport(quad, nearEdge.data, width, height),
          visibility: sideVisibility(image, quad),
        });
      }
    };

    const close3 = own(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    for (const source of [edges, colourEdges]) {
      const closed = own(new cv.Mat());
      cv.dilate(source, closed, close3);
      collect(closed);
    }

    // Region cues: card lighter or darker than its surroundings.
    const otsu = own(new cv.Mat());
    cv.threshold(blur, otsu, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    const open9 = own(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)));
    const light = own(new cv.Mat());
    cv.morphologyEx(otsu, light, cv.MORPH_OPEN, open9);
    collect(light);
    const dark = own(new cv.Mat());
    cv.bitwise_not(otsu, dark);
    cv.morphologyEx(dark, dark, cv.MORPH_OPEN, open9);
    collect(dark);

    // Straight-edge cue: builds a card from its four sides even when its outline is broken.
    const minSide = Math.min(width, height);
    const segments = [edges, colourEdges].flatMap((m) => houghSegments(cv, m, 0.1 * minSide, own));
    segments.sort((a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1));
    const lines = mergeSegments(segments.slice(0, MAX_SEGMENTS), 0.12 * minSide);
    for (const quad of quadsFromLines(lines, {
      width, height, minAreaFraction: MIN_AREA_FRACTION, maxAreaFraction: MAX_AREA_FRACTION,
      support: (q) => edgeSupport(q, nearEdge.data, width, height), minSupport: LINE_MIN_SUPPORT,
    })) {
      candidates.push({ quad, fromLines: true, support: edgeSupport(quad, nearEdge.data, width, height), visibility: sideVisibility(image, quad) });
    }

    const scored = candidates
      .map((c) => ({
        c,
        rank: 0,
        score: scoreCard({
          quad: c.quad, imageWidth: width, imageHeight: height,
          edgeSupport: c.support, sideVisibility: c.visibility,
        }),
      }))
      .filter((x) => x.score.level);
    for (const x of scored) x.rank = x.score.confidence - (x.c.fromLines ? LINE_RANK_PENALTY : 0);
    let best = scored.reduce<(typeof scored)[number] | null>((b, x) => (!b || x.rank > b.rank ? x : b), null);
    if (best) {
      const inner = best;
      const enclosing = scored
        .filter((x) =>
          x !== inner && !x.c.fromLines &&
          x.score.areaFraction > inner.score.areaFraction * 1.3 &&
          x.score.areaFraction < inner.score.areaFraction * MAX_ENCLOSING_AREA_RATIO &&
          x.rank >= inner.rank - MAX_ENCLOSING_CONFIDENCE_GAP &&
          shapeScore(x.c.quad) >= MIN_ENCLOSING_SHAPE &&
          !x.score.warnings.includes("card-cut-off") &&
          inner.c.quad.every((p) => pointInQuad(x.c.quad, p, 6)))
        .sort((a, b) => b.rank - a.rank)[0];
      if (enclosing) best = enclosing;
    }
    if (!best || !best.score.level) {
      return {
        ok: false,
        error: {
          code: "no-card-found",
          message: "No card outline was found automatically. Place the corners manually on the photo.",
        },
      };
    }
    const { c, score } = best;
    return {
      ok: true,
      value: {
        corners: c.quad,
        confidence: score.confidence,
        level: score.level!,
        aspectRatio: score.aspectRatio,
        areaFraction: score.areaFraction,
        edgeSupport: c.support,
        sideVisibility: c.visibility,
        warnings: score.warnings,
      },
    };
  } catch (e) {
    return processingFailed("Card detection failed", e);
  } finally {
    for (const o of owned) o.delete();
  }
}

/** Straight segments found in an edge map (Probabilistic Hough). */
function houghSegments(cv: OpenCv, edgeMap: Mat, minLength: number, own: Own): Segment[] {
  const lines = own(new cv.Mat());
  cv.HoughLinesP(edgeMap, lines, 1, Math.PI / 180, HOUGH_THRESHOLD, minLength, HOUGH_MAX_GAP_PX);
  const d = lines.data32S;
  const out: Segment[] = [];
  for (let i = 0; i + 3 < d.length; i += 4) out.push({ x1: d[i]!, y1: d[i + 1]!, x2: d[i + 2]!, y2: d[i + 3]! });
  return out;
}

/** Canny with thresholds derived from the image median. */
function autoCanny(cv: OpenCv, src: Mat, dst: Mat, lowFactor: number, highFactor: number): void {
  const m = medianOf(src.data);
  const lower = Math.max(8, lowFactor * m);
  const upper = Math.min(255, Math.max(lower + 15, highFactor * m));
  cv.Canny(src, dst, lower, upper);
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

/** Convex quadrilaterals (and their outline points) found in a binary mask, largest first. */
function quadsFrom(
  cv: OpenCv,
  binary: Mat,
  imageArea: number,
  own: Own,
): { points: Quad; outline: Point[]; area: number }[] {
  const contours = own(new cv.MatVector());
  const hierarchy = own(new cv.Mat());
  cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const found: { points: Quad; outline: Point[]; area: number }[] = [];
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const hull = new cv.Mat();
    try {
      if (cv.contourArea(contour) < MIN_AREA_FRACTION * imageArea * 0.8) continue;
      cv.convexHull(contour, hull);
      const perimeter = cv.arcLength(hull, true);
      // Drop collinear hull vertices, then collapse chamfers/rounded corners onto four corners.
      const simple = new cv.Mat();
      try {
        cv.approxPolyDP(hull, simple, SIMPLIFY_EPSILON * perimeter, true);
        const d = simple.data32S;
        const poly: Point[] = [];
        for (let j = 0; j + 1 < simple.rows * 2; j += 2) poly.push({ x: d[j]!, y: d[j + 1]! });
        const quad = reduceToQuad(poly);
        if (!quad) continue;
        const area = polygonArea(quad);
        if (area < MIN_AREA_FRACTION * imageArea || area > MAX_AREA_FRACTION * imageArea) continue;
        const raw = contour.data32S;
        const outline: Point[] = [];
        for (let j = 0; j + 1 < raw.length; j += 2) outline.push({ x: raw[j]!, y: raw[j + 1]! });
        found.push({ points: orderCorners(quad), outline, area });
      } finally {
        simple.delete();
      }
    } finally {
      hull.delete();
      contour.delete();
    }
  }
  return found.sort((a, b) => b.area - a.area).slice(0, QUADS_PER_MASK);
}

/**
 * Per side (top, right, bottom, left): share of samples along the middle of the side where the
 * colour just inside differs from the colour just outside. Low values mean the side is covered,
 * faint, or washed out. Samples outside the photo are skipped; a side with none scores a neutral 0.5.
 */
export function sideVisibility(image: RasterImage, quad: Quad): [number, number, number, number] {
  const { width, height, data } = image;
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const mean = (x: number, y: number, nx: number, ny: number, sign: number): [number, number, number] | null => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const o of PROBE_OFFSETS) {
      const px = Math.round(x + sign * nx * o);
      const py = Math.round(y + sign * ny * o);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const i = (py * width + px) * 4;
      r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
    }
    return n === 0 ? null : [r / n, g / n, b / n];
  };

  const out: number[] = [];
  for (let s = 0; s < 4; s++) {
    const a = quad[s]!;
    const b = quad[(s + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) { out.push(0); continue; }
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) { nx = -nx; ny = -ny; }
    const steps = Math.max(4, Math.round(len / 4));
    let tested = 0, visible = 0;
    for (let i = 0; i <= steps; i++) {
      const t = SIDE_START + ((SIDE_END - SIDE_START) * i) / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const inside = mean(x, y, nx, ny, 1);
      const outside = mean(x, y, nx, ny, -1);
      if (!inside || !outside) continue;
      tested++;
      const diff = Math.max(Math.abs(inside[0] - outside[0]), Math.abs(inside[1] - outside[1]), Math.abs(inside[2] - outside[2]));
      if (diff >= CONTRAST_THRESHOLD) visible++;
    }
    out.push(tested === 0 ? 0.5 : visible / tested);
  }
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}
