import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileToRaster, rasterToPng } from "../../lib/browser/raster";
import { hasCardEnhancement, NO_CARD_ENHANCEMENT } from "../../lib/image-processing/card-options";
import { detectCardCorners } from "../../lib/image-processing/card-pipeline";
import { measureCardQuality } from "../../lib/image-processing/card-quality";
import { validateQuad } from "../../lib/image-processing/geometry";
import { createOpenCvProcessor } from "../../lib/image-processing/opencv/processor";
import { validateRaster } from "../../lib/image-processing/pipeline";
import type { SourceDocument } from "../../types/document";
import type { CardDetection, CardEnhanceOptions, CardQualityIssue, Quad, RasterImage } from "../../types/repair";

export interface CardView {
  /** Current output: the crop with the selected touch-ups, or the plain crop when none are selected. */
  url: string;
  /** The crop alone, so the geometry can be judged separately from any enhancement. */
  cropUrl: string;
  width: number;
  height: number;
  /** Corners used, in source-photo pixels. */
  corners: Quad;
  /** Set when the corners came from automatic detection and were not moved by the user. */
  detection: CardDetection | null;
  /** Touch-ups applied to `url`. */
  enhance: CardEnhanceOptions;
  /** Problems enhancement cannot fix (measured on the crop). */
  quality: CardQualityIssue[];
  /** True while touch-ups are being applied; the previous output stays visible. */
  enhancing?: boolean;
  /** Set if the last touch-up failed; the plain crop is shown. */
  enhanceError?: string;
}

export type CardState =
  | { status: "idle" }
  | { status: "working"; step: "detecting" | "cropping" }
  /** Corners need the user's attention: a low-confidence detection, or none at all. */
  | { status: "review"; corners: Quad; detection: CardDetection | null; failure?: string; previous?: CardView }
  | { status: "done"; view: CardView }
  /** Something other than "no card found" went wrong; manual placement is still possible. */
  | { status: "error"; message: string };

const IDLE: CardState = { status: "idle" };

export interface CardCropApi {
  stateOf: (id: string) => CardState;
  /** Touch-ups chosen for a card (all off by default). */
  enhanceOf: (id: string) => CardEnhanceOptions;
  /** Find the card automatically. A confident detection is cropped at once; others go to review. */
  detect: (doc: SourceDocument) => Promise<void>;
  /** Crop with user-confirmed corners (source-photo pixels). */
  crop: (doc: SourceDocument, corners: Quad, detection: CardDetection | null) => Promise<void>;
  /** Choose touch-ups; if the card is already cropped they are applied to the existing crop. */
  setEnhance: (doc: SourceDocument, options: CardEnhanceOptions) => Promise<void>;
  /** Open the corner editor, starting from the current corners when there are any. */
  adjust: (doc: SourceDocument, fallback: Quad) => void;
  /** Leave the corner editor: back to the last crop, or to the start. */
  cancelReview: (id: string) => void;
  /** Discard the crop and return to the untouched original. */
  reset: (id: string) => void;
}

interface Urls { crop?: string; enhanced?: string }

/**
 * Card detection, cropping and optional touch-ups per document. Owns the object URLs and the
 * cropped pixel buffers; both are released on reset, removal and unmount. Results for removed
 * documents are discarded, including jobs in flight, and only the latest job per document may
 * publish. The full-size photo is decoded per job and not kept.
 */
export function useCardCrop(documents: SourceDocument[]): CardCropApi {
  const processor = useMemo(() => createOpenCvProcessor(), []);
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [enhances, setEnhances] = useState<Record<string, CardEnhanceOptions>>({});
  const statesRef = useRef(states);
  const enhancesRef = useRef(enhances);
  statesRef.current = states;
  enhancesRef.current = enhances;
  const urls = useRef(new Map<string, Urls>());
  /** Cropped card pixels, kept so touch-ups do not repeat detection and warping. */
  const crops = useRef(new Map<string, RasterImage>());
  const jobs = useRef(new Map<string, number>());
  const alive = useRef(new Set<string>());

  const release = useCallback((id: string) => {
    const u = urls.current.get(id);
    if (u?.crop) URL.revokeObjectURL(u.crop);
    if (u?.enhanced) URL.revokeObjectURL(u.enhanced);
    urls.current.delete(id);
    crops.current.delete(id);
  }, []);

  useEffect(() => {
    alive.current = new Set(documents.map((d) => d.id));
    for (const id of [...urls.current.keys(), ...crops.current.keys()]) {
      if (!alive.current.has(id)) {
        release(id);
        jobs.current.delete(id);
      }
    }
    const keep = <T,>(s: Record<string, T>) => {
      const kept = Object.entries(s).filter(([id]) => alive.current.has(id));
      return kept.length === Object.keys(s).length ? s : Object.fromEntries(kept);
    };
    setStates(keep);
    setEnhances(keep);
  }, [documents, release]);

  useEffect(() => {
    const held = urls.current;
    const heldCrops = crops.current;
    return () => {
      for (const u of held.values()) {
        if (u.crop) URL.revokeObjectURL(u.crop);
        if (u.enhanced) URL.revokeObjectURL(u.enhanced);
      }
      held.clear();
      heldCrops.clear();
    };
  }, []);

  /** Start a job for a document; the helpers ignore results once superseded or removed. */
  const begin = useCallback((id: string) => {
    const job = (jobs.current.get(id) ?? 0) + 1;
    jobs.current.set(id, job);
    const current = () => jobs.current.get(id) === job && alive.current.has(id);
    const set = (state: CardState) => {
      if (current()) setStates((s) => ({ ...s, [id]: state }));
    };
    return { current, set };
  }, []);
  type Job = ReturnType<typeof begin>;

  const lastView = (id: string): CardView | undefined => {
    const s = statesRef.current[id];
    if (s?.status === "done") return s.view;
    if (s?.status === "review") return s.previous;
    return undefined;
  };

  /**
   * Turn the stored crop into the displayed output: the crop itself, or the crop with touch-ups.
   * A failed touch-up leaves the plain crop showing, with the reason attached; it is never
   * reported as applied.
   */
  const publish = useCallback(
    async (
      id: string,
      job: Job,
      base: Pick<CardView, "corners" | "detection" | "quality">,
      options: CardEnhanceOptions,
    ) => {
      const crop = crops.current.get(id);
      const u = urls.current.get(id);
      if (!crop || !u?.crop) return job.set({ status: "error", message: "The cropped card is no longer available." });
      const cropUrl = u.crop;
      const view: CardView = { ...base, url: cropUrl, cropUrl, width: crop.width, height: crop.height, enhance: NO_CARD_ENHANCEMENT };
      if (!hasCardEnhancement(options)) {
        if (u.enhanced) URL.revokeObjectURL(u.enhanced);
        urls.current.set(id, { crop: cropUrl });
        return job.set({ status: "done", view });
      }
      // Keep showing the previous output while the touch-ups run.
      const shown = lastView(id);
      if (shown) job.set({ status: "done", view: { ...shown, enhancing: true } });

      const enhanced = await processor.enhanceCard(crop, options);
      const png = enhanced.ok ? await rasterToPng(enhanced.value) : null;
      if (!job.current()) return;
      if (!enhanced.ok || !png || !png.ok) {
        const message = !enhanced.ok ? enhanced.error.message : png && !png.ok ? png.error.message : "Encoding failed.";
        return job.set({ status: "done", view: { ...view, enhanceError: message } });
      }
      const url = URL.createObjectURL(png.value);
      if (u.enhanced) URL.revokeObjectURL(u.enhanced);
      urls.current.set(id, { crop: cropUrl, enhanced: url });
      job.set({ status: "done", view: { ...view, url, enhance: options } });
    },
    [processor],
  );

  const cropWith = useCallback(
    async (doc: SourceDocument, corners: Quad, detection: CardDetection | null, job: Job) => {
      job.set({ status: "working", step: "cropping" });
      const raster = await fileToRaster(doc.file);
      if (!raster.ok) return job.set({ status: "error", message: raster.error.message });
      const warped = await processor.correctPerspective(raster.value, corners);
      if (!warped.ok) return job.set({ status: "error", message: warped.error.message });
      const png = await rasterToPng(warped.value);
      if (!png.ok) return job.set({ status: "error", message: png.error.message });
      if (!job.current()) return;

      release(doc.id);
      crops.current.set(doc.id, warped.value);
      urls.current.set(doc.id, { crop: URL.createObjectURL(png.value) });
      await publish(
        doc.id,
        job,
        { corners, detection, quality: measureCardQuality(warped.value) },
        enhancesRef.current[doc.id] ?? NO_CARD_ENHANCEMENT,
      );
    },
    [processor, publish, release],
  );

  const detect = useCallback(
    async (doc: SourceDocument) => {
      const job = begin(doc.id);
      const previous = lastView(doc.id);
      job.set({ status: "working", step: "detecting" });
      const raster = await fileToRaster(doc.file);
      if (!raster.ok) return job.set({ status: "error", message: raster.error.message });
      const valid = validateRaster(raster.value);
      if (!valid.ok) return job.set({ status: "error", message: valid.error.message });

      const found = await detectCardCorners(processor, raster.value);
      if (!found.ok) {
        if (found.error.code === "no-card-found") {
          return job.set({
            status: "review",
            corners: defaultCardCorners(doc.width, doc.height),
            detection: null,
            failure: found.error.message,
            previous,
          });
        }
        return job.set({ status: "error", message: found.error.message });
      }
      if (!job.current()) return;
      const check = validateQuad(found.value.corners, doc.width, doc.height);
      if (!check.ok) {
        return job.set({
          status: "review",
          corners: defaultCardCorners(doc.width, doc.height),
          detection: null,
          failure: "The detected outline was not usable.",
          previous,
        });
      }
      // Only a confident detection is applied without the user looking at the corners first.
      if (found.value.level === "ready") return cropWith(doc, found.value.corners, found.value, job);
      job.set({ status: "review", corners: found.value.corners, detection: found.value, previous });
    },
    [begin, cropWith, processor],
  );

  const crop = useCallback(
    (doc: SourceDocument, corners: Quad, detection: CardDetection | null) => cropWith(doc, corners, detection, begin(doc.id)),
    [begin, cropWith],
  );

  const setEnhance = useCallback(
    async (doc: SourceDocument, options: CardEnhanceOptions) => {
      enhancesRef.current = { ...enhancesRef.current, [doc.id]: options };
      setEnhances(enhancesRef.current);
      const s = statesRef.current[doc.id];
      if (s?.status !== "done") return; // applied when the card is cropped
      const { corners, detection, quality } = s.view;
      await publish(doc.id, begin(doc.id), { corners, detection, quality }, options);
    },
    [begin, publish],
  );

  const adjust = useCallback((doc: SourceDocument, fallback: Quad) => {
    const s = statesRef.current[doc.id];
    const view = s?.status === "done" ? s.view : undefined;
    jobs.current.set(doc.id, (jobs.current.get(doc.id) ?? 0) + 1); // supersede anything in flight
    setStates((all) => ({
      ...all,
      [doc.id]: { status: "review", corners: view?.corners ?? fallback, detection: view?.detection ?? null, previous: view },
    }));
  }, []);

  const cancelReview = useCallback((id: string) => {
    const s = statesRef.current[id];
    if (s?.status !== "review") return;
    setStates((all) => ({ ...all, [id]: s.previous ? { status: "done", view: s.previous } : IDLE }));
  }, []);

  const reset = useCallback(
    (id: string) => {
      jobs.current.set(id, (jobs.current.get(id) ?? 0) + 1);
      release(id);
      setStates((all) => ({ ...all, [id]: IDLE }));
    },
    [release],
  );

  const stateOf = useCallback((id: string) => states[id] ?? IDLE, [states]);
  const enhanceOf = useCallback((id: string) => enhances[id] ?? NO_CARD_ENHANCEMENT, [enhances]);
  return { stateOf, enhanceOf, detect, crop, setEnhance, adjust, cancelReview, reset };
}

/** Starting corners for manual placement: a card-proportioned (1.586) box centred in the photo. */
export function defaultCardCorners(width: number, height: number): Quad {
  const ratio = 1.586;
  let w = width * 0.7;
  let h = w / ratio;
  if (h > height * 0.7) {
    h = height * 0.7;
    w = h * ratio;
  }
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}
