import { useEffect, useRef, useState } from "react";
import { RemoveButton } from "../../components/RemoveButton";
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
  /** Move a page to a new position (0-based). */
  onMove: (id: string, to: number) => void;
  onRemove: (id: string) => void;
}

/** A press becomes a drag once the pointer has moved this far, so a click still selects the page. */
const DRAG_START_PX = 6;

interface Drag {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  active: boolean;
}

/**
 * The pages in export order. A page is reordered by dragging it (with a mouse, anywhere on it; on a
 * touch screen, by its grip, so a swipe still scrolls the strip of pages) or, from its grip, with
 * the arrow keys. Each page can also be removed from here.
 */
export function PageList({ documents, selectedId, statusOf, onSelect, onMove, onRemove }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // A page moved with the keyboard keeps focus on its grip after the list re-renders.
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(id)}"] .pages__grip`)?.focus();
  }, [documents]);

  const announce = (id: string, to: number) => {
    const doc = documents.find((d) => d.id === id);
    if (doc) setAnnouncement(`${doc.name} moved to position ${to + 1} of ${documents.length}.`);
  };

  /** Where the dragged page belongs: before the first other page whose middle is past the pointer. */
  const dropIndex = (id: string, x: number, y: number): number => {
    const entries = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-page-id]") ?? [])];
    const others = entries.filter((e) => e.dataset.pageId !== id).map((e) => e.getBoundingClientRect());
    if (others.length === 0) return 0;
    // A row of pages (phone strip) or a column (sidebar).
    const all = entries.map((e) => e.getBoundingClientRect());
    const across = all.length > 1 && Math.abs(all[1]!.top - all[0]!.top) < Math.abs(all[1]!.left - all[0]!.left);
    return others.filter((r) => (across ? r.left + r.width / 2 < x : r.top + r.height / 2 < y)).length;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLUListElement>) => {
    if (documents.length < 2 || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const entry = target.closest<HTMLElement>("[data-page-id]");
    if (!entry || target.closest(".pages__remove")) return;
    if (e.pointerType === "touch" && !target.closest(".pages__grip")) return;
    drag.current = { id: entry.dataset.pageId!, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_START_PX) return;
      d.active = true;
      // Keep receiving the pointer when it leaves the list; dragging still works within it if refused.
      try {
        listRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is no longer active */
      }
      setDragging(d.id);
    }
    e.preventDefault();
    const to = dropIndex(d.id, e.clientX, e.clientY);
    if (to !== documents.findIndex((x) => x.id === d.id)) onMove(d.id, to);
  };

  const endDrag = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    // The click that ends a drag must not also select the page.
    dragged.current = true;
    setDragging(null);
    announce(d.id, documents.findIndex((x) => x.id === d.id));
  };

  const onGripKey = (e: React.KeyboardEvent, id: string, i: number) => {
    const to =
      e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1
      : e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1
      : e.key === "Home" ? 0
      : e.key === "End" ? documents.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= documents.length || to === i) return;
    refocus.current = id;
    onMove(id, to);
    announce(id, to);
  };

  return (
    <>
      <ul
        ref={listRef}
        className={["pages", documents.length > 1 && "pages--sortable", dragging && "pages--dragging"].filter(Boolean).join(" ")}
        aria-label="Uploaded photos"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (!dragged.current) return;
          dragged.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {documents.map((d, i) => {
          const status = statusOf(d.id);
          return (
            <li key={d.id} className={d.id === dragging ? "pages__entry pages__entry--dragging" : "pages__entry"} data-page-id={d.id}>
              <button
                type="button"
                className="pages__item"
                aria-current={d.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(d.id)}
              >
                <img src={d.originalUrl} alt="" draggable={false} />
                <span className="pages__label" title={d.name}>
                  {i + 1}. {d.name}
                </span>
                <span className={`chip chip--${status.tone}`}>
                  <span aria-hidden="true">{ICON[status.tone]}</span>
                  {status.label}
                </span>
              </button>
              {documents.length > 1 && (
                <button
                  type="button"
                  className="pages__grip"
                  aria-label={`Reorder ${d.name}, photo ${i + 1} of ${documents.length}`}
                  aria-describedby="pages-reorder-hint"
                  title="Drag to reorder"
                  onKeyDown={(e) => onGripKey(e, d.id, i)}
                >
                  <svg viewBox="0 0 10 16" aria-hidden="true">
                    {[3, 8, 13].map((y) => [3, 7].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
                  </svg>
                </button>
              )}
              <div className="pages__tools">
                <span className="pages__remove">
                  <RemoveButton name={d.name} onRemove={() => onRemove(d.id)} compact />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p id="pages-reorder-hint" className="visually-hidden">
        Drag a photo, or use the arrow keys on its grip, to change the order. The PDF follows this order.
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
