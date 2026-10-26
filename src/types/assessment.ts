export type AssessmentDimension =
  | "geometry"
  | "lighting"
  | "sharpness"
  | "resolution"
  | "completeness"
  | "readability";

/** How problematic a dimension is for repair. "unknown" means it could not be measured reliably. */
export type FindingLevel = "good" | "moderate" | "poor" | "unknown";

export interface Finding {
  dimension: AssessmentDimension;
  level: FindingLevel;
  /** 0..1: how much the measurement can be trusted. */
  confidence: number;
  /** Plain-language explanation shown to the user. */
  detail: string;
}

/** Overall expectation: good candidate, possible with limitations, or poor candidate. */
export type Verdict = "good" | "limited" | "poor";

/**
 * How much the photo looks like a paper document page.
 * "document": a page outline was found and the content looks like paper.
 * "uncertain": mixed signals (e.g. a flat scan or screenshot that fills the frame, or a coloured page).
 * "not-document": no page outline and no paper-like content, e.g. a portrait or landscape photo.
 * A heuristic estimate, never a classification guarantee.
 */
export type PageLikeness = "document" | "uncertain" | "not-document";

export interface Assessment {
  likeness: PageLikeness;
  verdict: Verdict;
  /** One or two sentences; an estimate, never a guarantee. */
  summary: string;
  findings: Finding[];
  /** False when the page outline was not found, so measurements cover the whole photo. */
  pageDetected: boolean;
}
