import { useCallback, useEffect, useRef, useState } from "react";
import { probeImage } from "../../lib/files/decode";
import { MAX_FILES } from "../../lib/files/limits";
import { validateImageFile } from "../../lib/files/validate";
import type { RejectedFile, SourceDocument } from "../../types/document";

let nextId = 0;
const newId = () => `doc-${++nextId}`;

export interface DocumentsApi {
  documents: SourceDocument[];
  rejected: RejectedFile[];
  /** Number of files currently being validated/decoded. */
  pending: number;
  addFiles: (files: File[]) => Promise<void>;
  remove: (id: string) => void;
  move: (id: string, delta: -1 | 1) => void;
  dismissRejected: (id: string) => void;
}

/**
 * Owns uploaded documents and the lifecycle of their object URLs.
 * Source files are only read, never modified; URLs are revoked on removal and unmount.
 */
export function useDocuments(): DocumentsApi {
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [pending, setPending] = useState(0);

  const live = useRef<SourceDocument[]>([]);
  live.current = documents;
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      for (const d of live.current) URL.revokeObjectURL(d.originalUrl);
    };
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    let room = MAX_FILES - live.current.length;
    for (const file of files) {
      if (room <= 0) {
        setRejected((r) => [
          ...r,
          { id: newId(), name: file.name, reason: `Only ${MAX_FILES} images can be open at once.` },
        ]);
        continue;
      }
      room--;
      setPending((n) => n + 1);
      try {
        const result = await validateImageFile(file);
        if (!result.ok) {
          setRejected((r) => [...r, { id: newId(), name: file.name, reason: result.reason }]);
          room++;
          continue;
        }
        const url = URL.createObjectURL(file);
        try {
          const { width, height } = await probeImage(url);
          if (unmounted.current) {
            URL.revokeObjectURL(url);
            return;
          }
          const doc: SourceDocument = {
            id: newId(),
            name: file.name,
            size: file.size,
            format: result.format,
            width,
            height,
            file,
            originalUrl: url,
          };
          setDocuments((d) => [...d, doc]);
        } catch (e) {
          URL.revokeObjectURL(url);
          room++;
          const reason = e instanceof Error ? e.message : "The image could not be decoded.";
          setRejected((r) => [...r, { id: newId(), name: file.name, reason }]);
        }
      } finally {
        setPending((n) => n - 1);
      }
    }
  }, []);

  const remove = useCallback((id: string) => {
    const doc = live.current.find((d) => d.id === id);
    if (doc) URL.revokeObjectURL(doc.originalUrl);
    setDocuments((d) => d.filter((x) => x.id !== id));
  }, []);

  /** Move a page one position earlier (-1) or later (+1); the PDF follows this order. */
  const move = useCallback((id: string, delta: -1 | 1) => {
    setDocuments((docs) => {
      const from = docs.findIndex((d) => d.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= docs.length) return docs;
      const next = [...docs];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
  }, []);

  const dismissRejected = useCallback(
    (id: string) => setRejected((r) => r.filter((x) => x.id !== id)),
    [],
  );

  return { documents, rejected, pending, addFiles, remove, move, dismissRejected };
}
