import type { AssessmentDimension, FindingLevel, Verdict } from "../../types/assessment";
import { BusyNotice } from "../../components/BusyNotice";
import type { AssessmentState } from "./useAssessment";

const VERDICT_TITLE: Record<Verdict, string> = {
  good: "Good repair candidate",
  limited: "Repair possible, with limitations",
  poor: "Poor repair candidate",
};

/** Shape cue alongside colour, so the verdict does not rely on colour alone. */
const VERDICT_ICON: Record<Verdict, string> = { good: "✓", limited: "!", poor: "✕" };

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
    return <BusyNotice task="Analysing the photo…" />;
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
  // A good page needs no attention: one line, with the explanation under Details.
  const compact = assessment.verdict === "good" && assessment.likeness === "document";
  return (
    <section
      className={`assessment assessment--${assessment.verdict}${compact ? " assessment--compact" : ""}`}
      aria-label="Photo assessment"
    >
      <h3 className="assessment__title">
        <span className="assessment__badge" aria-hidden="true">
          {VERDICT_ICON[assessment.verdict]}
        </span>
        {/* The verdict is what matters; the label only says what it is about. */}
        <span className="assessment__heading">
          <span className="assessment__label">Photo assessment:</span> <span className="assessment__verdict">{title}</span>
        </span>
      </h3>
      {!compact && <p>{assessment.summary}</p>}
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
        <summary>View details</summary>
        {compact && <p className="assessment__summary">{assessment.summary}</p>}
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
