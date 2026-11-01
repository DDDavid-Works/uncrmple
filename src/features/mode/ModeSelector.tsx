export type ProcessingMode = "document" | "card";

const MODES: { value: ProcessingMode; label: string; hint: string }[] = [
  { value: "document", label: "Document Repair", hint: "Paper pages: straighten, even out lighting, clean up." },
  { value: "card", label: "ID & Card Crop", hint: "ID, membership or access cards: cut out and straighten the card." },
];

interface Props {
  mode: ProcessingMode;
  onChange: (mode: ProcessingMode) => void;
  /** Hold the current mode, e.g. while every page is being repaired. */
  disabled?: boolean;
}

/** Global switch between the two workflows. Photos stay loaded when it changes. */
export function ModeSelector({ mode, onChange, disabled = false }: Props) {
  const active = MODES.find((m) => m.value === mode)!;
  return (
    <fieldset className="modes" aria-describedby="mode-hint" disabled={disabled}>
      <legend className="visually-hidden">Processing mode</legend>
      <div className="modes__track">
        {MODES.map((m) => (
          <label key={m.value} className={`modes__option${mode === m.value ? " modes__option--on" : ""}`}>
            <input
              type="radio"
              name="processing-mode"
              value={m.value}
              checked={mode === m.value}
              onChange={() => onChange(m.value)}
            />
            {m.label}
          </label>
        ))}
      </div>
      <p id="mode-hint" className="modes__hint">
        {active.hint}
      </p>
    </fieldset>
  );
}
