import { useEffect, useState } from "react";
import type { SourceDocument } from "./types/document";
import { CardPanel } from "./features/card/CardPanel";
import { defaultCardCorners, useCardCrop } from "./features/card/useCardCrop";
import { ModeSelector } from "./features/mode/ModeSelector";
import type { ProcessingMode } from "./features/mode/ModeSelector";
import { useAssessment } from "./features/assess/useAssessment";
import { ExportBar } from "./features/export/ExportBar";
import { PreviewPanel } from "./features/preview/PreviewPanel";
import { useRepair } from "./features/repair/useRepair";
import { UploadZone } from "./features/upload/UploadZone";
import { useDocuments } from "./features/upload/useDocuments";

const NO_DOCUMENTS: SourceDocument[] = [];

export function App() {
  const { documents, rejected, pending, addFiles, remove, move, dismissRejected } = useDocuments();
  const { stateOf, styleOf, run, setStyle, applyCorners } = useRepair(documents);
  const cards = useCardCrop(documents);
  const [mode, setMode] = useState<ProcessingMode>("document");
  // Page assessment is for the document workflow only; skip the work in card mode.
  const assessmentOf = useAssessment(mode === "document" ? documents : NO_DOCUMENTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep a valid selection: first doc when none is chosen or the chosen one was removed.
  useEffect(() => {
    if (documents.length === 0) {
      if (selectedId !== null) setSelectedId(null);
    } else if (!documents.some((d) => d.id === selectedId)) {
      setSelectedId(documents[0]!.id);
    }
  }, [documents, selectedId]);

  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const exportPages = documents.flatMap((d) => {
    if (mode === "card") {
      const state = cards.stateOf(d.id);
      return state.status === "done" ? [{ id: d.id, url: state.view.url }] : [];
    }
    const state = stateOf(d.id);
    return state.status === "done" ? [{ id: d.id, url: state.result.url }] : [];
  });

  return (
    <div className="app">
      <header className="app__header">
        <h1>Document Photo Repair</h1>
        <p className="muted">Fix the photo. Keep the document.</p>
      </header>

      <main className="app__main">
        <ModeSelector mode={mode} onChange={setMode} />

        <UploadZone compact={documents.length > 0} busy={pending > 0} onFiles={addFiles} />

        {rejected.length > 0 && (
          <ul className="errors" aria-label="Files that could not be added">
            {rejected.map((r) => (
              <li key={r.id} role="alert">
                <span>
                  <strong>{r.name}</strong>: {r.reason}
                </span>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => dismissRejected(r.id)}
                  aria-label={`Dismiss message for ${r.name}`}
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}

        {documents.length > 0 && (
          <div className="workspace">
            <ul className="pages" aria-label="Uploaded pages">
              {documents.map((d, i) => (
                <li key={d.id} className="pages__entry">
                  <button
                    type="button"
                    className="pages__item"
                    aria-current={d.id === selectedId ? "true" : undefined}
                    onClick={() => setSelectedId(d.id)}
                  >
                    <img src={d.originalUrl} alt="" />
                    <span className="pages__label">
                      {i + 1}. {d.name}
                    </span>
                  </button>
                  {documents.length > 1 && (
                    <div className="pages__move">
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => move(d.id, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${d.name} earlier`}
                      >
                        ↑ Earlier
                      </button>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => move(d.id, 1)}
                        disabled={i === documents.length - 1}
                        aria-label={`Move ${d.name} later`}
                      >
                        ↓ Later
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {selected && mode === "card" && (
              <CardPanel
                key={selected.id}
                doc={selected}
                state={cards.stateOf(selected.id)}
                enhance={cards.enhanceOf(selected.id)}
                onEnhance={(o) => void cards.setEnhance(selected, o)}
                onDetect={() => void cards.detect(selected)}
                onCrop={(c, d) => void cards.crop(selected, c, d)}
                onAdjust={() => cards.adjust(selected, defaultCardCorners(selected.width, selected.height))}
                onCancelReview={() => cards.cancelReview(selected.id)}
                onReset={() => cards.reset(selected.id)}
                onRemove={() => remove(selected.id)}
              />
            )}
            {selected && mode === "document" && (
              <PreviewPanel
                key={selected.id}
                doc={selected}
                repair={stateOf(selected.id)}
                assessment={assessmentOf(selected.id)}
                style={styleOf(selected.id)}
                onStyleChange={(s) => setStyle(selected, s)}
                onRepair={() => void run(selected)}
                onApplyCorners={(c) => void applyCorners(selected, c)}
                onRemove={() => remove(selected.id)}
              />
            )}
          </div>
        )}

        {exportPages.length > 0 && <ExportBar
            pages={exportPages}
            total={documents.length}
            doneWord={mode === "card" ? "cropped" : "repaired"}
            filename={mode === "card" ? "cards.pdf" : "repaired-document.pdf"}
          />}
      </main>
    </div>
  );
}
