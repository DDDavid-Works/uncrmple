import type { Point, Quad, RasterImage } from "../types/repair";
import { solid } from "./synthetic";

type Rgb = [number, number, number];

/** Deterministic pseudo-random numbers so fixtures never vary between runs. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function cross(a: Point, b: Point, x: number, y: number) {
  return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
}

/** Fill a convex polygon (either winding). */
export function fillConvex(img: RasterImage, poly: readonly Point[], c: Rgb): void {
  const minX = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.x))));
  const maxX = Math.min(img.width - 1, Math.ceil(Math.max(...poly.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))));
  const maxY = Math.min(img.height - 1, Math.ceil(Math.max(...poly.map((p) => p.y))));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let sign = 0;
      let ok = true;
      for (let i = 0; i < poly.length && ok; i++) {
        const s = Math.sign(cross(poly[i]!, poly[(i + 1) % poly.length]!, x + 0.5, y + 0.5));
        if (s !== 0) {
          if (sign === 0) sign = s;
          else if (s !== sign) ok = false;
        }
      }
      if (!ok) continue;
      const i = (y * img.width + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
}

/** Point at card coordinates (u, v) in 0..1, by bilinear interpolation of the corners. */
export function at(q: Quad, u: number, v: number): Point {
  const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
  const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

/** Sub-rectangle of the card in card coordinates. */
export function sub(q: Quad, u0: number, v0: number, u1: number, v1: number): Point[] {
  return [at(q, u0, v0), at(q, u1, v0), at(q, u1, v1), at(q, u0, v1)];
}

/** Card outline with chamfered corners, approximating rounded ones. */
export function roundedOutline(q: Quad, r = 0.05): Point[] {
  const ru = r, rv = r * 1.5;
  return [
    at(q, ru, 0), at(q, 1 - ru, 0), at(q, 1, rv), at(q, 1, 1 - rv),
    at(q, 1 - ru, 1), at(q, ru, 1), at(q, 0, 1 - rv), at(q, 0, rv),
  ];
}

export interface CardPhotoOptions {
  background?: Rgb;
  card?: Rgb;
  /** Random brightness noise amplitude on the whole photo. */
  noise?: number;
  /** Stripes imitating a wood desk or table texture, with this contrast. */
  stripes?: number;
  /** Polygons (e.g. fingers, other objects) painted over the scene after the card. */
  overlays?: { poly: Point[]; colour: Rgb }[];
  /** Objects painted before the card (clutter behind it). */
  clutter?: { poly: Point[]; colour: Rgb }[];
}

/**
 * A synthetic ID-style card (colour band, photo block, text lines, rounded corners) over a plain or
 * textured background. The card is the given quad; details are placed by bilinear interpolation.
 */
export function cardPhoto(width: number, height: number, card: Quad, o: CardPhotoOptions = {}): RasterImage {
  const bg = o.background ?? [96, 78, 60];
  const body = o.card ?? [235, 238, 228];
  const img = solid(width, height, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const stripe = o.stripes ? Math.sin(y / 5 + Math.sin(x / 40) * 2) * o.stripes : 0;
      const i = (y * width + x) * 4;
      img.data[i] = bg[0] + stripe;
      img.data[i + 1] = bg[1] + stripe;
      img.data[i + 2] = bg[2] + stripe;
    }
  }
  for (const c of o.clutter ?? []) fillConvex(img, c.poly, c.colour);
  fillConvex(img, roundedOutline(card), body);
  fillConvex(img, sub(card, 0.04, 0.05, 0.96, 0.22), [30, 90, 160]); // header band
  fillConvex(img, sub(card, 0.06, 0.32, 0.34, 0.88), [150, 120, 100]); // portrait block
  for (let k = 0; k < 5; k++) {
    fillConvex(img, sub(card, 0.42, 0.34 + k * 0.1, 0.9 - (k % 2) * 0.15, 0.39 + k * 0.1), [50, 50, 60]);
  }
  for (const c of o.overlays ?? []) fillConvex(img, c.poly, c.colour);
  if (o.noise) {
    const rand = rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * 2 * o.noise;
      img.data[i] = img.data[i]! + n;
      img.data[i + 1] = img.data[i + 1]! + n;
      img.data[i + 2] = img.data[i + 2]! + n;
    }
  }
  return img;
}

/** Mean corner distance between two quads, in pixels. */
export function meanCornerError(a: Quad, b: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y);
  return sum / 4;
}

/** Largest corner distance between two quads, in pixels. A mean can hide one badly placed side. */
export function maxCornerError(a: Quad, b: Quad): number {
  return Math.max(...[0, 1, 2, 3].map((i) => Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y)));
}
