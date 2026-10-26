import { useEffect, useRef, useState } from "react";

interface Props {
  name: string;
  onRemove: () => void;
}

/** Remove with an inline confirmation; the default focus lands on "Keep". */
export function RemoveButton({ name, onRemove }: Props) {
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
    return (
      <button ref={removeRef} type="button" className="btn btn--danger-quiet" onClick={() => setConfirming(true)}>
        Remove
      </button>
    );
  }
  return (
    <span
      className="confirm"
      role="group"
      aria-label={`Confirm removing ${name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setConfirming(false);
      }}
    >
      <span className="confirm__text">Remove {name}?</span>
      <button type="button" className="btn btn--small btn--danger" onClick={onRemove}>
        Remove
      </button>
      <button ref={keepRef} type="button" className="btn btn--small" onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
