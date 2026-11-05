import type { ReactNode } from "react";

export interface PageNav {
  /** Zero-based position of the shown page. */
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} />
    </svg>
  );
}

/**
 * The image area with previous/next arrows in their own columns either side, so they never cover
 * the page or the corner handles. Without `nav` (a single page) it is just the image area.
 */
export function ViewerStage({ nav, children }: { nav: PageNav | null; children: ReactNode }) {
  if (!nav) return <div className="stage-view">{children}</div>;
  const { index, total, onPrevious, onNext } = nav;
  return (
    <div className="stage-view stage-view--nav">
      <button
        type="button"
        className="stage-view__arrow"
        onClick={onPrevious}
        disabled={index === 0}
        aria-label="Previous photo"
      >
        <Arrow direction="left" />
      </button>
      <div className="stage-view__content">{children}</div>
      <button
        type="button"
        className="stage-view__arrow"
        onClick={onNext}
        disabled={index === total - 1}
        aria-label="Next photo"
      >
        <Arrow direction="right" />
      </button>
    </div>
  );
}
