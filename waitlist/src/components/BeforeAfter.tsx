import { useEffect, useRef, useState, type CSSProperties } from "react";

const LINES = [
  "The draft looked loud, but the message was quiet.",
  "Removed repeated points and the core idea surfaced.",
  "Now each line supports the same direction.",
  "Less noise. Better signal.",
];

/** Illustrative sample page (not a real repair result). */
function SamplePage() {
  return (
    <div className="sample-page">
      <div className="sample-head">
        <span className="sample-title">FIELD NOTES</span>
        <span className="sample-project">PROJECT / 001</span>
      </div>
      <p className="sample-sub">A little more clarity.</p>
      <p className="sample-intro">{LINES.join(" ")}</p>
      <div className="sample-cols">
        {[0, 1].map((col) => (
          <div key={col}>
            {LINES.map((line) => (
              <p key={line} className="sample-line">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const REPAIR_MS = 900;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Before/after comparison of an illustrated page. The Repair button plays the repair like the app does;
 * the divider can also be dragged (or moved with the keyboard) to compare any part of the page.
 */
export function BeforeAfter() {
  // Percentage of the stage still showing the "before" photo: 100 is untouched, 0 fully repaired.
  const [split, setSplit] = useState(100);
  // The "try it" callout goes away once the visitor has pressed Repair or moved the divider.
  const [tried, setTried] = useState(false);
  const frame = useRef<number | null>(null);
  const repaired = split < 50;

  function stopAnimation() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }
  useEffect(() => stopAnimation, []);

  function animateTo(target: number) {
    stopAnimation();
    if (prefersReducedMotion()) {
      setSplit(target);
      return;
    }
    const from = split;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / REPAIR_MS, 1);
      setSplit(from + (target - from) * easeInOutCubic(t));
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  }

  return (
    <figure className="compare">
      <div className="compare-bar" aria-hidden="true">
        <span>THE SAME DOCUMENT. A FRESH START.</span>
        <span>01 / 01</span>
      </div>
      <div className="compare-stage" style={{ "--split": `${split}%` } as CSSProperties}>
        {/* Each tag lives in its layer, so it is clipped away with that layer. */}
        <div className="compare-layer compare-before" aria-hidden="true">
          <SamplePage />
          <span className="tag tag-before">BEFORE</span>
        </div>
        <div className="compare-layer compare-after" aria-hidden="true">
          <SamplePage />
          <span className="tag tag-after">AFTER</span>
        </div>
        <span className="compare-handle" aria-hidden="true">
          ‹›
        </span>
        <input
          className="compare-range"
          type="range"
          min={0}
          max={100}
          value={Math.round(split)}
          onChange={(e) => {
            stopAnimation();
            setSplit(Number(e.target.value));
            setTried(true);
          }}
          aria-label="Compare the document before and after repair"
        />
      </div>
      <div className="compare-actions">
        {!tried && (
          <span className="try" aria-hidden="true">
            <span className="try-label">Try it!</span>
            <svg className="try-arrow" viewBox="0 0 48 28" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6C18 2 32 6 42 20M32 19l10 1-2-10" />
            </svg>
          </span>
        )}
        <button
          type="button"
          className={repaired ? "btn btn-quiet" : "btn"}
          onClick={() => {
            setTried(true);
            animateTo(repaired ? 100 : 0);
          }}
        >
          {repaired ? "Show original" : "Repair"}
        </button>
      </div>
      <figcaption className="visually-hidden">
        Illustration: a tilted, shadowed document photo beside the same document straightened and cleaned.
      </figcaption>
    </figure>
  );
}
