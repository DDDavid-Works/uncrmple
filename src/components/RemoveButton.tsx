import { useEffect, useRef, useState } from "react";

interface Props {
  name: string;
  onRemove: () => void;
  /** A small ✕ that asks "Remove?" in place, for tight spots such as the page list. */
  compact?: boolean;
}

/** Remove with an inline confirmation; the default focus lands on "Keep". */
export function RemoveButton({ name, onRemove, compact = false }: Props) {
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (confirming) {
      opened.current = true;
      keepRef.current?.focus();
    } else if (opened.current) {
      removeRef.current?.focus();
    }
  }, [confirming]);

  if (!confirming) {
    return compact ? (
      <button
        ref={removeRef}
        type="button"
        className="btn btn--small btn--danger-quiet remove--compact"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${name}`}
        title="Remove"
      >
        <span aria-hidden="true">✕</span>
      </button>
    ) : (
      <button ref={removeRef} type="button" className="btn btn--small btn--danger-quiet" onClick={() => setConfirming(true)}>
        Remove
      </button>
    );
  }
  return (
    <span
      className={compact ? "confirm confirm--compact" : "confirm"}
      role="group"
      aria-label={`Confirm removing ${name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setConfirming(false);
      }}
    >
      <span className="confirm__text">{compact ? "Remove this photo?" : `Remove ${name}?`}</span>
      {/* In the compact form the answers are icons, with their words as labels and tooltips. */}
      <button
        type="button"
        className="btn btn--small btn--danger"
        onClick={onRemove}
        aria-label={compact ? "Remove" : undefined}
        title={compact ? "Remove" : undefined}
      >
        {compact ? <TrashIcon /> : "Remove"}
      </button>
      <button
        ref={keepRef}
        type="button"
        className="btn btn--small"
        onClick={() => setConfirming(false)}
        aria-label={compact ? "Keep" : undefined}
        title={compact ? "Keep" : undefined}
      >
        {compact ? <KeepIcon /> : "Keep"}
      </button>
    </span>
  );
}

function TrashIcon() {
  return (
    <svg className="confirm__icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.75 6.5v4.5M9.25 6.5v4.5" />
    </svg>
  );
}

/** A turn-back arrow: leave the photo as it is. */
function KeepIcon() {
  return (
    <svg className="confirm__icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 3 2.5 6l3 3" />
      <path d="M2.5 6h7a4 4 0 0 1 0 8H7" />
    </svg>
  );
}
