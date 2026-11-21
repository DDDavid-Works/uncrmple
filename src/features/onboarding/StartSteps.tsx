import type { ProcessingMode } from "../mode/ModeSelector";

interface Props {
  mode: ProcessingMode;
  /** Adds the sample photo; omitted where there is no sample (ID & Card Crop). */
  onSample?: () => void;
  /** The sample is being drawn. */
  sampleBusy?: boolean;
  /** Why the sample could not be added, if it failed. */
  sampleError?: string | null;
}

const STEPS: Record<ProcessingMode, string[]> = {
  document: ["Add a photo of a page", "Repair it to straighten and clean up", "Download an image or PDF"],
  card: ["Add a photo of a card", "Check the crop", "Download an image or PDF"],
};

/** The whole workflow at a glance on the empty screen, and a sample to try it with. */
export function StartSteps({ mode, onSample, sampleBusy = false, sampleError = null }: Props) {
  return (
    <div className="start">
      <ol className="start__steps" aria-label="How it works">
        {STEPS[mode].map((s, i) => (
          <li key={s} className="start__step">
            <span className="start__num" aria-hidden="true">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      {onSample && (
        <p className="start__sample">
          No photo yet?{" "}
          <button type="button" className="link-button" onClick={onSample} disabled={sampleBusy}>
            {sampleBusy ? "Preparing the sample…" : "Try a sample photo"}
          </button>
        </p>
      )}
      {sampleError && (
        <p role="alert" className="notice notice--error start__error">
          {sampleError}
        </p>
      )}
    </div>
  );
}
