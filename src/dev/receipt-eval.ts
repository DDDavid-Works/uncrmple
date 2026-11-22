/**
 * Development-only harness for the receipt OCR spike (docs/receipt-mode.md, Phase 1). Not part of
 * the production build.
 *
 * Reads every photo in test-photos/receipts/ and its `<name>.truth.json`, runs Tesseract.js on the
 * raw photo, the Receipt mode output and the Document Repair output, and scores the text against
 * the truth. Photos are
 * read from the local dev server; OCR runs in a Web Worker with its engine and language data served
 * from node_modules on the same server, so nothing is fetched from elsewhere or uploaded. Results
 * are also exposed on window.__receiptEval.
 */
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { fileToRaster } from "../lib/browser/raster";
import { repair } from "../lib/image-processing/pipeline";
import { createOpenCvProcessor } from "../lib/image-processing/opencv/processor";
import type { EnhanceOptions, OutputStyle, RasterImage } from "../types/repair";
import { toGray, type Gray } from "../lib/image-processing/assessment/pixels";
import { traceLines } from "../lib/image-processing/dewarp/trace";
import { groupRows, stackRows, stripHeight } from "./receipt-eval/rows";
import { scoreReceipt, summarize, type OcrLine, type ReceiptScore } from "./receipt-eval/score";
import { parseTruth, type ReceiptTruth } from "./receipt-eval/truth";

const photos = import.meta.glob("/test-photos/receipts/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
const truthFiles = import.meta.glob("/test-photos/receipts/*.truth.json", { import: "default", eager: true }) as Record<string, unknown>;

/**
 * What is fed to OCR: the photo as taken, the Document Repair output in one style, or the Receipt
 * mode output ("receipt": grayscale with the receipt curve, as the app starts it).
 */
type Input = "raw" | OutputStyle | "receipt";
const INPUTS: { value: Input; label: string; checked: boolean }[] = [
  { value: "raw", label: "Raw photo", checked: true },
  { value: "receipt", label: "Receipt mode (grayscale)", checked: true },
  { value: "grayscale", label: "Repaired, grayscale", checked: true },
  { value: "blackwhite", label: "Repaired, black & white", checked: false },
  { value: "color", label: "Repaired, colour", checked: false },
];
const LANG_DATA = [
  { value: "4.0.0_best_int", label: "best_int (about 3 MB)" },
  { value: "4.0.0", label: "full (about 11 MB)" },
];
const PSMS = [
  { value: PSM.SINGLE_COLUMN, label: "4: single column" },
  { value: PSM.AUTO, label: "3: automatic layout" },
  { value: PSM.SINGLE_BLOCK, label: "6: single block" },
];

/**
 * Enlarge the image before OCR. Tesseract reads best with letters about 20-30 px tall; small print
 * in a downsized photo can be well below that.
 */
const SCALES = [
  { value: "1", label: "1× (as is)" },
  { value: "1.5", label: "1.5×" },
  { value: "2", label: "2×" },
];

/**
 * "page": Tesseract finds the lines itself (with the page layout above). "rows": the rows are
 * found first with the page tracer and each is read as one line (src/dev/receipt-eval/rows.ts).
 */
type Reading = "page" | "rows";
const READINGS = [
  { value: "page", label: "Whole page" },
  { value: "rows", label: "Row by row" },
];

interface Settings {
  langData: string;
  psm: PSM;
  scale: number;
  reading: Reading;
  inputs: Input[];
}

interface Run {
  photo: string;
  input: Input;
  ok: boolean;
  error?: string;
  ms?: number;
  width?: number;
  height?: number;
  meanConfidence?: number;
  lines?: OcrLine[];
  score?: ReceiptScore;
}

declare global {
  interface Window {
    __receiptEval?: { settings: Settings; engineLoadMs: number; runs: Run[] };
    __receiptEvalDone?: boolean;
  }
}

// --- DOM helpers (OCR text goes in through textContent only) -------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, css?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (css) node.style.cssText = css;
  return node;
}

function select(label: string, options: { value: string; label: string }[]): { wrap: HTMLElement; input: HTMLSelectElement } {
  const wrap = el("label", `${label} `);
  const input = el("select");
  for (const o of options) input.append(new Option(o.label, o.value));
  wrap.append(input);
  return { wrap, input };
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`);
const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

function toCanvas(raster: RasterImage): HTMLCanvasElement {
  const c = el("canvas");
  c.width = raster.width;
  c.height = raster.height;
  c.getContext("2d")!.putImageData(new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height), 0, 0);
  return c;
}

/** A smoothly enlarged copy for OCR; the canvas itself when the scale is 1. */
function enlarge(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return canvas;
  const big = el("canvas");
  big.width = Math.round(canvas.width * scale);
  big.height = Math.round(canvas.height * scale);
  const ctx = big.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, big.width, big.height);
  return big;
}

function thumb(canvas: HTMLCanvasElement, caption: string): HTMLElement {
  const fig = el("figure", undefined, "margin:0");
  const img = el("img", undefined, "width:100%;max-height:480px;object-fit:contain;background:#222");
  img.src = canvas.toDataURL("image/jpeg", 0.8);
  img.alt = caption;
  fig.append(img, el("figcaption", caption, "font-size:12px"));
  return fig;
}

// --- Page ----------------------------------------------------------------------------------------

const root = document.getElementById("root")!;
root.style.cssText = "font:14px system-ui;padding:12px;max-width:1500px;margin:auto";
root.append(el("h1", "Receipt OCR evaluation (local, dev only)", "font-size:18px"));

const controls = el("div", undefined, "display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:8px");
const lang = select("Language data", LANG_DATA);
const psm = select("Page layout", PSMS);
const scale = select("Scale before OCR", SCALES);
const reading = select("Reading", READINGS);
const inputBoxes = INPUTS.map((i) => {
  const label = el("label");
  const box = el("input");
  box.type = "checkbox";
  box.value = i.value;
  box.checked = i.checked;
  label.append(box, ` ${i.label}`);
  return { label, box };
});
const runButton = el("button", "Run");
controls.append(lang.wrap, reading.wrap, psm.wrap, scale.wrap,...inputBoxes.map((b) => b.label), runButton);

const status = el("p");
const summaryBox = el("div");
const grid = el("div", undefined, "display:grid;gap:16px");
root.append(controls, status, summaryBox, grid);

const processor = createOpenCvProcessor();

async function loadEngine(langData: string, mode: PSM): Promise<Worker> {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: "/node_modules/tesseract.js/dist/worker.min.js",
    corePath: "/node_modules/tesseract.js-core",
    langPath: `/node_modules/@tesseract.js-data/eng/${langData}`,
    gzip: true,
    workerBlobURL: false,
    // No IndexedDB copy: both data sets are called "eng", and nothing should persist.
    cacheMethod: "none",
  });
  await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: "1" });
  return worker;
}

async function ocr(worker: Worker, canvas: HTMLCanvasElement): Promise<{ lines: OcrLine[]; meanConfidence: number }> {
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  const lines = (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .map((l) => ({ text: l.text.trim(), confidence: l.confidence }))
    .filter((l) => l.text.length > 0);
  return { lines, meanConfidence: data.confidence };
}

/** White space added above and below each row strip; Tesseract misreads text touching the edge. */
const STRIP_PAD_PX = 8;

function grayToCanvas(gray: Gray, pad: number): HTMLCanvasElement {
  const c = el("canvas");
  c.width = gray.width;
  c.height = gray.height + 2 * pad;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  const rgba = new ImageData(gray.width, gray.height);
  for (let i = 0; i < gray.data.length; i++) {
    const v = gray.data[i]!;
    rgba.data[i * 4] = rgba.data[i * 4 + 1] = rgba.data[i * 4 + 2] = v;
    rgba.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(rgba, 0, pad);
  return c;
}

/**
 * Find the rows with the page tracer, straighten each, stack them with white gaps, and read the
 * stack in one pass as a single block (each row then comes back as one line). A page where no rows
 * can be traced throws (reported as a failed read), rather than falling back to the whole page.
 */
async function ocrRows(worker: Worker, image: RasterImage, scale: number, pagePsm: PSM): Promise<{ lines: OcrLine[]; meanConfidence: number; stacked: HTMLCanvasElement }> {
  const gray = toGray(image);
  const trace = traceLines(gray);
  const rows = groupRows(trace);
  if (rows.length === 0 || trace.rowPitch === null) throw new Error("no text rows could be traced");
  const stacked = grayToCanvas(stackRows(gray, rows, stripHeight(trace.rowPitch)), STRIP_PAD_PX);
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  try {
    return { ...(await ocr(worker, enlarge(stacked, scale))), stacked };
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: pagePsm });
  }
}

function renderRun(run: Run, truth: ReceiptTruth | null): HTMLElement {
  const box = el("div", undefined, "display:grid;gap:4px;min-width:0");
  if (!run.ok) {
    box.append(el("strong", `${run.input}: FAILED`), el("div", run.error ?? "", "color:#c00"));
    return box;
  }
  const s = run.score;
  const head = s
    ? `lines ${s.foundLines}/${s.scoredLines} · amounts in row ${s.amountsInRow}/${s.pricedLines} · anywhere ${s.amountsAnywhere}/${s.pricedLines} · total ${s.total}`
    : "not scored (no valid truth file)";
  box.append(
    el("strong", `${run.input} · ${run.width}x${run.height} · ${run.ms} ms · confidence ${run.meanConfidence?.toFixed(0)}`),
    el("div", head),
  );

  const text = el("pre", undefined, "white-space:pre-wrap;font-size:12px;background:#f4f4f4;padding:6px;margin:0;max-height:420px;overflow:auto");
  for (const line of run.lines ?? []) {
    const row = el("div", line.text, line.confidence < 60 ? "color:#c00" : "");
    row.title = `confidence ${line.confidence.toFixed(0)}`;
    text.append(row);
  }
  box.append(text);

  if (s && truth) {
    const problems = el("ul", undefined, "margin:0;padding-left:18px;font-size:12px");
    for (const l of s.lines) {
      if (l.ocrLine === null) problems.append(el("li", `missing line: ${l.line.text} (best ${l.similarity.toFixed(2)})`));
      else if (l.amountInRow === false) {
        const where = l.amountAnywhere ? "read, but on another line" : "not read";
        problems.append(el("li", `amount ${l.line.amount} for "${l.line.text}": ${where}; OCR line "${run.lines?.[l.ocrLine]?.text}"`));
      }
    }
    if (problems.childElementCount > 0) box.append(problems);
  }
  return box;
}

function renderSummary(settings: Settings, engineLoadMs: number, runs: Run[]) {
  summaryBox.replaceChildren();
  const table = el("table", undefined, "border-collapse:collapse;margin:8px 0");
  const header = el("tr");
  for (const h of ["Input", "Receipts scored", "Line recall", "Amounts in row", "Amounts anywhere", "Totals correct", "Failed", "Median ms"]) {
    header.append(el("th", h, "text-align:left;padding:2px 10px;border-bottom:1px solid #888"));
  }
  table.append(header);
  for (const input of settings.inputs) {
    const mine = runs.filter((r) => r.input === input);
    const scores = mine.flatMap((r) => (r.score ? [r.score] : []));
    const sum = summarize(scores);
    const ms = median(mine.flatMap((r) => (r.ms === undefined ? [] : [r.ms])));
    const tr = el("tr");
    for (const v of [
      input,
      String(sum.receipts),
      pct(sum.lineRecall),
      pct(sum.amountsInRow),
      pct(sum.amountsAnywhere),
      `${sum.totalsCorrect}/${sum.totalsPossible}`,
      String(mine.filter((r) => !r.ok).length),
      ms === null ? "–" : String(Math.round(ms)),
    ]) {
      tr.append(el("td", v, "padding:2px 10px"));
    }
    table.append(tr);
  }
  const psmLabel = PSMS.find((p) => p.value === settings.psm)?.label ?? settings.psm;
  summaryBox.append(
    el("div", `Language data ${settings.langData} · ${settings.reading === "rows" ? "row by row" : `whole page, layout ${psmLabel}`} · scale ${settings.scale}× · engine load ${engineLoadMs} ms`),
    table,
    el("div", "Amounts count only when every digit matches. Pass bar: 90% of amounts in row after repair.", "font-size:12px"),
  );
}

async function run() {
  const settings: Settings = {
    langData: lang.input.value,
    psm: psm.input.value as PSM,
    scale: Number(scale.input.value),
    reading: reading.input.value as Reading,
    inputs: inputBoxes.filter((b) => b.box.checked).map((b) => b.box.value as Input),
  };
  window.__receiptEvalDone = false;
  grid.replaceChildren();
  summaryBox.replaceChildren();

  const entries = Object.entries(photos).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    status.textContent = "No photos found in test-photos/receipts/.";
    window.__receiptEvalDone = true;
    return;
  }
  if (settings.inputs.length === 0) {
    status.textContent = "Pick at least one input.";
    return;
  }

  runButton.disabled = true;
  status.textContent = "Loading the OCR engine…";
  const t0 = performance.now();
  let worker: Worker;
  try {
    worker = await loadEngine(settings.langData, settings.psm);
  } catch (error) {
    status.textContent = `OCR engine failed to load: ${String(error)}`;
    runButton.disabled = false;
    return;
  }
  const engineLoadMs = Math.round(performance.now() - t0);
  const runs: Run[] = [];

  try {
    for (const [i, [path, url]] of entries.entries()) {
      const name = path.split("/").pop()!;
      status.textContent = `Receipt ${i + 1} of ${entries.length}: ${name}`;
      const section = el("section", undefined, "border:1px solid #888;border-radius:8px;padding:8px;display:grid;gap:6px");
      section.append(el("strong", name));
      grid.append(section);

      const truthPath = path.replace(/\.[^.]+$/, ".truth.json");
      let truth: ReceiptTruth | null = null;
      if (!(truthPath in truthFiles)) {
        section.append(el("div", `No truth file (${truthPath.split("/").pop()}): OCR only, not scored.`, "color:#a60"));
      } else {
        const parsed = parseTruth(truthFiles[truthPath]);
        if (parsed.ok) truth = parsed.truth;
        else section.append(el("pre", `Truth file has problems, not scored:\n${parsed.errors.join("\n")}`, "color:#c00;white-space:pre-wrap"));
      }

      const decoded = await fileToRaster(await fetch(url).then((r) => r.blob()));
      if (!decoded.ok) {
        section.append(el("div", `Could not decode: ${decoded.error.message}`, "color:#c00"));
        for (const input of settings.inputs) runs.push({ photo: name, input, ok: false, error: decoded.error.message });
        continue;
      }
      const photo = decoded.value;
      const row = el("div", undefined, `display:grid;grid-template-columns:repeat(${settings.inputs.length + 1},minmax(0,1fr));gap:8px;align-items:start`);
      section.append(row);
      row.append(thumb(toCanvas(photo), `${photo.width}x${photo.height}`));

      for (const input of settings.inputs) {
        status.textContent = `Receipt ${i + 1} of ${entries.length}: ${name} · ${input}`;
        let image = photo;
        if (input !== "raw") {
          const enhance: EnhanceOptions = input === "receipt" ? { style: "grayscale", profile: "receipt" } : { style: input };
          const repaired = await repair(processor, photo, { enhance });
          if (!repaired.ok) {
            const r: Run = { photo: name, input, ok: false, error: `repair failed: ${repaired.error.code}: ${repaired.error.message}` };
            runs.push(r);
            row.append(renderRun(r, truth));
            continue;
          }
          image = repaired.value.image;
        }
        const canvas = toCanvas(image);
        const t = performance.now();
        try {
          const read: { lines: OcrLine[]; meanConfidence: number; stacked?: HTMLCanvasElement } =
            settings.reading === "rows"
              ? await ocrRows(worker, image, settings.scale, settings.psm)
              : await ocr(worker, enlarge(canvas, settings.scale));
          const { lines, meanConfidence } = read;
          const r: Run = {
            photo: name, input, ok: true, ms: Math.round(performance.now() - t),
            width: Math.round(image.width * settings.scale), height: Math.round(image.height * settings.scale),
            meanConfidence, lines, ...(truth ? { score: scoreReceipt(truth, lines) } : {}),
          };
          runs.push(r);
          const cell = renderRun(r, truth);
          if (read.stacked) cell.prepend(thumb(read.stacked, `${input}: rows as read`));
          if (input !== "raw") cell.prepend(thumb(canvas, `${input} repair`));
          row.append(cell);
        } catch (error) {
          const r: Run = { photo: name, input, ok: false, error: `OCR failed: ${String(error)}` };
          runs.push(r);
          row.append(renderRun(r, truth));
        }
      }
      renderSummary(settings, engineLoadMs, runs);
    }
  } finally {
    await worker.terminate();
    runButton.disabled = false;
  }

  renderSummary(settings, engineLoadMs, runs);
  window.__receiptEval = { settings, engineLoadMs, runs };
  window.__receiptEvalDone = true;
  status.textContent = `Done: ${entries.length} photo(s) x ${settings.inputs.length} input(s). Red OCR lines have confidence under 60.`;
}

runButton.addEventListener("click", () => void run());
status.textContent = `${Object.keys(photos).length} photo(s) and ${Object.keys(truthFiles).length} truth file(s) in test-photos/receipts/. Press Run.`;
