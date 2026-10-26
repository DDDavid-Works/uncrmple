export type PaperSize = "fit" | "a4" | "letter";

export interface PdfPage {
  /** A complete baseline/progressive JPEG file. Embedded as-is (DCTDecode), never re-encoded. */
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  width: number;
  height: number;
}

export const PAPER_SIZES: Record<PaperSize, { label: string }> = {
  fit: { label: "Same shape as the image" },
  a4: { label: "A4" },
  letter: { label: "US Letter" },
};

/** Points (1/72 in). */
const SIZES_PT = { a4: [595.28, 841.89], letter: [612, 792] } as const;
/** "fit" pages assume this pixel density, so a 1654×2339 px page prints at roughly A4. */
const FIT_DPI = 200;
const MARGIN_PT = 18;

const encoder = new TextEncoder();
const text = (s: string) => encoder.encode(s);
const num = (n: number) => String(Math.round(n * 100) / 100);

/** Page size and image placement (points, origin bottom-left) for one page. */
export function layoutPage(page: Pick<PdfPage, "width" | "height">, paper: PaperSize) {
  if (paper === "fit") {
    const w = (page.width * 72) / FIT_DPI;
    const h = (page.height * 72) / FIT_DPI;
    return { pageWidth: w, pageHeight: h, x: 0, y: 0, width: w, height: h };
  }
  const [pageWidth, pageHeight] = SIZES_PT[paper];
  // Orient the paper to match the image, then fit the image inside the margins.
  const landscape = page.width > page.height;
  const pw = landscape ? pageHeight : pageWidth;
  const ph = landscape ? pageWidth : pageHeight;
  const scale = Math.min((pw - 2 * MARGIN_PT) / page.width, (ph - 2 * MARGIN_PT) / page.height);
  const width = page.width * scale;
  const height = page.height * scale;
  return { pageWidth: pw, pageHeight: ph, x: (pw - width) / 2, y: (ph - height) / 2, width, height };
}

/**
 * Build a PDF with one JPEG per page, in the order given. Pure and dependency-free:
 * the only PDF features needed are image XObjects, so a hand-written writer is smaller and
 * easier to audit than a library.
 */
export function buildPdf(pages: readonly PdfPage[], paper: PaperSize = "fit"): Uint8Array {
  if (pages.length === 0) throw new Error("A PDF needs at least one page.");
  for (const p of pages) {
    if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 1 || p.height < 1) {
      throw new Error("Page image has invalid dimensions.");
    }
    if (p.jpeg.length < 4 || p.jpeg[0] !== 0xff || p.jpeg[1] !== 0xd8) {
      throw new Error("Page image is not a JPEG.");
    }
  }

  // Object numbers: 1 catalog, 2 page tree, then per page: page, content stream, image.
  const objects: Uint8Array[][] = [];
  const pageRefs = pages.map((_, i) => `${3 + i * 3} 0 R`);
  objects[1] = [text(`<< /Type /Catalog /Pages 2 0 R >>`)];
  objects[2] = [text(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`)];

  pages.forEach((p, i) => {
    const n = 3 + i * 3;
    const l = layoutPage(p, paper);
    const content = `q ${num(l.width)} 0 0 ${num(l.height)} ${num(l.x)} ${num(l.y)} cm /Im0 Do Q`;
    objects[n] = [
      text(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(l.pageWidth)} ${num(l.pageHeight)}] ` +
          `/Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`,
      ),
    ];
    objects[n + 1] = [text(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)];
    objects[n + 2] = [
      text(
        `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      ),
      p.jpeg,
      text(`\nendstream`),
    ];
  });

  const chunks: Uint8Array[] = [text("%PDF-1.4\n")];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = offset;
    const parts = [text(`${n} 0 obj\n`), ...objects[n]!, text(`\nendobj\n`)];
    for (const part of parts) {
      chunks.push(part);
      offset += part.length;
    }
  }

  const count = objects.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(text(xref));

  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
