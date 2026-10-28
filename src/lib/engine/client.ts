import type { Result } from "../../types/repair";
import { engineStatus as localStatus, subscribeEngineStatus as subscribeLocal } from "../image-processing/opencv/loader";
import type { EngineStatus } from "../image-processing/opencv/loader";
import { localEngine } from "./jobs";
import type { Engine } from "./jobs";
import type { FromWorker, JobKind, ToWorker } from "./protocol";

/** How long to wait for a new worker to say it can process images before working on the page. */
const HELLO_TIMEOUT_MS = 10_000;

let engine: Engine | null = null;

// Engine loading status as the page sees it: reported by the worker, or by the local loader.
let status: EngineStatus = "idle";
let usingWorker = false;
const listeners = new Set<() => void>();
const setStatus = (next: EngineStatus) => {
  status = next;
  for (const l of listeners) l();
};

/** Whether the image engine is idle, loading, ready or failed, wherever it runs. */
export const engineStatus = (): EngineStatus => (usingWorker ? status : localStatus());

export function subscribeEngineStatus(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribeLocal = subscribeLocal(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeLocal();
  };
}

/**
 * The processing engine for the app. Jobs run in a Web Worker so that processing large photos
 * never freezes the page; where a worker cannot decode and encode images (no OffscreenCanvas,
 * e.g. Safari before 16.4) or fails to start, the same jobs run on the page instead, with the
 * same results.
 */
export function getEngine(): Engine {
  engine ??= canStartWorker() ? workerEngine(startWorker) : localEngine();
  return engine;
}

function canStartWorker(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

const startWorker = () => new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });

/** An engine that runs jobs in the worker `start` creates, or on the page if that worker cannot. Exported for tests. */
export function workerEngine(start: () => Worker, local: () => Engine = localEngine): Engine {
  let fallback: Engine | null = null;
  const onPage = () => (fallback ??= local());
  const pending = new Map<number, (result: Result<unknown>) => void>();
  let nextId = 1;

  let worker: Worker | null = null;
  const ready = new Promise<boolean>((resolve) => {
    try {
      worker = start();
    } catch {
      return resolve(false);
    }
    const timer = setTimeout(() => resolve(false), HELLO_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "hello") {
        clearTimeout(timer);
        usingWorker = m.ok;
        resolve(m.ok);
      } else if (m.type === "status") {
        setStatus(m.status);
      } else {
        pending.get(m.id)?.(m.result);
        pending.delete(m.id);
      }
    };
    worker.onerror = () => {
      clearTimeout(timer);
      resolve(false);
      // A worker that failed mid-job cannot finish it; report rather than leave the job hanging.
      for (const done of pending.values()) done({ ok: false, error: { code: "processing-failed", message: "The image engine stopped unexpectedly. Try again." } });
      pending.clear();
      usingWorker = false;
      worker = null;
    };
  });
  ready.then((ok) => {
    if (!ok) {
      worker?.terminate();
      worker = null;
      usingWorker = false;
    }
  });

  const call = <K extends JobKind>(kind: K, args: Parameters<Engine[K]>): ReturnType<Engine[K]> =>
    ready.then(async (ok) => {
      if (!ok || !worker) return (onPage()[kind] as (...a: unknown[]) => ReturnType<Engine[K]>)(...args);
      const id = nextId++;
      const message: ToWorker = { id, kind, args };
      return new Promise((resolve) => {
        pending.set(id, resolve as (r: Result<unknown>) => void);
        worker!.postMessage(message);
      });
    }) as ReturnType<Engine[K]>;

  return {
    repair: (...a) => call("repair", a),
    assess: (...a) => call("assess", a),
    detectCard: (...a) => call("detectCard", a),
    cropCard: (...a) => call("cropCard", a),
    enhanceCard: (...a) => call("enhanceCard", a),
  };
}
