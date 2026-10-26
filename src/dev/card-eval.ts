/**
 * Development-only harness (not part of the production build): runs card detection and the
 * perspective crop over every image in test-photos/cards/ and shows the result for manual review.
 * Images are read from the local dev server only; nothing is uploaded. See docs/card-crop.md.
 */
import { fileToRaster } from "../lib/browser/raster";
import { detectCardCorners } from "../lib/image-processing/card-pipeline";
import { createOpenCvProcessor } from "../lib/image-processing/opencv/processor";
import type { Quad, RasterImage } from "../types/repair";

const files = import.meta.glob("/test-photos/cards/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface Row {
  name: string;
  size: string;
  outcome: "ready" | "verify" | "none" | "error";
  score?: number;
  aspect?: number;
  areaPct?: number;
  warnings?: string[];
  corners?: Quad;
  ms?: number;
  note?: string;
}

declare global {
  interface Window {
    __evalResults?: Row[];
    __evalDone?: boolean;
  }
}

const processor = createOpenCvProcessor();
const root = document.getElementById("root")!;
root.style.cssText = "font:14px system-ui;padding:12px;max-width:1400px;margin:auto";
root.innerHTML = `<h1 style="font-size:18px">Card detection evaluation (local, dev only)</h1><p id="status"></p><div id="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px"></div>`;
const status = document.getElementById("status")!;
const grid = document.getElementById("grid")!;

function draw(raster: RasterImage, corners?: Quad, colour = "#00e676"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = raster.width;
  c.height = raster.height;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height), 0, 0);
  if (corners) {
    ctx.lineWidth = Math.max(3, raster.width / 250);
    ctx.strokeStyle = colour;
    ctx.beginPath();
    corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }
  c.style.cssText = "max-width:100%;max-height:260px;object-fit:contain;background:#222";
  return c;
}

async function main() {
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  const rows: Row[] = [];
  if (entries.length === 0) status.textContent = "No images found in test-photos/cards/ (JPG, PNG or WebP).";
  for (const [i, [path, url]] of entries.entries()) {
    const name = path.split("/").pop()!;
    status.textContent = `Processing ${i + 1} of ${entries.length}: ${name}`;
    const card = document.createElement("section");
    card.style.cssText = "border:1px solid #888;border-radius:8px;padding:8px;display:grid;gap:6px";
    card.innerHTML = `<strong>${name}</strong>`;
    grid.append(card);

    const blob = await fetch(url).then((r) => r.blob());
    const raster = await fileToRaster(blob);
    if (!raster.ok) {
      rows.push({ name, size: "?", outcome: "error", note: raster.error.message });
      card.append(document.createTextNode(`Could not decode: ${raster.error.message}`));
      continue;
    }
    const img = raster.value;
    const t0 = performance.now();
    const found = await detectCardCorners(processor, img);
    const ms = Math.round(performance.now() - t0);
    const size = `${img.width}x${img.height}`;
    if (!found.ok) {
      rows.push({ name, size, outcome: found.error.code === "no-card-found" ? "none" : "error", ms, note: found.error.message });
      card.append(draw(img), document.createTextNode(`No card found (${ms} ms)`));
      continue;
    }
    const d = found.value;
    rows.push({
      name, size, outcome: d.level, score: +d.confidence.toFixed(3), aspect: +d.aspectRatio.toFixed(3),
      areaPct: Math.round(d.areaFraction * 100), warnings: d.warnings, corners: d.corners, ms,
    });
    const warped = await processor.correctPerspective(img, d.corners);
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start";
    wrap.append(draw(img, d.corners, d.level === "ready" ? "#00e676" : "#ffb300"));
    if (warped.ok) wrap.append(draw(warped.value));
    card.append(
      wrap,
      document.createTextNode(`${d.level.toUpperCase()} score ${d.confidence.toFixed(2)} · ${d.aspectRatio.toFixed(2)}:1 · ${Math.round(d.areaFraction * 100)}% of photo · ${ms} ms${d.warnings.length ? " · " + d.warnings.join(", ") : ""}`),
    );
  }
  window.__evalResults = rows;
  window.__evalDone = true;
  status.textContent = `Done: ${rows.length} photo(s). Green outline = ready, amber = verify.`;
}

void main();
