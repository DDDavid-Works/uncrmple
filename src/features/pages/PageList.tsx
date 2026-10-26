import type { SourceDocument } from "../../types/document";
import type { RepairState } from "../repair/useRepair";
import { needsCheck } from "../repair/review";
import type { CardState } from "../card/useCardCrop";

export type PageTone = "idle" | "busy" | "ok" | "warn" | "error";
export interface PageStatus {
  tone: PageTone;
  label: string;
}

const ICON: Record<PageTone, string> = { idle: "○", busy: "…", ok: "✓", warn: "!", error: "✕" };

export function repairStatus(state: RepairState): PageStatus {
  switch (state.status) {
    case "idle":
      return { tone: "idle", label: "Not repaired" };
    case "running":
      return { tone: "busy", label: "Working" };
    case "error":
      return { tone: "error", label: "Failed" };
    case "done":
      return needsCheck(state.result) ? { tone: "warn", label: "Check result" } : { tone: "ok", label: "Repaired" };
  }
}

export function cardStatus(state: CardState): PageStatus {
  switch (state.status) {
    case "idle":
      return { tone: "idle", label: "Not cropped" };
    case "working":
      return { tone: "busy", label: "Working" };
    case "review":
      return { tone: "warn", label: "Check corners" };
    case "error":
      return { tone: "error", label: "Failed" };
    case "done": {
      const { detection, quality } = state.view;
      const warned = (detection?.warnings.length ?? 0) > 0 || quality.length > 0;
      return warned ? { tone: "warn", label: "Check result" } : { tone: "ok", label: "Cropped" };
    }
  }
}

interface Props {
  documents: SourceDocument[];
  selectedId: string | null;
  statusOf: (id: string) => PageStatus;
  onSelect: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
}

export function PageList({ documents, selectedId, statusOf, onSelect, onMove }: Props) {
  return (
    <ul className="pages" aria-label="Uploaded pages">
      {documents.map((d, i) => {
        const status = statusOf(d.id);
        return (
          <li key={d.id} className="pages__entry">
            <button
              type="button"
              className="pages__item"
              aria-current={d.id === selectedId ? "true" : undefined}
              onClick={() => onSelect(d.id)}
            >
              <img src={d.originalUrl} alt="" />
              <span className="pages__label">
                {i + 1}. {d.name}
              </span>
              <span className={`chip chip--${status.tone}`}>
                <span aria-hidden="true">{ICON[status.tone]}</span>
                {status.label}
              </span>
            </button>
            {documents.length > 1 && (
              <div className="pages__move">
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => onMove(d.id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${d.name} earlier`}
                  title="Move earlier"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => onMove(d.id, 1)}
                  disabled={i === documents.length - 1}
                  aria-label={`Move ${d.name} later`}
                  title="Move later"
                >
                  ↓
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
