import type { AssessmentDimension, Assessment, Finding } from "../../../types/assessment";

/** Defects that conventional repair cannot undo: lost detail, lost content, lost contrast. */
const UNRECOVERABLE: readonly AssessmentDimension[] = ["sharpness", "resolution", "completeness", "readability"];
/** A single unrecoverable "poor" finding decides the verdict only if it is measured with at least this confidence. */
const CONFIDENT = 0.6;
/** With fewer measured findings than this, no verdict is trustworthy. */
const MIN_MEASURED = 3;

export const DIMENSION_LABEL: Record<AssessmentDimension, string> = {
  geometry: "page outline and angle",
  lighting: "lighting",
  sharpness: "sharpness",
  resolution: "resolution",
  completeness: "completeness",
  readability: "text contrast",
};

const list = (items: string[]) => items.join(", ");

/** Combine findings into one expectation. Never a guarantee; the wording says so. */
export function summarise(findings: Finding[]): Pick<Assessment, "verdict" | "summary"> {
  const measured = findings.filter((f) => f.level !== "unknown");
  if (measured.length < MIN_MEASURED) {
    return {
      verdict: "limited",
      summary: "Too little could be measured to judge this photo reliably. You can still try a repair and check the result.",
    };
  }
  const poorHard = findings.filter((f) => f.level === "poor" && UNRECOVERABLE.includes(f.dimension));
  const softHard = findings.filter((f) => f.level === "moderate" && UNRECOVERABLE.includes(f.dimension));
  const poorFixable = findings.filter((f) => f.level === "poor" && !UNRECOVERABLE.includes(f.dimension));

  if (poorHard.length >= 2 || poorHard.some((f) => f.confidence >= CONFIDENT)) {
    return {
      verdict: "poor",
      summary: `Poor repair candidate: problems with ${list(poorHard.map((f) => DIMENSION_LABEL[f.dimension]))} cannot be fixed by repair. Retaking the photo, if you can, will give a much better result. You can still try a repair.`,
    };
  }
  const limits = [...poorHard, ...softHard, ...poorFixable];
  if (limits.length > 0) {
    return {
      verdict: "limited",
      summary: `Repair is possible, with limitations (${list(limits.map((f) => DIMENSION_LABEL[f.dimension]))}). Readability is not guaranteed; check the repaired text against the original.`,
    };
  }
  return {
    verdict: "good",
    summary: "Good repair candidate. This is an estimate; check the result against the original.",
  };
}
