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

      if (!current()) return; // removed, or superseded by a newer job
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
        deskew: repaired.value.deskew,
        dewarp: repaired.value.dewarp,
      };
      set({ status: "done", result: view });

      // The style or turn changed while the repair was running: apply it with these corners.
      const wanted = stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style;
      if (wanted !== style || (rotations.current[doc.id] ?? 0) !== rotation) void execute(doc, wanted, view);
    },
    [engine],
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
    (doc: SourceDocument, corners: Quad) =>
      execute(doc, stylesRef.current[doc.id] ?? DEFAULT_ENHANCE_OPTIONS.style, undefined, corners),
    [execute],
  );

  const stateOf = useCallback((id: string) => states[id] ?? IDLE, [states]);
  return { stateOf, styleOf, run, setStyle, rotate, applyCorners };
}
