import { useEffect, useState } from "react";
import type { RepairState } from "../repair/useRepair";
import type { SourceDocument } from "../../types/document";
import type { OutputStyle, Quad } from "../../types/repair";
import { AssessmentPanel } from "../assess/AssessmentPanel";
import type { AssessmentState } from "../assess/useAssessment";
import { BusyNotice } from "../../components/BusyNotice";
import { CompareSlider } from "../../components/CompareSlider";
import { RemoveButton } from "../../components/RemoveButton";
import { baseName } from "../../lib/browser/download";
import { fullFrameQuad } from "../../lib/image-processing/geometry";
import { bentPage, DEWARP_SKIP_REASONS, lowCoverage, weakEdges } from "../repair/review";
import { CornerEditor, defaultCorners } from "./CornerEditor";

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
  onApplyCorners: (corners: Quad) => void;
  onRemove: () => void;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function PreviewPanel({ doc, repair, assessment, style, onStyleChange, onRepair, onApplyCorners, onRemove }: Props) {
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
      <header className="preview__head">
        <div>
          <h2 className="preview__name">{doc.name}</h2>
          <p className="muted">
            Original · {doc.width}×{doc.height}px · {doc.format.toUpperCase()} · {formatBytes(doc.size)}
          </p>
        </div>
        <div className="preview__actions">
          {/* One primary action per stage: Repair first, then Download once a result exists. */}
          {repair.status === "done" && (
            <a className="btn btn--primary" href={repair.result.url} download={`${baseName(doc.name)}-repaired.png`}>
              Download image
            </a>
          )}
          <button type="button" className={done ? "btn" : "btn btn--primary"} onClick={onRepair} disabled={running}>
            {done ? "Repair again" : "Repair"}
          </button>
          <button type="button" className="btn" onClick={adjustCorners} disabled={running || editing}>
            Adjust corners
          </button>
          <div className="preview__actions-end">
            <RemoveButton name={doc.name} onRemove={onRemove} />
          </div>
        </div>
      </header>

      <AssessmentPanel
        state={assessment}
        onAdjustCorners={adjustCorners}
        onCleanWholeImage={cleanWholeImage}
        disabled={running || editing}
      />

      <fieldset className="styles">
        <legend>Output style</legend>
        {STYLE_OPTIONS.map((o) => (
          <label key={o.value} className="styles__option">
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
        {style === "blackwhite" && (
          <p className="muted styles__hint">
            Black &amp; white can drop faint text or light pencil. Check the result against the original.
          </p>
        )}
      </fieldset>

      {running && <BusyNotice task={repair.previous ? "Applying style…" : "Repairing the page…"} />}
      {repair.status === "error" && (
        <p role="alert" className="notice notice--error">
          Repair failed: {repair.message}
        </p>
      )}
      {done && (
        <>
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
          <p className="muted" role="status">
            Repaired · {done.width}×{done.height}px ·{" "}
            {STYLE_OPTIONS.find((o) => o.value === done.style)?.label} ·{" "}
            {done.source === "manual" ? "manual corners" : `page detected by ${done.source}`}
            {done.areaFraction !== undefined && ` (${Math.round(done.areaFraction * 100)}% of the photo)`}
            {done.deskew.applied !== 0 && ` · text levelled by ${Math.abs(done.deskew.applied).toFixed(1)}°`}
            {done.dewarp.applied && " · curved lines flattened"}
          </p>
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
    </section>
  );
}
