export type ProcessingMode = "document" | "card";

const MODES: { value: ProcessingMode; label: string; hint: string }[] = [
  { value: "document", label: "Document Repair", hint: "Paper pages: straighten, even out lighting, clean up." },
  { value: "card", label: "ID & Card Crop", hint: "ID, membership or access cards: cut out and straighten the card." },
];

interface Props {
  mode: ProcessingMode;
  onChange: (mode: ProcessingMode) => void;
}

/** Global switch between the two workflows. Photos stay loaded when it changes. */
export function ModeSelector({ mode, onChange }: Props) {
  return (
    <fieldset className="modes">
      <legend className="visually-hidden">Processing mode</legend>
      {MODES.map((m) => (
        <label key={m.value} className={`modes__option${mode === m.value ? " modes__option--on" : ""}`}>
          <input
            type="radio"
            name="processing-mode"
            value={m.value}
            checked={mode === m.value}
            onChange={() => onChange(m.value)}
          />
          <span className="modes__label">{m.label}</span>
          <span className="modes__hint">{m.hint}</span>
        </label>
      ))}
    </fieldset>
  );
}
