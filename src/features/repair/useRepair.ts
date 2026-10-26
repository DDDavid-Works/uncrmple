import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileToRaster, rasterToPng } from "../../lib/browser/raster";
import { createOpenCvProcessor } from "../../lib/image-processing/opencv/processor";
import { DEFAULT_ENHANCE_OPTIONS } from "../../lib/image-processing/options";
import { repair } from "../../lib/image-processing/pipeline";
import type { SourceDocument } from "../../types/document";
import type { OutputStyle, Quad, RepairResult } from "../../types/repair";

export interface RepairedView {
  url: string;
  /** The straightened page before cleanup; same size as `url`, so the two can be overlaid. */
  straightenedUrl: string;
  width: number;
  height: number;
  corners: Quad;
  /** How the corners were found; kept when only the output style changes. */
  source: RepairResult["source"];
  style: OutputStyle;
  areaFraction?: number;
  edgeSupport?: number;
}

export type RepairState =
  | { status: "idle" }
  /** `previous` is the last finished result, still shown while a new style is applied. */
  | { status: "running"; previous?: RepairedView }
  | { status: "done"; result: RepairedView }
  | { status: "error"; message: string };

const IDLE: RepairState = { status: "idle" };

export interface RepairApi {
  stateOf: (id: string) => RepairState;
  styleOf: (id: string) => OutputStyle;
  /** Repair with the selected style: detects the page, or reuses the corners of the current result. */
  run: (doc: SourceDocument) => Promise<void>;
  /** Select a style; if the page is already repaired, re-apply it using the same corners. */
  setStyle: (doc: SourceDocument, style: OutputStyle) => void;
  /** Repair with user-chosen corners (source-image pixels) instead of detecting the page. */
  applyCorners: (doc: SourceDocument, corners: Quad) => Promise<void>;
}

/**
 * Runs the repair pipeline per document and owns the object URLs of repaired images.
 * Results for removed documents are discarded, including jobs still in flight, and only the
 * latest job per document may publish a result.
 */
export function useRepair(documents: SourceDocument[]): RepairApi {
  const processor = useMemo(() => createOpenCvProcessor(), []);
  const [states, setStates] = useState<Record<string, RepairState>>({});
  const [styles, setStyles] = useState<Record<string, OutputStyle>>({});
  const statesRef = useRef(states);
  const stylesRef = useRef(styles);
  statesRef.current = states;
  stylesRef.current = styles;
  // Per document: the object URLs of the current result (cleaned and straightened).
  const urls = useRef(new Map<string, { url: string; straightenedUrl: string }>());
  const jobs = useRef(new Map<string, number>());
  const alive = useRef(new Set<string>());

  // Track which documents still exist; free results of removed ones.
  useEffect(() => {
    alive.current = new Set(documents.map((d) => d.id));
    for (const [id, held] of urls.current) {
      if (!alive.current.has(id)) {
        URL.revokeObjectURL(held.url);
        URL.revokeObjectURL(held.straightenedUrl);
        urls.current.delete(id);
        jobs.current.delete(id);
      }
    }
    const keep = <T,>(s: Record<string, T>) => {
      const entries = Object.entries(s).filter(([id]) => alive.current.has(id));
      return entries.length === Object.keys(s).length ? s : Object.fromEntries(entries);
    };
    setStates(keep);
    setStyles(keep);
  }, [documents]);

  useEffect(() => {
    const held = urls.current;
    return () => {
      for (const h of held.values()) {
        URL.revokeObjectURL(h.url);
        URL.revokeObjectURL(h.straightenedUrl);
      }
      held.clear();
    };
  }, []);

  const execute = useCallback(
    async (doc: SourceDocument, style: OutputStyle, reuse?: RepairedView, manual?: Quad) => {
      const job = (jobs.current.get(doc.id) ?? 0) + 1;
      jobs.current.set(doc.id, job);
      const current = () => jobs.current.get(doc.id) === job && alive.current.has(doc.id);
      const set = (state: RepairState) => {
        if (current()) setStates((s) => ({ ...s, [doc.id]: state }));
      };
      const fail = (message: string) => set({ status: "error", message });

      const prior = statesRef.current[doc.id];
      const previous = prior?.status === "done" ? prior.result : prior?.status === "running" ? prior.previous : undefined;
      set({ status: "running", previous });

      const raster = await fileToRaster(doc.file);
      if (!raster.ok) return fail(raster.error.message);

      const repaired = await repair(processor, raster.value, {
        corners: manual ?? reuse?.corners,
        enhance: { style },
      });
      if (!repaired.ok) return fail(repaired.error.message);

      const png = await rasterToPng(repaired.value.image);
      if (!png.ok) return fail(png.error.message);
      // A style change keeps the corners, so the straightened page is unchanged: reuse its encoding.
      const reuseStraightened = reuse && !manual ? urls.current.get(doc.id)?.straightenedUrl : undefined;
      const straightPng = reuseStraightened ? null : await rasterToPng(repaired.value.straightened);
      if (straightPng && !straightPng.ok) return fail(straightPng.error.message);

      if (!current()) return; // removed, or superseded by a newer job
      const url = URL.createObjectURL(png.value);
      const straightenedUrl = straightPng ? URL.createObjectURL(straightPng.value) : reuseStraightened!;
      const old = urls.current.get(doc.id);
      if (old) {
        URL.revokeObjectURL(old.url);
        if (old.straightenedUrl !== straightenedUrl) URL.revokeObjectURL(old.straightenedUrl);
      }
      urls.current.set(doc.id, { url, straightenedUrl });

      const { image, corners } = repaired.value;
      const view: RepairedView = {
        url,
        straightenedUrl,
        width: image.width,
        height: image.height,
        corners,
        // Re-applied corners keep their original detection details.
        source: reuse && !manual ? reuse.source : repaired.value.source,
        style,
        areaFraction: reuse && !manual ? reuse.areaFraction : repaired.value.areaFraction,
        edgeSupport: reuse && !manual ? reuse.edgeSupport : repaired.value.edgeSupport,
      };
      set({ status: "done", result: view });

      // The style changed while the repair was running: apply it with these corners.
      const wanted = stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style;
      if (wanted !== style) void execute(doc, wanted, view);
    },
    [processor],
  );

  const styleOf = useCallback(
    (id: string) => styles[id] ?? DEFAULT_ENHANCE_OPTIONS.style,
    [styles],
  );

  const run = useCallback(
    (doc: SourceDocument) => {
      // "Repair again" starts from the current repaired state, so adjusted corners are kept.
      const state = statesRef.current[doc.id];
      const current = state?.status === "done" ? state.result : state?.status === "running" ? state.previous : undefined;
      return execute(doc, stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style, current);
    },
    [execute],
  );

  const setStyle = useCallback(
    (doc: SourceDocument, style: OutputStyle) => {
      stylesRef.current = { ...stylesRef.current, [doc.id]: style };
      setStyles(stylesRef.current);
      const state = statesRef.current[doc.id];
      if (state?.status === "done") void execute(doc, style, state.result);
      else if (state?.status === "running" && state.previous) void execute(doc, style, state.previous);
      // A first repair still running re-applies the style itself when it finishes.
    },
    [execute],
  );

  const applyCorners = useCallback(
    (doc: SourceDocument, corners: Quad) =>
      execute(doc, stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style, undefined, corners),
    [execute],
  );

  const stateOf = useCallback((id: string) => states[id] ?? IDLE, [states]);
  return { stateOf, styleOf, run, setStyle, applyCorners };
}
