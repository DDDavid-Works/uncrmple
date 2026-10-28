import type { EngineStatus } from "../image-processing/opencv/loader";
import type { Engine } from "./jobs";

export type JobKind = keyof Engine;

/** Page → worker: run one job. */
export interface ToWorker {
  id: number;
  kind: JobKind;
  args: unknown[];
}

/** Worker → page. */
export type FromWorker =
  /** Sent once on start: whether the worker can decode and encode images. */
  | { type: "hello"; ok: boolean }
  | { type: "status"; status: EngineStatus }
  | { type: "result"; id: number; result: Awaited<ReturnType<Engine[JobKind]>> };
