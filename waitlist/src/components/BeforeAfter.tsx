import { useState, type CSSProperties } from "react";

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

/** Before/after comparison of an illustrated page with a draggable (and keyboard-operable) divider. */
export function BeforeAfter() {
  const [split, setSplit] = useState(94);

  return (
    <figure className="compare">
      <div className="compare-bar" aria-hidden="true">
        <span>THE SAME PAGE. A FRESH START.</span>
        <span>01 / 01</span>
      </div>
      <div className="compare-stage" style={{ "--split": `${split}%` } as CSSProperties}>
        <div className="compare-layer compare-before" aria-hidden="true">
          <SamplePage />
        </div>
        <div className="compare-layer compare-after" aria-hidden="true">
          <SamplePage />
        </div>
        <span className="tag tag-before" aria-hidden="true">BEFORE</span>
        <span className="tag tag-after" aria-hidden="true">AFTER</span>
        <span className="compare-handle" aria-hidden="true">
          ‹›
        </span>
        <span className="compare-hint" aria-hidden="true">
          Drag to compare
        </span>
        <input
          className="compare-range"
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          aria-label="Compare the photo before and after repair"
        />
      </div>
      <figcaption className="visually-hidden">
        Illustration: a tilted, shadowed photo of a page beside the same page straightened and cleaned.
      </figcaption>
    </figure>
  );
}
