import { useEffect, useMemo, useRef, useState } from "react";
import { fileToRaster } from "../../lib/browser/raster";
import { assessPhoto } from "../../lib/image-processing/assessment/assess";
import { createOpenCvProcessor } from "../../lib/image-processing/opencv/processor";
import type { Assessment } from "../../types/assessment";
import type { SourceDocument } from "../../types/document";

export type AssessmentState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; assessment: Assessment }
  | { status: "error"; message: string };

const IDLE: AssessmentState = { status: "idle" };

/**
 * Assesses each document once, as soon as it is added. Photos are analysed one at a time to
 * limit memory use; results for removed documents are discarded.
 */
export function useAssessment(documents: SourceDocument[]): (id: string) => AssessmentState {
  const processor = useMemo(() => createOpenCvProcessor(), []);
  const [states, setStates] = useState<Record<string, AssessmentState>>({});
  const started = useRef(new Set<string>());
  const alive = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    alive.current = new Set(documents.map((d) => d.id));
    for (const id of started.current) if (!alive.current.has(id)) started.current.delete(id);
    setStates((s) => {
      const kept = Object.entries(s).filter(([id]) => alive.current.has(id));
      return kept.length === Object.keys(s).length ? s : Object.fromEntries(kept);
    });

    for (const doc of documents) {
      if (started.current.has(doc.id)) continue;
      started.current.add(doc.id);
      setStates((s) => ({ ...s, [doc.id]: { status: "running" } }));
      queue.current = queue.current.then(async () => {
        if (!alive.current.has(doc.id)) return;
        const finish = (state: AssessmentState) => {
          if (alive.current.has(doc.id)) setStates((s) => ({ ...s, [doc.id]: state }));
        };
        try {
          const raster = await fileToRaster(doc.file);
          if (!raster.ok) return finish({ status: "error", message: raster.error.message });
          const result = await assessPhoto(processor, raster.value);
          finish(result.ok ? { status: "done", assessment: result.value } : { status: "error", message: result.error.message });
        } catch (e) {
          finish({ status: "error", message: e instanceof Error ? e.message : "Unexpected error while analysing the photo." });
        }
      });
    }
  }, [documents, processor]);

  return (id) => states[id] ?? IDLE;
}
