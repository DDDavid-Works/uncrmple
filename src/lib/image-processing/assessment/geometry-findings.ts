import type { Finding } from "../../../types/assessment";
import type { Quad } from "../../../types/repair";
import { DESKEW, deskewDecision, isBent } from "../deskew";
import type { TiltMeasurement } from "../tilt";

/** Thresholds are first estimates; tune them against real photographs. */
export const GEOMETRY = {
  /** Ratio of opposite page edges (1 = no perspective). */
  perspectiveModerate: 1.12,
  perspectivePoor: 1.8,
  /** Degrees of tilt of the page's top edge. */
  tiltModerate: 4,
  /** Below this edge support the outline itself is uncertain. */
  edgeSupportLow: 0.5,
  /** Degrees of bend between the top and bottom of the page at which lines visibly stay crooked. */
  bendPoor: 4,
};
export const RESOLUTION = {
  /** Pixels along the page's long side. 1600 px is about 135 dpi on A4 or Letter. */
  goodLongSide: 1600,
  moderateLongSide: 1000,
  /** Long side of an A4 page in inches (Letter is close enough for an estimate). */
  pageLongSideInches: 11.7,
};
/** Fraction of the shorter photo side within which a page edge counts as lying on the photo border. */
const BORDER_TOLERANCE = 0.01;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Page edge lengths: top, right, bottom, left. */
function sides(q: Quad): [number, number, number, number] {
  return [dist(q[0], q[1]), dist(q[1], q[2]), dist(q[3], q[2]), dist(q[0], q[3])];
}

/**
 * `quad` is in full-image pixels, or null when the page was not found. `tilt` is the lean of the
 * printed lines after straightening the page; omit it when it was not measured.
 */
export function measureGeometry(quad: Quad | null, edgeSupport: number | undefined, tilt?: TiltMeasurement | null): Finding {
  if (!quad) {
    return {
      dimension: "geometry",
      level: "poor",
      confidence: 0.7,
      detail: "The page outline was not found automatically. You will need to mark the four corners yourself.",
    };
  }
  const [top, right, bottom, left] = sides(quad);
  const perspective = Math.max(Math.max(top, bottom) / Math.max(1, Math.min(top, bottom)), Math.max(left, right) / Math.max(1, Math.min(left, right)));
  const pageTilt = Math.abs((Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x) * 180) / Math.PI);
  const uncertain = edgeSupport !== undefined && edgeSupport < GEOMETRY.edgeSupportLow;

  const bent = isBent(tilt ?? null) ? tilt!.bend! : 0;
  const lean = tilt && deskewDecision(tilt).applied !== 0 ? Math.abs(tilt.angle) : 0;

  let level: Finding["level"] = "good";
  if (perspective >= GEOMETRY.perspectivePoor || bent >= GEOMETRY.bendPoor) level = "poor";
  else if (perspective >= GEOMETRY.perspectiveModerate || pageTilt >= GEOMETRY.tiltModerate || uncertain || bent >= DESKEW.bendDeg) level = "moderate";

  const notes: string[] = [];
  if (perspective >= GEOMETRY.perspectiveModerate) notes.push(`photographed at an angle (edges differ by ${Math.round((perspective - 1) * 100)}%)`);
  if (pageTilt >= GEOMETRY.tiltModerate) notes.push(`tilted about ${Math.round(pageTilt)}°`);
  let detail = notes.length ? `Page is ${notes.join(" and ")}; this can be straightened.` : "Page is close to square-on.";
  if (lean && !bent) detail += ` The printed lines lean about ${lean.toFixed(1)}° inside the page outline; this can be levelled too.`;
  if (bent) {
    detail +=
      ` The printed lines bend by about ${bent.toFixed(1)}° from one part of the page to another, so the paper is probably` +
      " curved or creased. Repair flattens curved lines where it can follow enough rows of text or ruled lines, and leaves" +
      " them as photographed when a trial does not make them straighter. Sharp creases and crumpling may still leave some" +
      " lines sloping; flattening the page and retaking the photo gives the best result.";
  }
  if (perspective >= GEOMETRY.perspectivePoor) detail += " A steep angle means the far side has fewer pixels, so it will look softer.";
  if (uncertain) detail += " The page edges are faint, so the detected outline may be slightly off.";
  return {
    dimension: "geometry",
    level,
    confidence: Math.min(1, Math.max(0.3, edgeSupport ?? 0.8)),
    detail,
  };
}

/** A page edge lying along the photo border suggests that part of the page is outside the photo. */
export function measureCompleteness(quad: Quad | null, width: number, height: number): Finding {
  if (!quad) {
    return {
      dimension: "completeness",
      level: "unknown",
      confidence: 0.2,
      detail: "Without a page outline, cut-off edges cannot be checked.",
    };
  }
  const tol = Math.max(2, BORDER_TOLERANCE * Math.min(width, height));
  const [tl, tr, br, bl] = quad;
  const touching = [
    tl.y <= tol && tr.y <= tol,
    tr.x >= width - tol && br.x >= width - tol,
    bl.y >= height - tol && br.y >= height - tol,
    tl.x <= tol && bl.x <= tol,
  ].filter(Boolean).length;
  if (touching === 0) {
    return { dimension: "completeness", level: "good", confidence: 0.7, detail: "The whole page outline appears to be inside the photo." };
  }
  return {
    dimension: "completeness",
    level: touching === 1 ? "moderate" : "poor",
    confidence: 0.7,
    detail:
      touching === 1
        ? "One side of the page runs along the edge of the photo, so part of the page may be cut off."
        : `${touching} sides of the page run along the edge of the photo, so parts of the page are probably cut off. Missing content cannot be recovered.`,
  };
}

export function measureResolution(quad: Quad | null, width: number, height: number): Finding {
  let longSide: number;
  if (quad) {
    const [top, right, bottom, left] = sides(quad);
    longSide = Math.max(top, bottom, left, right);
  } else {
    longSide = Math.max(width, height);
  }
  const rounded = Math.round(longSide);
  const dpi = Math.round(longSide / RESOLUTION.pageLongSideInches / 10) * 10;
  const level: Finding["level"] =
    longSide >= RESOLUTION.goodLongSide ? "good" : longSide >= RESOLUTION.moderateLongSide ? "moderate" : "poor";
  const base = `About ${rounded} px along the page's long side (roughly ${dpi} dpi if it is A4 or Letter).`;
  const advice =
    level === "good" ? "" : level === "moderate" ? " Small print may be hard to read." : " This is low; small print is likely to be unreadable.";
  return { dimension: "resolution", level, confidence: quad ? 0.9 : 0.5, detail: base + advice };
}
