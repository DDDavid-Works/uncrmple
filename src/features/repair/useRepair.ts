import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEngine } from "../../lib/engine/client";
import { DEFAULT_ENHANCE_OPTIONS } from "../../lib/image-processing/options";
import type { SourceDocument } from "../../types/document";
import { addQuarterTurn } from "../../lib/image-processing/rotate";
import type { OutputStyle, Quad, QuarterTurn, RepairResult } from "../../types/repair";

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
  /** Clockwise turn applied to the finished page. */
  rotation: QuarterTurn;
  areaFraction?: number;
  edgeSupport?: number;
  /** The weak outline set aside for a whole-image result (see RepairResult.detectedOutline). */
  detectedOutline?: Quad;
  /** Residual tilt of the print and whether it was levelled. */
  deskew: RepairResult["deskew"];
  /** Whether curved lines were flattened, and why not. */
  dewarp: RepairResult["dewarp"];
}

export type RepairState =
  | { status: "idle" }
  /** `previous` is the last finished result, still shown while a new style is applied. */
  | { status: "running"; previous?: RepairedView }
  | { status: "done"; result: RepairedView }
  | { status: "error"; message: string };

const IDLE: RepairState = { status: "idle" };

/** Progress of "Repair all": pages are repaired one at a time, in page order. */
export type BatchState =
  | { status: "idle" }
  /** `stopping`: no further pages start; the page in progress still finishes. */
  | { status: "running"; total: number; finished: number; stopping: boolean }
  | { status: "finished"; total: number; repaired: number; failed: number; stopped: boolean };

const NO_BATCH: BatchState = { status: "idle" };

/** How one repair job ended; `superseded` when it was replaced by a newer job or the page was removed. */
type Outcome = "done" | "error" | "superseded";

export interface RepairApi {
  stateOf: (id: string) => RepairState;
  styleOf: (id: string) => OutputStyle;
  /** Repair with the selected style: detects the page, or reuses the corners of the current result. */
  run: (doc: SourceDocument) => Promise<void>;
  /** Select a style; if the page is already repaired, re-apply it using the same corners. */
  setStyle: (doc: SourceDocument, style: OutputStyle) => void;
  /** Turn the repaired page a further 90° clockwise (90) or anticlockwise (-90), re-applying the repair with the same corners. */
  rotate: (doc: SourceDocument, by: 90 | -90) => void;
  /** Repair with user-chosen corners (source-image pixels) instead of detecting the page. */
  applyCorners: (doc: SourceDocument, corners: Quad) => Promise<void>;
  /** Repair every page given that has not been repaired or tried yet, one at a time. */
  repairAll: (docs: SourceDocument[]) => Promise<void>;
  /** Start no further pages of "Repair all". */
  stopAll: () => void;
  batch: BatchState;
}

/**
 * Runs the repair pipeline per document and owns the object URLs of repaired images.
 * Results for removed documents are discarded, including jobs still in flight, and only the
 * latest job per document may publish a result.
 */
export function useRepair(documents: SourceDocument[]): RepairApi {
  const engine = useMemo(() => getEngine(), []);
  const [states, setStates] = useState<Record<string, RepairState>>({});
  const [styles, setStyles] = useState<Record<string, OutputStyle>>({});
  // Kept in a ref only: the rotation shows through the result it produces.
  const rotations = useRef<Record<string, QuarterTurn>>({});
  const statesRef = useRef(states);
  const stylesRef = useRef(styles);
  statesRef.current = states;
  stylesRef.current = styles;
  // Per document: the object URLs of the current result (cleaned and straightened).
  const urls = useRef(new Map<string, { url: string; straightenedUrl: string }>());
  const jobs = useRef(new Map<string, number>());
  const alive = useRef(new Set<string>());
  const [batch, setBatch] = useState<BatchState>(NO_BATCH);
  // Set to stop a running "Repair all"; a new batch gets a new token.
  const batchToken = useRef<{ stop: boolean } | null>(null);

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
    for (const id of Object.keys(rotations.current)) if (!alive.current.has(id)) delete rotations.current[id];
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
      if (batchToken.current) batchToken.current.stop = true;
      for (const h of held.values()) {
        URL.revokeObjectURL(h.url);
        URL.revokeObjectURL(h.straightenedUrl);
      }
      held.clear();
    };
  }, []);

  const execute = useCallback(
    async (doc: SourceDocument, style: OutputStyle, reuse?: RepairedView, manual?: Quad): Promise<Outcome> => {
      const job = (jobs.current.get(doc.id) ?? 0) + 1;
      jobs.current.set(doc.id, job);
      const current = () => jobs.current.get(doc.id) === job && alive.current.has(doc.id);
      const set = (state: RepairState) => {
        if (current()) setStates((s) => ({ ...s, [doc.id]: state }));
      };
      const fail = (message: string): Outcome => {
        if (!current()) return "superseded";
        set({ status: "error", message });
        return "error";
      };

      const rotation = rotations.current[doc.id] ?? 0;
      const prior = statesRef.current[doc.id];
      const previous = prior?.status === "done" ? prior.result : prior?.status === "running" ? prior.previous : undefined;
      set({ status: "running", previous });

      // A style change keeps the corners and turn, so the straightened page is unchanged: reuse its encoding.
      const reuseStraightened = reuse && !manual && reuse.rotation === rotation ? urls.current.get(doc.id)?.straightenedUrl : undefined;
      const repaired = await engine.repair({
        file: doc.file,
        corners: manual ?? reuse?.corners,
        style,
        rotate: rotation,
        straightened: !reuseStraightened,
      });
      if (!repaired.ok) return fail(repaired.error.message);

      if (!current()) return "superseded"; // removed, or superseded by a newer job
      const { png, straightenedPng } = repaired.value;
      const url = URL.createObjectURL(png);
      const straightenedUrl = straightenedPng ? URL.createObjectURL(straightenedPng) : reuseStraightened!;
      const old = urls.current.get(doc.id);
      if (old) {
        URL.revokeObjectURL(old.url);
        if (old.straightenedUrl !== straightenedUrl) URL.revokeObjectURL(old.straightenedUrl);
      }
      urls.current.set(doc.id, { url, straightenedUrl });

      const { width, height, corners } = repaired.value;
      const view: RepairedView = {
        url,
        straightenedUrl,
        width,
        height,
        corners,
        // Re-applied corners keep their original detection details.
        source: reuse && !manual ? reuse.source : repaired.value.source,
        style,
        rotation,
        areaFraction: reuse && !manual ? reuse.areaFraction : repaired.value.areaFraction,
        edgeSupport: reuse && !manual ? reuse.edgeSupport : repaired.value.edgeSupport,
        detectedOutline: reuse && !manual ? reuse.detectedOutline : repaired.value.detectedOutline,
        deskew: repaired.value.deskew,
        dewarp: repaired.value.dewarp,
      };
      set({ status: "done", result: view });

      // The style or turn changed while the repair was running: apply it with these corners.
      const wanted = stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style;
      if (wanted !== style || (rotations.current[doc.id] ?? 0) !== rotation) void execute(doc, wanted, view);
      return "done";
    },
    [engine],
  );

  const styleOf = useCallback(
    (id: string) => styles[id] ?? DEFAULT_ENHANCE_OPTIONS.style,
    [styles],
  );

  const run = useCallback(
    async (doc: SourceDocument) => {
      // "Repair again" starts from the current repaired state, so adjusted corners are kept.
      const state = statesRef.current[doc.id];
      const current = state?.status === "done" ? state.result : state?.status === "running" ? state.previous : undefined;
      await execute(doc, stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style, current);
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

  const rotate = useCallback(
    (doc: SourceDocument, by: 90 | -90) => {
      const state = statesRef.current[doc.id];
      const shown = state?.status === "done" ? state.result : state?.status === "running" ? state.previous : undefined;
      if (!shown) return; // nothing repaired yet to turn
      rotations.current = { ...rotations.current, [doc.id]: addQuarterTurn(rotations.current[doc.id] ?? 0, by) };
      // A job in flight picks up the new turn when it finishes.
      if (state?.status === "done") void execute(doc, stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style, shown);
    },
    [execute],
  );

  const applyCorners = useCallback(
    async (doc: SourceDocument, corners: Quad) => {
      await execute(doc, stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style, undefined, corners);
    },
    [execute],
  );

  const repairAll = useCallback(
    async (docs: SourceDocument[]) => {
      if (batchToken.current) return; // one batch at a time
      // Failed pages are left out: detecting again gives the same result, they need corners set by hand.
      const todo = docs.filter((d) => (statesRef.current[d.id] ?? IDLE).status === "idle");
      if (todo.length === 0) return;
      const token = { stop: false };
      batchToken.current = token;
      let finished = 0;
      let repaired = 0;
      let failed = 0;
      setBatch({ status: "running", total: todo.length, finished, stopping: false });
      for (const doc of todo) {
        if (token.stop) break;
        // Removed, or repaired by hand, since the batch started.
        const skip = !alive.current.has(doc.id) || (statesRef.current[doc.id] ?? IDLE).status !== "idle";
        if (!skip) {
          const outcome = await execute(doc, stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style);
          if (outcome === "done") repaired++;
          else if (outcome === "error") failed++;
        }
        finished++;
        if (!token.stop) setBatch({ status: "running", total: todo.length, finished, stopping: false });
      }
      batchToken.current = null;
      setBatch({ status: "finished", total: todo.length, repaired, failed, stopped: finished < todo.length });
    },
    [execute],
  );

  const stopAll = useCallback(() => {
    const token = batchToken.current;
    if (!token || token.stop) return;
    token.stop = true;
    setBatch((b) => (b.status === "running" ? { ...b, stopping: true } : b));
  }, []);

  const stateOf = useCallback((id: string) => states[id] ?? IDLE, [states]);
  return { stateOf, styleOf, run, setStyle, rotate, applyCorners, repairAll, stopAll, batch };
}
