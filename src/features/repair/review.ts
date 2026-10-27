import type { DewarpSkip } from "../../types/repair";
import type { RepairedView } from "./useRepair";

/** Below this edge support, the page outline is only loosely on real edges (curved, folded or faint edges). */
export const LOW_EDGE_SUPPORT = 0.5;
/** Below this share of the photo, the detected "page" is suspicious. */
export const LOW_COVERAGE = 0.3;

export const lowCoverage = (v: RepairedView) => v.areaFraction !== undefined && v.areaFraction < LOW_COVERAGE;
export const weakEdges = (v: RepairedView) => v.edgeSupport !== undefined && v.edgeSupport < LOW_EDGE_SUPPORT;

/** The print bends across the page (curved or creased paper) and could not be flattened, so some lines still slope. */
export const bentPage = (v: RepairedView) => v.deskew.bent && !v.dewarp.applied;

/** Why curved lines were left as photographed, completing "the curve could not be flattened: …". */
export const DEWARP_SKIP_REASONS: Record<DewarpSkip, string> = {
  "too-little-evidence": "there were too few lines of text or ruled lines to follow.",
  "too-large": "the lines suggested an implausibly large bend, so it was not trusted.",
  "already-flat": "the bend was too slight to measure reliably.",
  "not-improved": "a trial did not make the lines clearly straighter, so it was not applied.",
  off: "flattening is turned off.",
};

/** True when a repaired page carries a warning the user should look at. */
export const needsCheck = (v: RepairedView) => lowCoverage(v) || weakEdges(v) || bentPage(v);
