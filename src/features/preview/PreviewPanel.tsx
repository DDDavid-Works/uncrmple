import { useEffect, useState } from "react";
import type { RepairState } from "../repair/useRepair";
import type { SourceDocument } from "../../types/document";
import type { OutputStyle, Quad } from "../../types/repair";
import { AssessmentPanel } from "../assess/AssessmentPanel";
import type { AssessmentState } from "../assess/useAssessment";
import { baseName } from "../../lib/browser/download";
import { fullFrameQuad } from "../../lib/image-processing/geometry";
import { CornerEditor, defaultCorners } from "./CornerEditor";

/** Below this edge support, the page outline is only loosely on real edges (curved, folded or faint edges). */
const LOW_EDGE_SUPPORT = 0.5;
/** Below this share of the photo, the detected "page" is suspicious. */
const LOW_COVERAGE = 0.3;

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
  const [view, setView] = useState<"original" | "repaired" | "both">("original");
  const [editing, setEditing] = useState(false);
  // While a new style is being applied, keep showing the last result.
  const done =
    repair.status === "done" ? repair.result : repair.status === "running" ? (repair.previous ?? null) : null;

  useEffect(() => {
    setView(done ? "repaired" : "original");
  }, [done]);

  const showRepaired = view === "repaired" && done;
  const running = repair.status === "running";

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
          <button type="button" className="btn btn--primary" onClick={onRepair} disabled={running}>
            {done ? "Repair again" : "Repair"}
          </button>
          {repair.status === "done" && (
            <a className="btn" href={repair.result.url} download={`${baseName(doc.name)}-repaired.png`}>
              Download image
            </a>
          )}
          <button type="button" className="btn" onClick={() => setEditing(true)} disabled={running || editing}>
            Adjust corners
          </button>
          <button type="button" className="btn" onClick={onRemove}>
            Remove
          </button>
        </div>
      </header>

      <AssessmentPanel
        state={assessment}
        onAdjustCorners={() => setEditing(true)}
        onCleanWholeImage={() => onApplyCorners(fullFrameQuad(doc.width, doc.height))}
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

      {running && (
        <p role="status" className="notice">
          {repair.previous
            ? "Applying style…"
            : "Repairing… The first repair loads the image engine (about 4 MB), which can take a few seconds."}
        </p>
      )}
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
            <button type="button" className="btn btn--small" aria-pressed={view === "both"} onClick={() => setView("both")}>
              Side by side
            </button>
          </div>
          <p className="muted" role="status">
            Repaired · {done.width}×{done.height}px ·{" "}
            {STYLE_OPTIONS.find((o) => o.value === done.style)?.label} ·{" "}
            {done.source === "manual" ? "manual corners" : `page detected by ${done.source}`}
            {done.areaFraction !== undefined && ` (${Math.round(done.areaFraction * 100)}% of the photo)`}
          </p>
          {done.areaFraction !== undefined && done.areaFraction < LOW_COVERAGE && (
            <p role="alert" className="notice notice--warn">
              The detected page covers only a small part of the photo. Check the result carefully.
            </p>
          )}
          {done.edgeSupport !== undefined && done.edgeSupport < LOW_EDGE_SUPPORT && (
            <p role="alert" className="notice notice--warn">
              The page edges were faint, curved, or partly outside the photo, so the detected outline may be
              slightly off. Compare the result with the original, especially near the edges.
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
