import type { RepairedView } from "./useRepair";

/** Below this edge support, the page outline is only loosely on real edges (curved, folded or faint edges). */
export const LOW_EDGE_SUPPORT = 0.5;
/** Below this share of the photo, the detected "page" is suspicious. */
export const LOW_COVERAGE = 0.3;

export const lowCoverage = (v: RepairedView) => v.areaFraction !== undefined && v.areaFraction < LOW_COVERAGE;
export const weakEdges = (v: RepairedView) => v.edgeSupport !== undefined && v.edgeSupport < LOW_EDGE_SUPPORT;

/** True when a repaired page carries a warning the user should look at. */
export const needsCheck = (v: RepairedView) => lowCoverage(v) || weakEdges(v);
