/** Id of the right-hand panel in either mode, for the toggle's aria-controls. */
export const PANEL_ID = "steps-panel";

interface Props {
  open: boolean;
  onToggle: () => void;
}

/**
 * A tab on the left edge of the right-hand panel (check, settings, export) that folds the panel away
 * to give the photo more room, and stays at the edge to bring it back. The panel starts hidden and
 * opens only from here; while hidden, the photo check's verdict shows under the photo. Wide screens only: on
 * narrower ones the panel sits under the photo and the tab is not shown.
 */
export function PanelToggle({ open, onToggle }: Props) {
  const label = open ? "Hide details" : "Show details";
  return (
    <button
      type="button"
      className={open ? "panel-tab" : "panel-tab panel-tab--closed"}
      aria-expanded={open}
      aria-controls={PANEL_ID}
      title={label}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {open ? <path d="m6 4 4 4-4 4" /> : <path d="m10 4-4 4 4 4" />}
      </svg>
      <span className="panel-tab__label">{label}</span>
    </button>
  );
}
