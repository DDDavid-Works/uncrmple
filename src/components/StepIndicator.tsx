const STEPS = ["Upload", "Repair", "Review", "Export"] as const;
export type Step = (typeof STEPS)[number];

interface Props {
  current: Step;
  /** Export becomes available as soon as one page is done, even while reviewing. */
  exportReady: boolean;
}

/** Shows where the user is in Upload → Repair → Review → Export. A status display, not navigation. */
export function StepIndicator({ current, exportReady }: Props) {
  const at = STEPS.indexOf(current);
  return (
    <ol className="steps" aria-label="Progress">
      {STEPS.map((step, i) => {
        const done = i < at;
        const isCurrent = i === at || (step === "Export" && exportReady);
        const state = isCurrent ? "current" : done ? "done" : "todo";
        return (
          <li key={step} className={`steps__item steps__item--${state}`} aria-current={i === at ? "step" : undefined}>
            <span className="steps__label">{step}</span>
            {done && <span className="visually-hidden"> (done)</span>}
            {step === "Export" && exportReady && i !== at && <span className="visually-hidden"> (available)</span>}
          </li>
        );
      })}
    </ol>
  );
}
