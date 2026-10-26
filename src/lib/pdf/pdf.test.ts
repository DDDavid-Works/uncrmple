import { buildPdf, layoutPage } from "./pdf";
import type { PdfPage } from "./pdf";

/** A minimal stand-in JPEG: valid SOI/EOI markers with a distinguishing payload. */
const jpeg = (tag: string): Uint8Array =>
  new Uint8Array([0xff, 0xd8, ...new TextEncoder().encode(tag), 0xff, 0xd9]);
const page = (tag: string, width = 100, height = 200): PdfPage => ({ jpeg: jpeg(tag), width, height });
const asText = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("buildPdf", () => {
  it("writes a PDF with one page per image, in the given order", () => {
    const pdf = asText(buildPdf([page("PAGE-ONE"), page("PAGE-TWO"), page("PAGE-THREE")]));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 3");
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(3);
    const order = ["PAGE-ONE", "PAGE-TWO", "PAGE-THREE"].map((t) => pdf.indexOf(t));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("embeds the JPEG bytes unchanged", () => {
    const source = jpeg("UNCHANGED");
    const out = buildPdf([{ jpeg: source, width: 10, height: 10 }]);
    const needle = asText(source);
    expect(asText(out)).toContain(needle);
    expect(asText(out)).toContain(`/Length ${source.length}`);
  });

  it("writes a cross-reference table whose offsets point at the objects", () => {
    const out = buildPdf([page("A"), page("B")]);
    const pdf = asText(out);
    const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)];
    expect(entries).toHaveLength(8); // catalog, page tree, 2 × (page, content, image)
    entries.forEach((m, i) => {
      expect(pdf.slice(Number(m[1]), Number(m[1]) + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("rejects empty input, non-JPEG data and invalid sizes", () => {
    expect(() => buildPdf([])).toThrow(/at least one page/);
    expect(() => buildPdf([{ jpeg: new Uint8Array([1, 2, 3, 4]), width: 1, height: 1 }])).toThrow(/not a JPEG/);
    expect(() => buildPdf([page("X", 0, 10)])).toThrow(/invalid dimensions/);
  });
});

describe("layoutPage", () => {
  it("keeps the image shape and fills the page for 'fit'", () => {
    const l = layoutPage({ width: 1000, height: 2000 }, "fit");
    expect(l.width / l.height).toBeCloseTo(0.5);
    expect([l.x, l.y]).toEqual([0, 0]);
    expect(l.pageWidth).toBe(l.width);
  });

  it("fits a portrait image inside A4 margins without distortion, centred", () => {
    const l = layoutPage({ width: 1000, height: 1500 }, "a4");
    expect(l.pageWidth).toBeCloseTo(595.28);
    expect(l.width / l.height).toBeCloseTo(1000 / 1500);
    expect(l.x).toBeGreaterThanOrEqual(18 - 1e-6);
    expect(l.y).toBeGreaterThanOrEqual(18 - 1e-6);
    expect(l.x + l.width).toBeLessThanOrEqual(l.pageWidth - 18 + 1e-6);
    expect(l.y + l.height).toBeLessThanOrEqual(l.pageHeight - 18 + 1e-6);
    expect(l.x).toBeCloseTo(l.pageWidth - l.width - l.x);
  });

  it("turns the paper to landscape for a wide image", () => {
    const l = layoutPage({ width: 2000, height: 1000 }, "letter");
    expect(l.pageWidth).toBe(792);
    expect(l.pageHeight).toBe(612);
  });
});
