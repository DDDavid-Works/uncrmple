import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

const LINES = [
  "The draft looked loud, but the message was quiet.",
  "Removed repeated points and the core idea surfaced.",
  "Now each line supports the same direction.",
  "Less noise. Better signal.",
];

/**
 * Facets that shade the "before" page so it looks crumpled and smoothed out again, in a 100 x 100 box
 * stretched over the page. Positive shades lighten (white), negative ones darken (black).
 */
const CRUMPLE_FACETS: ReadonlyArray<readonly [points: string, shade: number]> = [
  ["0,0 28,0 22,26", 0.1], ["0,0 22,26 0,30", -0.08], ["28,0 55,0 47,34", -0.12], ["28,0 47,34 22,26", 0.06],
  ["55,0 80,0 72,22", 0.12], ["55,0 72,22 47,34", -0.06], ["80,0 100,0 100,32", -0.1], ["80,0 100,32 72,22", 0.08],
  ["0,30 22,26 30,58", 0.08], ["0,30 30,58 0,62", -0.1], ["22,26 47,34 58,66", -0.14], ["22,26 58,66 30,58", 0.1],
  ["47,34 72,22 80,52", 0.12], ["47,34 80,52 58,66", -0.08], ["72,22 100,32 100,64", -0.06], ["72,22 100,64 80,52", 0.1],
  ["0,62 30,58 25,100", 0.06], ["0,62 25,100 0,100", -0.1], ["30,58 58,66 52,100", -0.12], ["30,58 52,100 25,100", 0.08],
  ["58,66 80,52 78,100", 0.1], ["58,66 78,100 52,100", -0.06], ["80,52 100,64 100,100", -0.1], ["80,52 100,100 78,100", 0.06],
];
/** Sharpest folds, drawn as thin highlights along facet edges. */
const CRUMPLE_CREASES = "M0 30L22 26L47 34L72 22L100 32M22 26L30 58L58 66L80 52L100 64M47 34L58 66L52 100M72 22L80 52";

function Crumple() {
  return (
    <svg className="sample-crumple" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {CRUMPLE_FACETS.map(([points, shade]) => (
        <polygon key={points} points={points} fill={shade > 0 ? "#ffffff" : "#000000"} fillOpacity={Math.abs(shade)} />
      ))}
      <path d={CRUMPLE_CREASES} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Illustrative note page (not a real repair result). */
function SamplePage({ crumpled = false }: { crumpled?: boolean }) {
  return (
    <div className="sample-page">
      {crumpled && <Crumple />}
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

/** A made-up shop and basket: no real business or personal details. */
const RECEIPT_ITEMS: ReadonlyArray<readonly [item: string, price: string]> = [
  ["OAT MILK 1L", "3.20"],
  ["SOURDOUGH LOAF", "4.50"],
  ["EGGS X12", "5.10"],
  ["APPLES 1KG", "2.80"],
  ["COFFEE BEANS", "9.90"],
];

/** Illustrative till receipt (not a real repair result). */
function SampleReceipt({ crumpled = false }: { crumpled?: boolean }) {
  return (
    <div className="sample-page sample-receipt">
      {crumpled && <Crumple />}
      <p className="receipt-shop">CORNER MARKET</p>
      <p className="receipt-center">12 MAPLE ROAD</p>
      <p className="receipt-center">08/11/2026 14:32</p>
      <hr className="receipt-rule" />
      {RECEIPT_ITEMS.map(([item, price]) => (
        <p key={item} className="receipt-row">
          <span>{item}</span>
          <span>{price}</span>
        </p>
      ))}
      <hr className="receipt-rule" />
      <p className="receipt-row receipt-total">
        <span>TOTAL</span>
        <span>25.50</span>
      </p>
      <p className="receipt-row">
        <span>CARD</span>
        <span>25.50</span>
      </p>
      <hr className="receipt-rule" />
      <p className="receipt-center">THANK YOU</p>
    </div>
  );
}

/** The demo tabs, each an illustrated document shown crumpled ("before") and repaired ("after"). */
const SAMPLES = [
  { id: "note", label: "Note", Page: SamplePage },
  { id: "receipt", label: "Receipt", Page: SampleReceipt },
] as const;

const REPAIR_MS = 900;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Where the divider opens and returns to: mostly the original, with a sliver of the repair showing. */
const START_SPLIT = 75;

/**
 * Before/after comparison of an illustrated document, with a tab per sample. The Repair button plays the
 * repair like the app does; the divider can also be dragged (or moved with the keyboard) to compare any part.
 */
export function BeforeAfter() {
  const baseId = useId();
  const [sampleIndex, setSampleIndex] = useState(0);
  const sample = SAMPLES[sampleIndex]!;
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  // Percentage of the stage still showing the "before" photo: 100 is untouched, 0 fully repaired.
  const [split, setSplit] = useState(START_SPLIT);
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

  /** Opens another sample, back at the starting split so it can be repaired again. */
  function selectSample(index: number) {
    stopAnimation();
    setSampleIndex(index);
    setSplit(START_SPLIT);
    tabs.current[index]?.focus();
  }

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;
  const { Page } = sample;

  return (
    <figure className="compare">
      <div className="compare-bar">
        <div
          className="compare-tabs"
          role="tablist"
          aria-label="Sample document"
          onKeyDown={(e) => {
            const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (step === 0) return;
            e.preventDefault();
            selectSample((sampleIndex + step + SAMPLES.length) % SAMPLES.length);
          }}
        >
          {SAMPLES.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={tabId(s.id)}
              type="button"
              role="tab"
              className="compare-tab"
              aria-selected={i === sampleIndex}
              aria-controls={panelId}
              tabIndex={i === sampleIndex ? 0 : -1}
              onClick={() => selectSample(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span aria-hidden="true">
          {String(sampleIndex + 1).padStart(2, "0")} / {String(SAMPLES.length).padStart(2, "0")}
        </span>
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(sample.id)}
        className={`compare-stage compare-${sample.id}`}
        style={{ "--split": `${split}%` } as CSSProperties}
      >
        {/* Each tag lives in its layer, so it is clipped away with that layer. */}
        <div className="compare-layer compare-before" aria-hidden="true">
          <Page crumpled />
          <span className="tag tag-before">BEFORE</span>
        </div>
        <div className="compare-layer compare-after" aria-hidden="true">
          <Page />
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
            animateTo(repaired ? START_SPLIT : 0);
          }}
        >
          {repaired ? "Show original" : "Repair"}
        </button>
      </div>
      <figcaption className="visually-hidden">
        Illustration: a tilted, shadowed photo of a {sample.label.toLowerCase()} beside the same {sample.label.toLowerCase()}{" "}
        straightened and cleaned.
      </figcaption>
    </figure>
  );
}
