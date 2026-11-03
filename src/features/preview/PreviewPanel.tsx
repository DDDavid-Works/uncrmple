import { useEffect, useState, type ReactNode } from "react";
import type { RepairState } from "../repair/useRepair";
import type { SourceDocument } from "../../types/document";
import type { OutputStyle, Quad, QuarterTurn } from "../../types/repair";
import { AssessmentPanel } from "../assess/AssessmentPanel";
import type { AssessmentState } from "../assess/useAssessment";
import { BusyNotice } from "../../components/BusyNotice";
import { CompareSlider } from "../../components/CompareSlider";
import { RemoveButton } from "../../components/RemoveButton";
import { baseName } from "../../lib/browser/download";
import { fullFrameQuad } from "../../lib/image-processing/geometry";
import { bentPage, DEWARP_SKIP_REASONS, lowCoverage, weakEdges } from "../repair/review";
import { CornerEditor, defaultCorners } from "./CornerEditor";
import { InspectorSection } from "./Inspector";
import { ViewerStage, type PageNav } from "./ViewerStage";

const STYLE_OPTIONS: { value: OutputStyle; label: string }[] = [
  { value: "color", label: "Color" },
  { value: "grayscale", label: "Grayscale" },
  { value: "blackwhite", label: "Black & white" },
];

interface Props {
  doc: SourceDocument;
  repair: RepairState;
  assessment: AssessmentState;
  style: OutputStyle;
  onStyleChange: (style: OutputStyle) => void;
  onRepair: () => void;
  /** Turn the repaired page a further 90° clockwise (90) or anticlockwise (-90). */
  onRotate: (by: 90 | -90) => void;
  onApplyCorners: (corners: Quad) => void;
  onRemove: () => void;
  /** Export of every finished page, shown under this page's own download; null until one is done. */
  exportAll: ReactNode;
  /** Previous/next page arrows; null with a single page. */
  nav: PageNav | null;
}

/** How a turned page reads in the status line. */
export const TURN_TEXT: Record<QuarterTurn, string> = { 0: "", 90: "right", 180: "upside down", 270: "left" };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function PreviewPanel({ doc, repair, assessment, style, onStyleChange, onRepair, onRotate, onApplyCorners, onRemove, exportAll, nav }: Props) {
  const [view, setView] = useState<"original" | "repaired" | "cleanup" | "both">("original");
  const [editing, setEditing] = useState(false);
  // While a new style is being applied, keep showing the last result.
  const done =
    repair.status === "done" ? repair.result : repair.status === "running" ? (repair.previous ?? null) : null;

  useEffect(() => {
    setView(done ? "repaired" : "original");
  }, [done]);

  const showRepaired = view === "repaired" && done;
  const running = repair.status === "running";
  const cleanWholeImage = () => onApplyCorners(fullFrameQuad(doc.width, doc.height));
  const adjustCorners = () => setEditing(true);

  return (
    <section className="preview" aria-label="Photo preview">
      <div className="viewer">
        <div className="viewer__bar">
          {done ? (
            <div className="toggle" role="group" aria-label="Choose version">
              <button type="button" className="btn btn--small" aria-pressed={view === "original"} onClick={() => setView("original")}>
                Original
              </button>
              <button type="button" className="btn btn--small" aria-pressed={view === "repaired"} onClick={() => setView("repaired")}>
                Repaired
              </button>
              <button type="button" className="btn btn--small" aria-pressed={view === "cleanup"} onClick={() => setView("cleanup")}>
                Compare cleanup
              </button>
              <button type="button" className="btn btn--small" aria-pressed={view === "both"} onClick={() => setView("both")}>
                Side by side
              </button>
            </div>
          ) : (
            <span className="viewer__label">Original</span>
          )}
          <div className="viewer__where">
            {nav && <span className="viewer__position">Page {nav.index + 1} of {nav.total}</span>}
            <h2 className="viewer__name">{doc.name}</h2>
          </div>
        </div>

        {running && <BusyNotice task={repair.previous ? "Applying style…" : "Repairing the page…"} />}
        {repair.status === "error" && (
          <p role="alert" className="notice notice--error">
            Repair failed: {repair.message}
          </p>
        )}
        {done && (
          <>
            {lowCoverage(done) && (
              <div role="alert" className="notice notice--warn">
                <p>
                  The detected page covers only a small part of the photo. If it is only part of the page, such as a
                  table or box printed on it, adjust the corners to the page edges.
                </p>
                <div className="notice__actions">
                  <button type="button" className="btn btn--small" onClick={adjustCorners} disabled={running || editing}>
                    Adjust corners
                  </button>
                </div>
              </div>
            )}
            {weakEdges(done) && (
              <div role="alert" className="notice notice--warn">
                <p>
                  The page edges were faint, curved, or partly outside the photo, so the detected outline may be
                  slightly off. Compare the result with the original, especially near the edges. If the outline is
                  wrong, adjust the corners; if the page fills the photo, clean up the whole image instead.
                </p>
                <div className="notice__actions">
                  <button type="button" className="btn btn--small" onClick={adjustCorners} disabled={running || editing}>
                    Adjust corners
                  </button>
                  <button type="button" className="btn btn--small" onClick={cleanWholeImage} disabled={running || editing}>
                    Clean up whole image
                  </button>
                </div>
              </div>
            )}
            {bentPage(done) && (
              <p role="alert" className="notice notice--warn">
                The lines of text bend across the page, so the paper is probably curved or creased.{" "}
                {done.deskew.applied !== 0 ? "The overall tilt was levelled, but the curve could not be flattened: " : "The curve could not be flattened: "}
                {DEWARP_SKIP_REASONS[done.dewarp.skipped ?? "not-improved"]} Some lines may still slope. Flattening the page and
                retaking the photo gives the best result.
              </p>
            )}
          </>
        )}

        <ViewerStage nav={nav}>
          {editing ? (
            <CornerEditor
              imageUrl={doc.originalUrl}
              imageAlt={`Original photo: ${doc.name}`}
              width={doc.width}
              height={doc.height}
              initial={done?.corners ?? defaultCorners(doc.width, doc.height)}
              onApply={(corners: Quad) => {
                setEditing(false);
                onApplyCorners(corners);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : view === "cleanup" && done ? (
            <>
              <p className="muted wipe__hint">
                Drag across the page to compare it straightened but uncleaned (left) with the cleaned result (right).
                Check that no faint text, stamps or pencil marks were lost.
              </p>
              <CompareSlider
                beforeUrl={done.straightenedUrl}
                afterUrl={done.url}
                beforeLabel="Straightened"
                afterLabel="Cleaned"
                beforeAlt={`Straightened page before cleanup: ${doc.name}`}
                afterAlt={`Repaired document: ${doc.name}`}
              />
            </>
          ) : view === "both" && done ? (
            <div className="compare">
              <figure>
                <img src={doc.originalUrl} alt={`Original photo: ${doc.name}`} />
                <figcaption>Original</figcaption>
              </figure>
              <figure>
                <img src={done.url} alt={`Repaired document: ${doc.name}`} />
                <figcaption>Repaired</figcaption>
              </figure>
            </div>
          ) : (
            <div className="preview__frame">
              {showRepaired ? (
                <img src={done.url} alt={`Repaired document: ${doc.name}`} />
              ) : (
                <img src={doc.originalUrl} alt={`Original photo: ${doc.name}`} />
              )}
            </div>
          )}
        </ViewerStage>

        <div className="viewer__foot">
          <div className="viewer__meta">
            <p className="muted">
              Original · {doc.width}×{doc.height}px · {doc.format.toUpperCase()} · {formatBytes(doc.size)}
            </p>
            {done && (
              <p className="muted" role="status">
                Repaired · {done.width}×{done.height}px ·{" "}
                {STYLE_OPTIONS.find((o) => o.value === done.style)?.label} ·{" "}
                {done.source === "manual" ? "manual corners" : `page detected by ${done.source}`}
                {done.areaFraction !== undefined && ` (${Math.round(done.areaFraction * 100)}% of the photo)`}
                {done.deskew.applied !== 0 && ` · text levelled by ${Math.abs(done.deskew.applied).toFixed(1)}°`}
                {done.dewarp.applied && " · curved lines flattened"}
                {done.rotation !== 0 && ` · turned ${TURN_TEXT[done.rotation]}`}
              </p>
            )}
          </div>
          <div className="viewer__tools">
            <button type="button" className="btn btn--small" onClick={adjustCorners} disabled={running || editing}>
              Adjust corners
            </button>
            {done && (
              <div className="viewer__rotate" role="group" aria-label="Rotate page">
                <button type="button" className="btn btn--small" onClick={() => onRotate(-90)} disabled={running || editing} aria-label="Rotate left (anticlockwise)">
                  <span aria-hidden="true">↺</span> Left
                </button>
                <button type="button" className="btn btn--small" onClick={() => onRotate(90)} disabled={running || editing} aria-label="Rotate right (clockwise)">
                  <span aria-hidden="true">↻</span> Right
                </button>
              </div>
            )}
            <div className="viewer__tools-end">
              <RemoveButton name={doc.name} onRemove={onRemove} />
            </div>
          </div>
          <p className="viewer__promise">Your original stays untouched. No text is generated or rewritten.</p>
        </div>
      </div>

      <div className="inspector">
        <InspectorSection index={1} title="Photo check">
          {assessment.status === "idle" ? (
            <p className="inspector__empty">The photo has not been checked yet.</p>
          ) : (
            <AssessmentPanel
              state={assessment}
              onAdjustCorners={adjustCorners}
              onCleanWholeImage={cleanWholeImage}
              disabled={running || editing}
            />
          )}
        </InspectorSection>

        <InspectorSection index={2} title="Repair settings">
          <fieldset className="styles">
            <legend>Output style</legend>
            <div className="segmented">
              {STYLE_OPTIONS.map((o) => (
                <label key={o.value} className="segmented__option">
                  <input
                    type="radio"
                    name={`style-${doc.id}`}
                    value={o.value}
                    checked={style === o.value}
                    onChange={() => onStyleChange(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {style === "blackwhite" && (
              <p className="muted styles__hint">
                Black &amp; white can drop faint text or light pencil. Check the result against the original.
              </p>
            )}
          </fieldset>
        </InspectorSection>

        {/* Floats at the bottom of the panel while a long photo check pushes it out of view, then
            settles here under the settings. */}
        <div className="inspector__dock">
          <button type="button" className={done ? "btn btn--block" : "btn btn--primary btn--block"} onClick={onRepair} disabled={running}>
            {done ? "Repair again" : "Repair"}
          </button>
        </div>

        <InspectorSection index={3} title="Export">
          {repair.status === "done" && (
            <a className="btn btn--primary btn--block" href={repair.result.url} download={`${baseName(doc.name)}-repaired.png`}>
              Download image
            </a>
          )}
          {exportAll ?? <p className="inspector__empty">Repair this page to download it as an image or PDF.</p>}
        </InspectorSection>
      </div>
    </section>
  );
}
