import { useSyncExternalStore } from "react";
import { engineStatus, subscribeEngineStatus } from "../lib/image-processing/opencv/loader";

interface Props {
  /** What is being done, e.g. "Repairing the page…". */
  task: string;
}

/**
 * Progress notice for engine-backed work. The first run also downloads the image engine, which
 * is the slow part, so that step is shown separately until the engine is ready.
 */
export function BusyNotice({ task }: Props) {
  const engine = useSyncExternalStore(subscribeEngineStatus, engineStatus);
  const loading = engine !== "ready";
  return (
    <div role="status" className="notice busy">
      <span className="busy__spinner" aria-hidden="true" />
      <div className="busy__body">
        {loading ? (
          <>
            <p>
              <strong>Loading the image engine…</strong> About 4 MB, first time only; it stays loaded for later photos.
            </p>
            <p className="muted">Then: {task.replace(/…$/, "")}</p>
            <span className="busy__bar" aria-hidden="true" />
          </>
        ) : (
          <p>{task}</p>
        )}
      </div>
    </div>
  );
}
