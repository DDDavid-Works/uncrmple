/**
 * Development-only harness (not part of the production build): runs the document repair pipeline
 * over every image in test-photos/documents/ in each output style and shows original, detected
 * corners and result for manual review. Images are read from the local dev server only; nothing is
 * uploaded. Results are also exposed on window.__docEval.
 */
import { fileToRaster } from "../lib/browser/raster";
import { toGray } from "../lib/image-processing/assessment/pixels";
import { traceLines } from "../lib/image-processing/dewarp/trace";
import { downscale } from "../lib/image-processing/downscale";
import { repair } from "../lib/image-processing/pipeline";
import { createOpenCvProcessor } from "../lib/image-processing/opencv/processor";
import type { Deskew, Dewarp, OutputStyle, Quad, RasterImage } from "../types/repair";

const files = import.meta.glob("/test-photos/documents/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const STYLES: OutputStyle[] = ["color", "grayscale", "blackwhite"];

interface Row {
  name: string;
  size: string;
  style: OutputStyle;
  ok: boolean;
  source?: string;
  areaPct?: number;
  edgeSupport?: number;
  outSize?: string;
  ms?: number;
  note?: string;
  corners?: Quad;
  /** Measured residual tilt, applied rotation, band angles and bend. */
  deskew?: string;
  dewarp?: string;
}

declare global {
  interface Window {
    __docEval?: Row[];
    __docEvalDone?: boolean;
  }
}

const processor = createOpenCvProcessor();
const root = document.getElementById("root")!;
root.style.cssText = "font:14px system-ui;padding:12px;max-width:1500px;margin:auto";
root.innerHTML = `<h1 style="font-size:18px">Document repair evaluation (local, dev only)</h1><p id="status"></p><div id="grid" style="display:grid;gap:16px"></div>`;
const status = document.getElementById("status")!;
const grid = document.getElementById("grid")!;

function draw(raster: RasterImage, corners?: Quad): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = raster.width;
  c.height = raster.height;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height), 0, 0);
  if (corners) {
    ctx.lineWidth = Math.max(4, raster.width / 200);
    ctx.strokeStyle = "#00e676";
    ctx.beginPath();
    corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }
  c.style.cssText = "width:100%;max-height:520px;object-fit:contain;background:#222";
  return c;
}

/** The straightened page with traced lines drawn over it (red: text rows, blue: ruled lines). */
function drawTrace(straightened: RasterImage): HTMLElement {
  const small = downscale(straightened, 1200).image;
  const trace = traceLines(toGray(small));
  const canvas = draw(small);
  const ctx = canvas.getContext("2d")!;
  ctx.lineWidth = 2;
  for (const line of trace.lines) {
    ctx.strokeStyle = line.kind === "ruled" ? "#00a0ff" : "#ff2050";
    ctx.beginPath();
    line.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  const cell = document.createElement("div");
  cell.append(canvas, document.createTextNode(`traced lines · ${trace.lines.length} · row pitch ${trace.rowPitch?.toFixed(1) ?? "?"} px`));
  return cell;
}

function describeDewarp(d: Dewarp): string {
  const permille = (v: number | null) => (v === null ? "?" : (v * 1000).toFixed(2));
  const bend = `bend ${permille(d.bendBefore)}‰${d.bendAfter === null ? "" : ` → ${permille(d.bendAfter)}‰`}`;
  return `${d.applied ? "FLATTENED" : `not flattened (${d.skipped})`} · ${bend} · coverage ${d.coverage?.toFixed(2) ?? "?"}`;
}

function describeDeskew(d: Deskew): string {
  if (!d.measured) return `tilt not measured (${d.skipped})`;
  const { angle, confidence, bands, bend } = d.measured;
  const fixed = d.applied ? `levelled ${d.applied}°` : `kept (${d.skipped})`;
  return `tilt ${angle}° conf ${confidence.toFixed(2)} ${fixed} · bands ${bands.map((b) => b ?? "?").join("/")} bend ${bend ?? "?"}${d.bent ? " BENT" : ""}`;
}

async function main() {
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  const rows: Row[] = [];
  if (entries.length === 0) status.textContent = "No images found in test-photos/documents/.";
  for (const [i, [path, url]] of entries.entries()) {
    const name = path.split("/").pop()!;
    status.textContent = `Processing ${i + 1} of ${entries.length}: ${name}`;
    const section = document.createElement("section");
    section.style.cssText = "border:1px solid #888;border-radius:8px;padding:8px;display:grid;gap:6px";
    section.innerHTML = `<strong>${name}</strong>`;
    grid.append(section);

    const blob = await fetch(url).then((r) => r.blob());
    const raster = await fileToRaster(blob);
    if (!raster.ok) {
      rows.push({ name, size: "?", style: "color", ok: false, note: raster.error.message });
      section.append(document.createTextNode(`Could not decode: ${raster.error.message}`));
      continue;
    }
    const img = raster.value;
    const size = `${img.width}x${img.height}`;
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;grid-template-columns:repeat(5,1fr);gap:6px;align-items:start";
    section.append(wrap);
    let corners: Quad | undefined;
    const cells: HTMLElement[] = [];
    for (const style of STYLES) {
      const t0 = performance.now();
      const res = await repair(processor, img, { enhance: { style }, ...(corners ? { corners } : {}) });
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) {
        rows.push({ name, size, style, ok: false, ms, note: `${res.error.code}: ${res.error.message}` });
        cells.push(document.createTextNode(`${style}: FAILED ${res.error.code} - ${res.error.message}`) as unknown as HTMLElement);
        continue;
      }
      const r = res.value;
      corners ??= r.corners;
      rows.push({
        name, size, style, ok: true, source: r.source,
        areaPct: r.areaFraction === undefined ? undefined : Math.round(r.areaFraction * 100),
        edgeSupport: r.edgeSupport === undefined ? undefined : +r.edgeSupport.toFixed(2),
        outSize: `${r.image.width}x${r.image.height}`, ms, corners: r.corners, deskew: describeDeskew(r.deskew), dewarp: describeDewarp(r.dewarp),
      });
      const cell = document.createElement("div");
      cell.append(draw(r.image), document.createTextNode(`${style} · ${r.image.width}x${r.image.height} · ${ms} ms`));
      cells.push(cell);
      if (style === "color") {
        const first = document.createElement("div");
        first.append(
          draw(img, r.corners),
          document.createTextNode(
            `${size} · ${r.source} · page ${r.areaFraction === undefined ? "?" : Math.round(r.areaFraction * 100)}% · edge ${r.edgeSupport?.toFixed(2) ?? "?"} · ${describeDeskew(r.deskew)} · ${describeDewarp(r.dewarp)}`,
          ),
        );
        wrap.prepend(first);
        cells.push(drawTrace(r.straightened));
      }
    }
    wrap.append(...cells);
  }
  window.__docEval = rows;
  window.__docEvalDone = true;
  status.textContent = `Done: ${entries.length} photo(s) x ${STYLES.length} styles. Green outline = detected corners.`;
}

void main();
