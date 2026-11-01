import type { BatchState } from "./useRepair";

interface Props {
  batch: BatchState;
  /** Pages not repaired or tried yet, which "Repair all" would process. */
  pending: number;
  onStart: () => void;
  onStop: () => void;
}

const pages = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

function summary(b: Extract<BatchState, { status: "finished" }>): string {
  const parts = [b.stopped ? `Stopped. Repaired ${b.repaired} of ${pages(b.total)}.` : `Repaired ${b.repaired} of ${pages(b.total)}.`];
  if (b.failed > 0) parts.push(`${pages(b.failed)} could not be repaired; select ${b.failed === 1 ? "it" : "them"} to see why or to set the corners by hand.`);
  return parts.join(" ");
}

/**
 * Shown over the pages while "Repair all" runs. The pages under it are inert, so a click cannot
 * remove, reorder or re-repair a page the batch is about to process.
 */
export function RepairAllLock({ batch }: { batch: Extract<BatchState, { status: "running" }> }) {
  return (
    <div className="lock">
      <div className="lock__card">
        <span className="busy__spinner" aria-hidden="true" />
        <div>
          <p className="lock__title">Repairing your pages</p>
          <p className="muted lock__text">
            {batch.stopping
              ? "Finishing the current page, then the pages are yours again."
              : `Page ${batch.finished + 1} of ${batch.total}. The pages are locked until this finishes so nothing changes mid-repair. Use Stop to end early.`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Repair every remaining page in one go, with progress and a way to stop. */
export function RepairAllBar({ batch, pending, onStart, onStop }: Props) {
  if (batch.status === "running") {
    const { total, finished, stopping } = batch;
    return (
      <section className="batch" aria-label="Repair all pages">
        <div className="batch__row">
          <p role="status" className="batch__status">
            {stopping ? `Stopping after the current page (${finished + 1} of ${total})…` : `Repairing page ${finished + 1} of ${total}…`}
          </p>
          <button type="button" className="btn" onClick={onStop} disabled={stopping}>
            Stop
          </button>
        </div>
        <progress className="batch__progress" value={finished} max={total} aria-label="Pages repaired" />
      </section>
    );
  }

  if (pending === 0 && batch.status === "idle") return null;

  return (
    <section className="batch" aria-label="Repair all pages">
      <div className="batch__row">
        {batch.status === "finished" ? (
          <p role="status" className={batch.failed > 0 ? "batch__status batch__status--warn" : "batch__status"}>
            {summary(batch)}
          </p>
        ) : (
          <p className="batch__status muted">{pages(pending)} not repaired yet.</p>
        )}
        {pending > 0 && (
          <button type="button" className="btn btn--primary" onClick={onStart}>
            Repair all ({pending})
          </button>
        )}
      </div>
    </section>
  );
}
