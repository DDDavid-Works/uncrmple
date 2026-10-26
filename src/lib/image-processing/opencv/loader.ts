import type { Result } from "../../../types/repair";

export type OpenCv = typeof import("@techstark/opencv-js");

let loading: Promise<Result<OpenCv>> | null = null;

/**
 * Lazily load OpenCV.js (~15 MB raw / ~4 MB gzipped, WASM embedded) the first time it is needed.
 * A failed load is not cached, so the user can retry.
 */
export function loadOpenCv(): Promise<Result<OpenCv>> {
  if (!loading) {
    loading = initialise().then((r) => {
      if (!r.ok) loading = null;
      return r;
    });
  }
  return loading;
}

async function initialise(): Promise<Result<OpenCv>> {
  try {
    // Depending on the build, the export is a promise, ready, or signals via a callback.
    // Do not `await` the module object itself: it exposes a non-standard `then`.
    const exported = (await import("./module")).getOpenCvExport();
    // `instanceof Promise` is true for the emscripten Module here, so check the string tag.
    if (Object.prototype.toString.call(exported) === "[object Promise]") {
      return wrap((await (exported as Promise<unknown>)) as OpenCv);
    }
    const cv = exported as OpenCv;
    if (!(cv as { Mat?: unknown }).Mat) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 60_000);
        (cv as { onRuntimeInitialized?: () => void }).onRuntimeInitialized = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    return wrap(cv);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "engine-unavailable",
        message: `The image-processing engine could not be loaded${e instanceof Error ? ` (${e.message})` : ""}. Check your connection and try again.`,
      },
    };
  }
}

/** Boxed so the thenable OpenCV module is never the direct resolution value of a promise. */
const wrap = (cv: OpenCv): Result<OpenCv> => ({ ok: true, value: cv });
