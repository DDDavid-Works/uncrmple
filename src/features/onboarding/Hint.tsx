import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onDismiss: () => void;
}

/**
 * A one-time tip next to the control it explains. It announces itself politely and never takes
 * focus, so it does not get in the way of someone who already knows what to do.
 */
export function Hint({ children, onDismiss }: Props) {
  return (
    <div className="hint" role="status">
      <svg className="hint__icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 7.25v4M8 4.75v.01" />
      </svg>
      <p className="hint__text">{children}</p>
      <button type="button" className="btn btn--quiet btn--small hint__close" onClick={onDismiss}>
        Hide tip
      </button>
    </div>
  );
}
