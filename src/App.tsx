import { useEffect, useState } from "react";
import type { SourceDocument } from "./types/document";
import { PRODUCT_NAME, TAGLINE, WORDMARK } from "./config";
import { AppFooter } from "./components/AppFooter";
import { Logo } from "./components/Logo";
import { StepIndicator } from "./components/StepIndicator";
import type { Step } from "./components/StepIndicator";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { CardPanel } from "./features/card/CardPanel";
import { defaultCardCorners, useCardCrop } from "./features/card/useCardCrop";
import { ModeSelector } from "./features/mode/ModeSelector";
import type { ProcessingMode } from "./features/mode/ModeSelector";
import { useAssessment } from "./features/assess/useAssessment";
import { ExportBar } from "./features/export/ExportBar";
import { PageList, cardStatus, repairStatus } from "./features/pages/PageList";
import { PreviewPanel } from "./features/preview/PreviewPanel";
import { RepairAllBar, RepairAllLock } from "./features/repair/RepairAllBar";
import { useRepair } from "./features/repair/useRepair";
import { UploadZone } from "./features/upload/UploadZone";
import { useDocuments } from "./features/upload/useDocuments";
import { baseName } from "./lib/browser/download";

const NO_DOCUMENTS: SourceDocument[] = [];

export function App() {
  const { documents, rejected, pending, addFiles, remove, move, dismissRejected } = useDocuments();
  const { stateOf, styleOf, run, setStyle, rotate, applyCorners, repairAll, stopAll, batch } = useRepair(documents);
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
      return state.status === "done" ? [{ id: d.id, url: state.view.url, filename: `${baseName(d.name)}-card.png` }] : [];
    }
    const state = stateOf(d.id);
    return state.status === "done" ? [{ id: d.id, url: state.result.url, filename: `${baseName(d.name)}-repaired.png` }] : [];
  });
  const statusOf = (id: string) => (mode === "card" ? cardStatus(cards.stateOf(id)) : repairStatus(stateOf(id)));
  const unrepaired = documents.filter((d) => stateOf(d.id).status === "idle").length;
  const selectedDone = selected !== null && exportPages.some((p) => p.id === selected.id);
  // While "Repair all" runs, the pages, mode and export are held so nothing changes under it.
  const locked = batch.status === "running";
  const step: Step = documents.length === 0 ? "Upload" : selectedDone ? "Review" : "Repair";

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <Logo className="brand__mark" />
          <div>
            <h1 className="brand__name">
              <span aria-hidden="true">{WORDMARK}</span>
              <span className="visually-hidden">{PRODUCT_NAME}</span>
            </h1>
            <p className="muted brand__tagline">{TAGLINE}</p>
          </div>
        </div>
        <div className="app__controls">
          <ModeSelector mode={mode} onChange={setMode} disabled={locked} />
          <ThemeSwitch />
        </div>
      </header>

      <StepIndicator current={step} exportReady={exportPages.length > 0} />

      <main className="app__main">
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

        {mode === "document" && documents.length > 1 && (
          <RepairAllBar batch={batch} pending={unrepaired} onStart={() => void repairAll(documents)} onStop={stopAll} />
        )}

        {documents.length > 0 && (
          <div className="workspace-frame">
            {batch.status === "running" && <RepairAllLock batch={batch} />}
            <div className="workspace" inert={locked} aria-busy={locked || undefined}>
              <PageList documents={documents} selectedId={selectedId} statusOf={statusOf} onSelect={setSelectedId} onMove={move} />
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
                  onRotate={(by) => rotate(selected, by)}
                  onApplyCorners={(c) => void applyCorners(selected, c)}
                  onRemove={() => remove(selected.id)}
                />
              )}
            </div>
          </div>
        )}

        {exportPages.length > 0 && <ExportBar
            pages={exportPages}
            total={documents.length}
            doneWord={mode === "card" ? "cropped" : "repaired"}
            filename={mode === "card" ? "cards.pdf" : "repaired-document.pdf"}
            zipFilename={mode === "card" ? "cards.zip" : "repaired-images.zip"}
            locked={locked}
          />}
      </main>

      <AppFooter />
    </div>
  );
}
