import { useId, useState } from "react";
import type { AssessmentDimension, FindingLevel, Verdict } from "../../types/assessment";
import { BusyNotice } from "../../components/BusyNotice";
import type { AssessmentState } from "./useAssessment";
import { detailsShown, setDetailsShown } from "./details-state";

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
  const [showDetails, setShowDetails] = useState(detailsShown);
  const detailsId = useId();
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
  return (
    <section className={`assessment assessment--${assessment.verdict}`} aria-label="Photo assessment">
      <div className="assessment__verdict-card">
        <h4 className="assessment__title">
          <span className="assessment__badge" aria-hidden="true">
            {VERDICT_ICON[assessment.verdict]}
          </span>
          <span className="assessment__verdict">{title}</span>
        </h4>
        <p className="assessment__summary">{assessment.summary}</p>
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
      </div>
      <button
        type="button"
        className="assessment__more"
        aria-expanded={showDetails}
        aria-controls={detailsId}
        onClick={() => {
          setDetailsShown(!showDetails);
          setShowDetails(!showDetails);
        }}
      >
        {showDetails ? "Hide details" : "View more details"}
      </button>
      <ul className="assessment__findings" id={detailsId}>
        {assessment.findings.map((f) => (
          <li key={f.dimension} className={`finding finding--${f.level}`}>
            <span className="finding__row">
              <span className="finding__name">{DIMENSION_TITLE[f.dimension]}</span>
              <span className="finding__level">
                {LEVEL_TEXT[f.level]}
                {f.level !== "unknown" && f.confidence < 0.5 ? " (low confidence)" : ""}
              </span>
            </span>
            {/* The rows give the overview; the explanations are long, so they open on request. */}
            <span className="finding__detail" hidden={!showDetails}>
              {f.detail}
            </span>
          </li>
        ))}
      </ul>
      <p className="assessment__note">Estimates from the photo's pixels, not a guarantee. Check the result yourself.</p>
    </section>
  );
}
