import type { ReactNode } from "react";
import type { ProcessingMode } from "../mode/ModeSelector";

interface SectionProps {
  /** Position in the panel, shown as "01 /". */
  index: number;
  title: string;
  children: ReactNode;
}

/** One numbered step of the right-hand panel: check, settings, export. */
export function InspectorSection({ index, title, children }: SectionProps) {
  return (
    <div className="inspector__section">
      <h3 className="inspector__title">
        <span className="inspector__index">{String(index).padStart(2, "0")} /</span> {title}
      </h3>
      {children}
    </div>
  );
}

/** The right-hand panel before any photo is added: what each step will do, with no controls yet. */
export function EmptyInspector({ mode }: { mode: ProcessingMode }) {
  const card = mode === "card";
  return (
    <div className="inspector">
      <InspectorSection index={1} title={card ? "Find the card" : "Photo check"}>
        <p className="inspector__empty">
          {card
            ? "Add a photo to find the card's four corners."
            : "Add a photo to see how well it can be repaired: angle, lighting, sharpness, resolution, edges and text contrast."}
        </p>
      </InspectorSection>
      <InspectorSection index={2} title={card ? "Touch-ups" : "Repair settings"}>
        <p className="inspector__empty">
          {card ? "Optional touch-ups appear once the card is cropped." : "Choose color, grayscale or black and white, then repair."}
        </p>
      </InspectorSection>
      <InspectorSection index={3} title="Export">
        <p className="inspector__empty">Download images, a ZIP or one PDF in your page order.</p>
      </InspectorSection>
    </div>
  );
}
