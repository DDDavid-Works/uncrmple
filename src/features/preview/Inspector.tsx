import { useId, useState, type ReactNode } from "react";

interface SectionProps {
  /** Position in the panel, shown as "01 /". */
  index: number;
  title: string;
  children: ReactNode;
}

/**
 * Which steps the user has collapsed, by title. Kept for the session (not stored), so a step stays
 * collapsed when another page is selected and the panel is drawn again.
 */
const collapsed = new Set<string>();

/** One numbered step of the right-hand panel: check, settings, export. Collapsible; open by default. */
export function InspectorSection({ index, title, children }: SectionProps) {
  const [open, setOpen] = useState(() => !collapsed.has(title));
  const bodyId = useId();
  const toggle = () => {
    if (open) collapsed.add(title);
    else collapsed.delete(title);
    setOpen(!open);
  };
  return (
    <div className={`inspector__section${open ? "" : " inspector__section--closed"}`}>
      <h3 className="inspector__title">
        <button type="button" className="inspector__toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span>
            <span className="inspector__index">{String(index).padStart(2, "0")} /</span> {title}
          </span>
          <svg className="inspector__chevron" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      </h3>
      {/* Hidden rather than removed, so choices inside (such as the paper size) survive a collapse. */}
      <div id={bodyId} className="inspector__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** Forget collapsed steps; for tests. */
export function resetCollapsedSteps() {
  collapsed.clear();
}
