import { useState } from "react";
import { blobToJpeg } from "../../lib/browser/raster";
import { downloadBlob } from "../../lib/browser/download";
import { buildPdf, PAPER_SIZES } from "../../lib/pdf/pdf";
import type { PaperSize, PdfPage } from "../../lib/pdf/pdf";

export interface ExportPage {
  id: string;
  /** Object URL of the repaired image. */
  url: string;
}

interface Props {
  /** Repaired pages in upload order. */
  pages: ExportPage[];
  /** Uploaded pages, repaired or not. */
  total: number;
  /** Word for pages not yet processed in the skipped-pages note; defaults to "repaired". */
  doneWord?: string;
  filename?: string;
}

/** Combine every repaired page into one PDF, in upload order. */
export function ExportBar({ pages, total, doneWord = "repaired", filename = "repaired-document.pdf" }: Props) {
  const [paper, setPaper] = useState<PaperSize>("fit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skipped = total - pages.length;

  async function exportPdf() {
    setBusy(true);
    setError(null);
    try {
      const encoded: PdfPage[] = [];
      for (const page of pages) {
        const blob = await fetch(page.url).then((r) => r.blob());
        const jpeg = await blobToJpeg(blob);
        if (!jpeg.ok) {
          setError(jpeg.error.message);
          return;
        }
        encoded.push({ jpeg: jpeg.value.bytes, width: jpeg.value.width, height: jpeg.value.height });
      }
      const pdf = buildPdf(encoded, paper);
      downloadBlob(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), filename);
    } catch {
      setError("The PDF could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="export" aria-label="Export PDF">
      <div className="export__row">
        <div className="export__title">
          <h2>Export</h2>
          <p className="muted export__count">
            {pages.length} of {total} {doneWord}
          </p>
        </div>
        <label className="export__field">
          Paper
          <select value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)} disabled={busy}>
            {(Object.keys(PAPER_SIZES) as PaperSize[]).map((p) => (
              <option key={p} value={p}>
                {PAPER_SIZES[p].label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--primary" onClick={() => void exportPdf()} disabled={busy}>
          {busy ? "Creating PDF…" : `Download PDF (${pages.length} ${pages.length === 1 ? "page" : "pages"})`}
        </button>
      </div>
      {skipped > 0 && (
        <p className="muted export__skipped">
          {skipped} {skipped === 1 ? "page is" : "pages are"} not {doneWord} yet and will be left out.
        </p>
      )}
      {error && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
    </section>
  );
}
