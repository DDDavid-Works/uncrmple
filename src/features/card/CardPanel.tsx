import { useState, type ReactNode } from "react";
import { BusyNotice } from "../../components/BusyNotice";
import { CompareSlider } from "../../components/CompareSlider";
import { RemoveButton } from "../../components/RemoveButton";
import { baseName } from "../../lib/browser/download";
import type { SourceDocument } from "../../types/document";
import type { CardDetection, CardEnhanceOptions, CardQualityIssue, CardWarning, Quad } from "../../types/repair";
import { CornerEditor } from "../preview/CornerEditor";
import { InspectorSection } from "../preview/Inspector";
import { ViewerStage, type PageNav } from "../preview/ViewerStage";
import { formatBytes } from "../preview/PreviewPanel";
import type { CardState, CardView } from "./useCardCrop";

const WARNING_TEXT: Record<CardWarning, string> = {
  "edge-unclear":
    "One or more card edges are hard to see (covered by a finger, faint, or washed out by glare). Check that each corner sits on the real card edge.",
  "card-cut-off": "The card touches or leaves the edge of the photo, so part of it may be missing.",
  "strong-perspective":
    "The card was photographed at a steep angle, so its proportions are less certain. Compare the result with the original.",
  "low-resolution": "Image quality may limit readability: the card covers few pixels in this photo.",
};

const QUALITY_TEXT: Record<CardQualityIssue, string> = {
  glare:
    "Glare or a blown-out highlight covers part of the card. Enhancement cannot recover text hidden by glare; retake the photo from an angle that avoids the reflection if details are missing.",
  blur:
    "The card looks blurry. Sharpening only increases edge contrast; it cannot restore detail that was never captured, so small text may stay unreadable.",
};

const ENHANCE_OPTIONS: { key: keyof CardEnhanceOptions; label: string; hint: string }[] = [
  { key: "evenLighting", label: "Even out lighting", hint: "Gently flattens a light-to-dark gradient." },
  { key: "autoContrast", label: "Brightness & contrast", hint: "Moderate stretch; colours keep their hue." },
  { key: "denoise", label: "Reduce noise", hint: "Mild; fine print is preserved." },
  { key: "sharpen", label: "Sharpen slightly", hint: "Light; does not fix a blurry photo." },
  { key: "grayscale", label: "Grayscale", hint: "Black-and-white output (colour is the default)." },
];

interface Props {
  doc: SourceDocument;
  state: CardState;
  enhance: CardEnhanceOptions;
  onEnhance: (options: CardEnhanceOptions) => void;
  onDetect: () => void;
  onCrop: (corners: Quad, detection: CardDetection | null) => void;
  onAdjust: () => void;
  onCancelReview: () => void;
  onReset: () => void;
  onRemove: () => void;
  /** Export of every cropped card, shown under this card's own download; null until one is done. */
  exportAll: ReactNode;
  /** Previous/next page arrows; null with a single photo. */
  nav: PageNav | null;
}

/** Heuristic, not a calibrated probability: shown with that caveat. */
const scoreText = (d: CardDetection) => `Detection score ${Math.round(d.confidence * 100)}% (a rough heuristic, not a probability)`;

function Warnings({ warnings }: { warnings: CardWarning[] }) {
  return (
    <>
      {warnings.map((w) => (
        <p key={w} role="alert" className="notice notice--warn">
          {WARNING_TEXT[w]}
        </p>
      ))}
    </>
  );
}

export function CardPanel({ doc, state, enhance, onEnhance, onDetect, onCrop, onAdjust, onCancelReview, onReset, onRemove, exportAll, nav }: Props) {
  const [view, setView] = useState<"result" | "crop" | "touchups" | "original" | "both">("result");
  const [zoom, setZoom] = useState(false);
  const working = state.status === "working";
  const done: CardView | null = state.status === "done" ? state.view : null;
  const reviewing = state.status === "review";
  const enhanced = done !== null && done.url !== done.cropUrl;
  const views: { value: typeof view; label: string }[] = [
    { value: "original", label: "Original" },
    ...(enhanced ? [{ value: "crop" as const, label: "Crop only" }] : []),
    { value: "result", label: enhanced ? "Enhanced" : "Cropped" },
    ...(enhanced ? [{ value: "touchups" as const, label: "Compare touch-ups" }] : []),
    { value: "both", label: "Side by side" },
  ];
  // The crop-only and compare views disappear when enhancement is switched off.
  const shown = (view === "crop" || view === "touchups") && !enhanced ? "result" : view;
  const resultAlt = `${enhanced ? "Enhanced" : "Cropped"} card: ${doc.name}`;

  return (
    <section className="preview" aria-label="Card preview">
      <div className="viewer">
        <div className="viewer__bar">
          {done ? (
            <div className="toggle" role="group" aria-label="Choose version">
              {views.map((v) => (
                <button key={v.value} type="button" className="btn btn--small" aria-pressed={shown === v.value} onClick={() => setView(v.value)}>
                  {v.label}
                </button>
              ))}
              <label className="toggle__zoom">
                <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
                Actual size
              </label>
            </div>
          ) : (
            <span className="viewer__label">{reviewing ? "Set the corners" : "Original"}</span>
          )}
          <div className="viewer__where">
            {nav && <span className="viewer__position">Page {nav.index + 1} of {nav.total}</span>}
            <h2 className="viewer__name">{doc.name}</h2>
          </div>
        </div>

        {working && (
          <BusyNotice task={state.step === "detecting" ? "Looking for the card…" : "Cropping and straightening the card…"} />
        )}
        {state.status === "error" && (
          <p role="alert" className="notice notice--error">
            Card processing failed: {state.message} You can still place the corners manually.
          </p>
        )}
        {done?.enhancing && (
          <p role="status" className="notice">
            Applying touch-ups…
          </p>
        )}
        {done?.enhanceError && (
          <p role="alert" className="notice notice--error">
            Touch-ups could not be applied: {done.enhanceError} The plain crop is shown.
          </p>
        )}

        <ViewerStage nav={nav}>
          {state.status === "review" ? (
            <CornerEditor
              key={`${doc.id}-${state.corners.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`).join(";")}`}
              imageUrl={doc.originalUrl}
              imageAlt={`Original photo: ${doc.name}`}
              width={doc.width}
              height={doc.height}
              initial={state.corners}
              subject="card"
              onApply={(c) => onCrop(c, null)}
              onCancel={onCancelReview}
            />
          ) : done && shown === "touchups" ? (
            <>
              <p className="muted wipe__hint">
                Drag across the card to compare the plain crop (left) with the touched-up version (right).
              </p>
              <CompareSlider
                beforeUrl={done.cropUrl}
                afterUrl={done.url}
                beforeLabel="Crop only"
                afterLabel="Enhanced"
                beforeAlt={`Cropped card, no enhancement: ${doc.name}`}
                afterAlt={resultAlt}
              />
            </>
          ) : done && shown === "both" ? (
            <div className="compare">
              <figure>
                <img src={doc.originalUrl} alt={`Original photo: ${doc.name}`} />
                <figcaption>Original</figcaption>
              </figure>
              <figure>
                <img src={done.url} alt={resultAlt} />
                <figcaption>{enhanced ? "Enhanced" : "Cropped"}</figcaption>
              </figure>
            </div>
          ) : done ? (
            <div className={`preview__frame${zoom ? " preview__frame--zoom" : ""}`}>
              <img
                src={shown === "original" ? doc.originalUrl : shown === "crop" ? done.cropUrl : done.url}
                alt={shown === "original" ? `Original photo: ${doc.name}` : shown === "crop" ? `Cropped card, no enhancement: ${doc.name}` : resultAlt}
              />
            </div>
          ) : (
            <div className="preview__frame">
              <img src={doc.originalUrl} alt={`Original photo: ${doc.name}`} />
            </div>
          )}
        </ViewerStage>

        <div className="viewer__foot">
          <div className="viewer__meta">
            <p className="muted">
              Original · {doc.width}×{doc.height}px · {doc.format.toUpperCase()} · {formatBytes(doc.size)}
            </p>
            {done && (
              <p className="muted">
                {enhanced ? "Enhanced" : "Cropped"} · {done.width}×{done.height}px · proportions{" "}
                {(Math.max(done.width, done.height) / Math.min(done.width, done.height)).toFixed(2)}:1
              </p>
            )}
          </div>
          <div className="viewer__tools">
            {done && (
              <button type="button" className="btn btn--small" onClick={onAdjust} disabled={working}>
                Adjust corners
              </button>
            )}
            <div className="viewer__tools-end">
              {done && (
                <button type="button" className="btn btn--small btn--quiet" onClick={onReset} disabled={working}>
                  Reset
                </button>
              )}
              <RemoveButton name={doc.name} onRemove={onRemove} />
            </div>
          </div>
          <p className="viewer__promise">Your original stays untouched. Nothing is added or redrawn.</p>
        </div>
      </div>

      <div className="inspector">
        <InspectorSection index={1} title="Find the card">
          {state.status === "idle" && (
            <p className="inspector__empty">
              Choose “Find card” to detect the card automatically, or place its four corners yourself. The original photo is
              never changed.
            </p>
          )}
          {state.status === "review" &&
            (state.detection ? (
              <>
                <p role="status" className="notice">
                  <strong>Card detected — please verify the corners.</strong> {scoreText(state.detection)}. Move any handle
                  that is not on the real card edge, then crop.
                </p>
                <Warnings warnings={state.detection.warnings} />
              </>
            ) : (
              <p role="alert" className="notice notice--warn">
                <strong>{state.failure ? "Automatic detection failed — select the corners manually." : "Select the card corners."}</strong>{" "}
                {state.failure ?? "Drag the four handles onto the card’s corners."}
              </p>
            ))}
          {done && (
            <>
              <p role="status" className="notice">
                {done.detection ? (
                  <>
                    <strong>Card detected and cropped.</strong> {scoreText(done.detection)}.
                  </>
                ) : (
                  <strong>Cropped using the corners you set.</strong>
                )}{" "}
                Check the edges against the original. A clean crop does not make an ID image suitable for official verification.
              </p>
              {done.detection && <Warnings warnings={done.detection.warnings} />}
              {done.quality.map((q) => (
                <p key={q} role="alert" className="notice notice--warn">
                  {QUALITY_TEXT[q]}
                </p>
              ))}
            </>
          )}
          <div className="inspector__actions">
            {/* One primary action per stage: Find card first, then Download once a crop exists. */}
            <button type="button" className={done || reviewing ? "btn btn--block" : "btn btn--primary btn--block"} onClick={onDetect} disabled={working}>
              {done || reviewing ? "Detect card again" : "Find card"}
            </button>
            {!done && !reviewing && (
              <button type="button" className="btn btn--block" onClick={onAdjust} disabled={working}>
                Place corners manually
              </button>
            )}
          </div>
        </InspectorSection>

        <InspectorSection index={2} title="Touch-ups">
          {done ? (
            <fieldset className="styles" aria-label="Optional enhancement">
              <legend>Optional, off by default</legend>
              {ENHANCE_OPTIONS.map((o) => (
                <label key={o.key} className="styles__option" title={o.hint}>
                  <input
                    type="checkbox"
                    checked={enhance[o.key]}
                    disabled={done.enhancing}
                    onChange={(e) => onEnhance({ ...enhance, [o.key]: e.target.checked })}
                  />
                  {o.label}
                </label>
              ))}
              <p className="muted styles__hint">
                Touch-ups only adjust the pixels already in the photo. They never add or redraw content, and compare against
                the crop-only view before relying on them.
              </p>
            </fieldset>
          ) : (
            <p className="inspector__empty">Optional touch-ups appear once the card is cropped.</p>
          )}
        </InspectorSection>

        <InspectorSection index={3} title="Export">
          {done && (
            <a className="btn btn--primary btn--block" href={done.url} download={`${baseName(doc.name)}-card.png`}>
              Download image
            </a>
          )}
          {exportAll ?? <p className="inspector__empty">Crop the card to download it as an image or PDF.</p>}
        </InspectorSection>
      </div>
    </section>
  );
}
