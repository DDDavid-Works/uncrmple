import { useRef, useState, type DragEvent } from "react";
import { isCoarsePointer } from "../../lib/browser/pointer";

interface Props {
  compact: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
}

function PrivacyBadge() {
  return (
    <p className="privacy-badge">
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6H6V4.5a2 2 0 1 1 4 0V7Z" />
      </svg>
      Images stay in your browser. Nothing is uploaded.
    </p>
  );
}

export function UploadZone({ compact, busy, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // On phones the picker also offers the camera; say so without forcing capture.
  const [touch] = useState(isCoarsePointer);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  return (
    <div
      className={`upload${compact ? " upload--compact" : ""}${dragging ? " upload--drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {!compact && (
        <>
          <svg className="upload__icon" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 6h17l9 9v27H12z" />
            <path d="M29 6v9h9" />
            <path d="M25 37V23m-6 6 6-6 6 6" />
          </svg>
          <h2 className="upload__title">
            <mark className="mark">Upload</mark> document photos
          </h2>
          <p className="upload__text">
            {touch
              ? "Choose JPG, PNG, or WebP photos from your device, or take a new one."
              : "Drag and drop JPG, PNG, or WebP images here, or choose files."}
          </p>
        </>
      )}
      <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>
        {compact ? "Add more photos" : touch ? "Choose or take photo" : "Choose photos"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        aria-label="Choose document photos"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      {compact && !touch && <span className="upload__drop-hint">or drop images here</span>}
      {busy && (
        <p role="status" className="upload__status">
          Reading images…
        </p>
      )}
      {!compact && <PrivacyBadge />}
    </div>
  );
}
