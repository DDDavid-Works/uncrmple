import { useSyncExternalStore } from "react";

/**
 * First-run tips, each shown once per device. Only the ids of tips already seen are stored, never
 * anything about a photo. Storage can be missing or blocked (private windows, previews), so every
 * access is guarded: without it a tip just shows again on the next visit.
 */
export type TipId = "compare-result";

export const TIPS_STORAGE_KEY = "tips-seen";

function load(): Set<TipId> {
  try {
    const raw = localStorage.getItem(TIPS_STORAGE_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? (ids.filter((i) => typeof i === "string") as TipId[]) : []);
  } catch {
    return new Set();
  }
}

let seen: Set<TipId> | null = null;
const listeners = new Set<() => void>();

function current(): Set<TipId> {
  seen ??= load();
  return seen;
}

function save(next: Set<TipId>): void {
  seen = next;
  try {
    localStorage.setItem(TIPS_STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Remembered for this visit only.
  }
  listeners.forEach((l) => l());
}

export function markTipSeen(id: TipId): void {
  const s = current();
  if (!s.has(id)) save(new Set([...s, id]));
}

/** For tests: forget the in-memory copy so the next read comes from storage. */
export function reloadTips(): void {
  seen = null;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether a tip is still to be shown, and a function that retires it. */
export function useTip(id: TipId): [show: boolean, dismiss: () => void] {
  const show = useSyncExternalStore(subscribe, () => !current().has(id), () => false);
  return [show, () => markTipSeen(id)];
}
