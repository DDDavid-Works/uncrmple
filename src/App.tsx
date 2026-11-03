import { useEffect, useState } from "react";
import type { SourceDocument } from "./types/document";
import { PRODUCT_NAME, TAGLINE, WORDMARK } from "./config";
import { AppFooter } from "./components/AppFooter";
import { Logo } from "./components/Logo";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { CardPanel } from "./features/card/CardPanel";
import { defaultCardCorners, useCardCrop } from "./features/card/useCardCrop";
import { ModeSelector } from "./features/mode/ModeSelector";
import type { ProcessingMode } from "./features/mode/ModeSelector";
import { useAssessment } from "./features/assess/useAssessment";
import { ExportBar } from "./features/export/ExportBar";
import { PageList, cardStatus, repairStatus } from "./features/pages/PageList";
import { EmptyInspector } from "./features/preview/Inspector";
import { PreviewPanel } from "./features/preview/PreviewPanel";
import type { PageNav } from "./features/preview/ViewerStage";
import { RepairAllBar, RepairAllLock } from "./features/repair/RepairAllBar";
import { useRepair } from "./features/repair/useRepair";
import { UploadZone } from "./features/upload/UploadZone";
import { useDocuments } from "./features/upload/useDocuments";
import { MAX_FILES } from "./lib/files/limits";
import { baseName } from "./lib/browser/download";

const NO_DOCUMENTS: SourceDocument[] = [];

function ShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 1.5 2.5 3.5v4c0 3.2 2.3 5.8 5.5 7 3.2-1.2 5.5-3.8 5.5-7v-4z" />
      <path d="m5.5 8 1.8 1.8L10.8 6.3" strokeLinecap="round" />
    </svg>
  );
}

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
  const selectedIndex = documents.findIndex((d) => d.id === selectedId);
  // Previous/next arrows beside the image, for stepping through a batch without the page list.
  const nav: PageNav | null =
    documents.length > 1 && selectedIndex >= 0
      ? {
          index: selectedIndex,
          total: documents.length,
          onPrevious: () => setSelectedId(documents[Math.max(0, selectedIndex - 1)]!.id),
          onNext: () => setSelectedId(documents[Math.min(documents.length - 1, selectedIndex + 1)]!.id),
        }
      : null;
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
  // While "Repair all" runs, the pages, mode and export are held so nothing changes under it.
  const locked = batch.status === "running";
  const doneWord = mode === "card" ? "cropped" : "repaired";

  // Export of every finished page; the selected page's own download sits above it in the panel.
  const exportAll =
    exportPages.length > 0 ? (
      <ExportBar
        pages={exportPages}
        total={documents.length}
        doneWord={doneWord}
        filename={mode === "card" ? "cards.pdf" : "repaired-document.pdf"}
        zipFilename={mode === "card" ? "cards.zip" : "repaired-images.zip"}
        locked={locked}
      />
    ) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo className="brand__mark" />
          <h1 className="brand__name">
            <span aria-hidden="true">{WORDMARK}</span>
            <span className="visually-hidden">{PRODUCT_NAME}</span>
          </h1>
          <p className="brand__context">Document Photo Repair Workspace</p>
        </div>
        <div className="topbar__end">
          <p className="topbar__privacy">
            <ShieldIcon />
            Files stay on this device
          </p>
          <span className="topbar__chip">Early access</span>
          <ThemeSwitch />
        </div>
      </header>

      <div className="titlebar">
        <div>
          <h2 className="titlebar__title">Your workspace</h2>
          <p className="muted">{TAGLINE}</p>
        </div>
        <ModeSelector mode={mode} onChange={setMode} disabled={locked} />
      </div>

      <main className="workbench">
        <aside className="sidebar" aria-label="Your pages">
          <div className="sidebar__head">
            <h2 className="sidebar__title">Your pages</h2>
            <span className="count" aria-label={`${documents.length} ${documents.length === 1 ? "page" : "pages"}`}>
              {documents.length}
            </span>
          </div>

          {documents.length > 0 && <UploadZone compact busy={pending > 0} onFiles={addFiles} />}

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

          {documents.length > 0 ? (
            <div className="sidebar__pages" inert={locked}>
              <PageList documents={documents} selectedId={selectedId} statusOf={statusOf} onSelect={setSelectedId} onMove={move} />
            </div>
          ) : (
            <div className="sidebar__empty">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M6 3h8l4 4v14H6z" />
                <path d="M14 3v4h4M9 12h6M9 15.5h6" strokeLinecap="round" />
              </svg>
              <p>Your pages will appear here.</p>
              <p className="muted">Add up to {MAX_FILES} photos. Reorder before export.</p>
            </div>
          )}

          {mode === "document" && documents.length > 1 && (
            <RepairAllBar batch={batch} pending={unrepaired} onStart={() => void repairAll(documents)} onStop={stopAll} />
          )}

          <div className="sidebar__note">
            <p className="sidebar__note-title">Only on your device</p>
            <p className="muted">No account. No document uploads. Reloading the page clears this workspace.</p>
          </div>
        </aside>

        {documents.length === 0 ? (
          <div className="stage">
            <div className="stage__main">
              <UploadZone compact={false} busy={pending > 0} onFiles={addFiles} />
            </div>
            <EmptyInspector mode={mode} />
          </div>
        ) : (
          <div className="workspace-frame">
            {batch.status === "running" && <RepairAllLock batch={batch} />}
            <div className="workspace" inert={locked} aria-busy={locked || undefined}>
              {selected && mode === "card" && (
                <CardPanel
                  key={selected.id}
                  doc={selected}
                  state={cards.stateOf(selected.id)}
                  enhance={cards.enhanceOf(selected.id)}
                  onEnhance={(o) => void cards.setEnhance(selected, o)}
                  onDetect={() => void cards.detect(selected)}
                  onCrop={(c, d) => void cards.crop(selected, c, d)}
                  onRotate={(by) => void cards.rotate(selected, by)}
                  onAdjust={() => cards.adjust(selected, defaultCardCorners(selected.width, selected.height))}
                  onCancelReview={() => cards.cancelReview(selected.id)}
                  onReset={() => cards.reset(selected.id)}
                  onRemove={() => remove(selected.id)}
                  exportAll={exportAll}
                  nav={nav}
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
                  exportAll={exportAll}
                  nav={nav}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
