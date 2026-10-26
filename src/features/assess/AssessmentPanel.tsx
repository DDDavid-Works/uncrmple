import type { AssessmentDimension, FindingLevel, Verdict } from "../../types/assessment";
import type { AssessmentState } from "./useAssessment";

const VERDICT_TITLE: Record<Verdict, string> = {
  good: "Good repair candidate",
  limited: "Repair possible, with limitations",
  poor: "Poor repair candidate",
};

const DIMENSION_TITLE: Record<AssessmentDimension, string> = {
  geometry: "Page angle and outline",
  lighting: "Lighting",
  sharpness: "Sharpness",
  resolution: "Resolution",
  completeness: "Completeness",
  readability: "Text contrast",
};

const LEVEL_TEXT: Record<FindingLevel, string> = {
  good: "Good",
  moderate: "Moderate",
  poor: "Problem",
  unknown: "Not measured",
};

interface Props {
  state: AssessmentState;
  /** Offered when the photo does not clearly show a document page. */
  onAdjustCorners?: () => void;
  onCleanWholeImage?: () => void;
  disabled?: boolean;
}

export function AssessmentPanel({ state, onAdjustCorners, onCleanWholeImage, disabled }: Props) {
  if (state.status === "idle") return null;
  if (state.status === "running") {
    return (
      <p role="status" className="notice">
        Analysing photo… The first analysis loads the image engine (about 4 MB), which can take a few seconds.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="notice notice--warn">
        The photo could not be assessed: {state.message} You can still try a repair.
      </p>
    );
  }
  const { assessment } = state;
  const title = assessment.likeness === "not-document" ? "No document detected" : VERDICT_TITLE[assessment.verdict];
  return (
    <section className={`assessment assessment--${assessment.verdict}`} aria-label="Photo assessment">
      <h3 className="assessment__title">
        Photo assessment: <span>{title}</span>
      </h3>
      <p>{assessment.summary}</p>
      {assessment.likeness !== "document" && (
        <div className="assessment__actions">
          <button type="button" className="btn btn--small" onClick={onAdjustCorners} disabled={disabled}>
            Mark corners
          </button>
          <button type="button" className="btn btn--small" onClick={onCleanWholeImage} disabled={disabled}>
            Clean up whole image
          </button>
        </div>
      )}
      <details>
        <summary>Details</summary>
        <ul className="assessment__findings">
          {assessment.findings.map((f) => (
            <li key={f.dimension}>
              <strong>{DIMENSION_TITLE[f.dimension]}</strong>: {LEVEL_TEXT[f.level]}
              {f.level !== "unknown" && f.confidence < 0.5 ? " (low confidence)" : ""}
              <br />
              <span className="muted">{f.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
