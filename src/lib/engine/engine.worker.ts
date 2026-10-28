import { processingFailed } from "../image-processing/opencv/detect";
import { engineStatus, subscribeEngineStatus } from "../image-processing/opencv/loader";
import { localEngine } from "./jobs";
import type { Engine } from "./jobs";
import type { FromWorker, ToWorker } from "./protocol";

/**
 * Runs processing jobs off the page's main thread, so the page stays responsive. Jobs run one at
 * a time: together they could hold several full-size photos in memory at once.
 */
/** The parts of the worker's global scope used here (the project compiles against DOM types). */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const post = (message: FromWorker, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
const engine = localEngine();
let queue: Promise<void> = Promise.resolve();

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const { id, kind, args } = e.data;
  queue = queue.then(async () => {
    let result: Awaited<ReturnType<Engine[typeof kind]>>;
    try {
      result = await (engine[kind] as (...a: unknown[]) => ReturnType<Engine[typeof kind]>)(...args);
    } catch (err) {
      result = processingFailed("Processing failed", err);
    }
    // A cropped card's pixels move to the page rather than being copied.
    const transfer = kind === "cropCard" && result.ok ? [(result.value as { crop: { data: Uint8ClampedArray } }).crop.data.buffer] : [];
    post({ type: "result", id, result }, transfer);
  });
};

subscribeEngineStatus(() => post({ type: "status", status: engineStatus() }));

/** Decoding and encoding here need a 2D OffscreenCanvas and createImageBitmap. */
function canProcess(): boolean {
  try {
    return typeof createImageBitmap === "function" && new OffscreenCanvas(1, 1).getContext("2d") !== null;
  } catch {
    return false;
  }
}
post({ type: "hello", ok: canProcess() });
