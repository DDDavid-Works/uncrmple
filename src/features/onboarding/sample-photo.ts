import { applyHomography, homography, rectQuad } from "../../lib/image-processing/geometry";
import type { Point, Quad } from "../../types/repair";

/**
 * A sample document photo for people who want to try the app without one of their own. It is drawn
 * here, in the browser, rather than shipped as a picture: the letter is made up (no real people or
 * details), it costs nothing to download, and it carries the problems the app repairs — a page shot
 * at an angle on a desk, warm indoor light and a shadow across the paper.
 */
export const SAMPLE_FILE_NAME = "sample-letter.jpg";

const PHOTO_W = 1200;
const PHOTO_H = 1600;
const PAGE_W = 900;
const PAGE_H = 1273; // A4 proportions
/** Where the page lands in the photo: tilted and seen from slightly above its bottom edge. */
const PAGE_IN_PHOTO: Quad = [
  { x: 260, y: 240 },
  { x: 995, y: 300 },
  { x: 1015, y: 1400 },
  { x: 190, y: 1340 },
];

const SERIF = 'Georgia, "Times New Roman", serif';

const PARAGRAPHS = [
  "Dear gardeners,",
  "Spring planting starts on Saturday 4 April. Beds will be turned over the weekend before, so please clear any old stakes and netting from your plot by Friday 27 March.",
  "Seedlings from the shared greenhouse can be collected from the shed on planting day. Each plot may take up to twelve trays. Please bring your own trowel and gloves; the shared tools will be in use for the new beds by the gate.",
  "The water tank has been repaired and the hoses replaced. Watering is allowed before 9 am and after 5 pm only, to keep the pressure up for everyone.",
];

const SCHEDULE: [string, string, string][] = [
  ["Plots", "Planting slot", "Seedling trays"],
  ["1 – 12", "8:00 – 10:00", "Tomato, basil"],
  ["13 – 24", "10:00 – 12:00", "Lettuce, chard"],
  ["25 – 36", "13:00 – 15:00", "Beans, squash"],
];

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawPage(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PAGE_W;
  c.height = PAGE_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f8f6f0";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const left = 90;
  const width = PAGE_W - 2 * left;
  ctx.fillStyle = "#1f2321";
  ctx.textBaseline = "alphabetic";

  ctx.font = `bold 38px ${SERIF}`;
  ctx.fillText("Riverside Community Garden", left, 140);
  ctx.font = `22px ${SERIF}`;
  ctx.fillStyle = "#4a504c";
  ctx.fillText("Spring planting notice · 9 March", left, 180);
  ctx.fillRect(left, 205, width, 2);

  ctx.fillStyle = "#1f2321";
  ctx.font = `24px ${SERIF}`;
  let y = 265;
  for (const p of PARAGRAPHS) {
    for (const line of wrap(ctx, p, width)) {
      ctx.fillText(line, left, y);
      y += 36;
    }
    y += 18;
  }

  ctx.font = `bold 24px ${SERIF}`;
  ctx.fillText("Planting day schedule", left, y + 12);
  y += 40;
  const cols = [left, left + 190, left + 440];
  const rowH = 46;
  for (const [i, row] of SCHEDULE.entries()) {
    ctx.font = i === 0 ? `bold 22px ${SERIF}` : `22px ${SERIF}`;
    row.forEach((cell, j) => ctx.fillText(cell, cols[j]! + 12, y + 31));
    ctx.fillRect(left, y + rowH, width, i === 0 ? 2 : 1);
    y += rowH;
  }

  ctx.font = `24px ${SERIF}`;
  y += 60;
  ctx.fillText("Thank you, and happy planting.", left, y);
  ctx.font = `italic 24px ${SERIF}`;
  ctx.fillText("The garden committee", left, y + 44);
  return c;
}

/** Deterministic pseudo-random numbers, so the sample looks the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function drawDesk(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#6f4f37";
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  // Wood grain: long, slightly wavy streaks of lighter and darker brown.
  const rand = rng(7);
  for (let i = 0; i < 140; i++) {
    const y0 = rand() * PHOTO_H;
    const amp = 4 + rand() * 10;
    const freq = 0.002 + rand() * 0.004;
    ctx.strokeStyle = rand() < 0.5 ? `rgba(40, 24, 12, ${0.08 + rand() * 0.12})` : `rgba(160, 120, 80, ${0.05 + rand() * 0.1})`;
    ctx.lineWidth = 1 + rand() * 4;
    ctx.beginPath();
    for (let x = 0; x <= PHOTO_W; x += 20) {
      const yy = y0 + Math.sin(x * freq + i) * amp + x * 0.03;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

/** Draw `src` onto `ctx` so its rectangle lands on `quad`, piecewise-affine over a fine mesh. */
function drawInPerspective(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, quad: Quad): void {
  const h = homography(rectQuad(src.width, src.height), quad);
  if (!h) return;
  const n = 24;
  const at = (i: number, j: number): Point => ({ x: (i / n) * (src.width - 1), y: (j / n) * (src.height - 1) });
  const triangle = (s: [Point, Point, Point]) => {
    const d = s.map((p) => applyHomography(h, p)) as [Point, Point, Point];
    // Affine map from the source triangle to the destination triangle.
    const [s0, s1, s2] = s;
    const [d0, d1, d2] = d;
    const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
    const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / det;
    const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / det;
    const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / det;
    const dd = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / det;
    const e = d0.x - a * s0.x - c * s0.y;
    const f = d0.y - b * s0.x - dd * s0.y;
    // Grow the clip a little past the centroid so neighbouring triangles overlap and leave no seams.
    const cx = (d0.x + d1.x + d2.x) / 3;
    const cy = (d0.y + d1.y + d2.y) / 3;
    const grow = (p: Point): Point => {
      const len = Math.hypot(p.x - cx, p.y - cy) || 1;
      return { x: p.x + ((p.x - cx) / len) * 0.8, y: p.y + ((p.y - cy) / len) * 0.8 };
    };
    ctx.save();
    ctx.beginPath();
    const [g0, g1, g2] = [grow(d0), grow(d1), grow(d2)];
    ctx.moveTo(g0.x, g0.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.lineTo(g2.x, g2.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, dd, e, f);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      triangle([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
      triangle([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
  }
}

function tracePolygon(ctx: CanvasRenderingContext2D, quad: Quad): void {
  ctx.beginPath();
  quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

function drawLighting(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  // Warm indoor light, brighter at the top left.
  ctx.globalCompositeOperation = "multiply";
  const warm = ctx.createLinearGradient(0, 0, PHOTO_W, PHOTO_H);
  warm.addColorStop(0, "rgb(255, 246, 228)");
  warm.addColorStop(1, "rgb(205, 180, 150)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  // A soft shadow across the lower left of the page, as from the phone or a hand.
  const shadow = ctx.createRadialGradient(80, 1500, 120, 80, 1500, 900);
  shadow.addColorStop(0, "rgba(60, 50, 45, 0.65)");
  shadow.addColorStop(0.6, "rgba(60, 50, 45, 0.3)");
  shadow.addColorStop(1, "rgba(60, 50, 45, 0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  ctx.restore();
}

/** Draw the sample photo and return it as a JPEG file, ready to add like any chosen photo. */
export async function createSamplePhoto(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_W;
  canvas.height = PHOTO_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the sample photo.");
  drawDesk(ctx);

  // The page's own shadow on the desk.
  ctx.save();
  ctx.shadowColor = "rgba(20, 10, 5, 0.55)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetX = 10;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#f8f6f0";
  tracePolygon(ctx, PAGE_IN_PHOTO);
  ctx.fill();
  ctx.restore();

  drawInPerspective(ctx, drawPage(), PAGE_IN_PHOTO);
  drawLighting(ctx);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("This browser could not create the sample photo.");
  return new File([blob], SAMPLE_FILE_NAME, { type: "image/jpeg", lastModified: Date.now() });
}
