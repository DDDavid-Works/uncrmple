import { useState } from "react";
import { blobToJpeg } from "../../lib/browser/raster";
import { downloadBlob } from "../../lib/browser/download";
import { buildPdf, PAPER_SIZES } from "../../lib/pdf/pdf";
import type { PaperSize, PdfPage } from "../../lib/pdf/pdf";
import { buildZip, numberedNames } from "../../lib/zip/zip";

export interface ExportPage {
  id: string;
  /** Object URL of the repaired image. */
  url: string;
  /** File name of the image on its own, e.g. "receipt-repaired.png". */
  filename: string;
}

interface Props {
  /** Repaired pages in upload order. */
  pages: ExportPage[];
  /** Uploaded pages, repaired or not. */
  total: number;
  /** Word for pages not yet processed in the skipped-pages note; defaults to "repaired". */
  doneWord?: string;
  filename?: string;
  /** Name of the ZIP of all images. */
  zipFilename?: string;
  /** Pages are still being repaired: hold the export until they are done. */
  locked?: boolean;
}

/** Combine every repaired page into one PDF, or every image into one ZIP, in page order. */
export function ExportBar({
  pages, total, doneWord = "repaired", filename = "repaired-document.pdf", zipFilename = "repaired-images.zip", locked = false,
}: Props) {
  const [paper, setPaper] = useState<PaperSize>("fit");
  const [making, setMaking] = useState<"pdf" | "zip" | null>(null);
  const busy = making !== null;
  const [error, setError] = useState<string | null>(null);

  const skipped = total - pages.length;

  async function exportPdf() {
    setMaking("pdf");
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
      setMaking(null);
    }
  }

  async function exportZip() {
    setMaking("zip");
    setError(null);
    try {
      // The images go in as they are shown: the same PNGs as "Download image", not re-encoded.
      const data = await Promise.all(pages.map((p) => fetch(p.url).then((r) => r.arrayBuffer())));
      const names = numberedNames(pages.map((p) => p.filename));
      const zip = buildZip(data.map((d, i) => ({ name: names[i]!, data: new Uint8Array(d) })));
      downloadBlob(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), zipFilename);
    } catch {
      setError("The ZIP file could not be created.");
    } finally {
      setMaking(null);
    }
  }

  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

  return (
    <section className="export" aria-label="Export">
      <div className="export__row">
        <div className="export__title">
          <h2 className="eyebrow">Export</h2>
          <p className="muted export__count">
            {pages.length} of {total} {doneWord}
          </p>
        </div>
        <label className="export__field">
          Paper
          <select value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)} disabled={busy || locked}>
            {(Object.keys(PAPER_SIZES) as PaperSize[]).map((p) => (
              <option key={p} value={p}>
                {PAPER_SIZES[p].label}
              </option>
            ))}
          </select>
        </label>
        <div className="export__actions">
          <button type="button" className="btn btn--primary" onClick={() => void exportPdf()} disabled={busy || locked}>
            {making === "pdf" ? "Creating PDF…" : `Download PDF (${count(pages.length, "page")})`}
          </button>
          <button type="button" className="btn" onClick={() => void exportZip()} disabled={busy || locked}>
            {making === "zip" ? "Creating ZIP…" : `Download ZIP (${count(pages.length, "image")})`}
          </button>
        </div>
      </div>
      {locked ? (
        <p className="muted export__skipped">The PDF can be made once every page is repaired.</p>
      ) : skipped > 0 && (
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
