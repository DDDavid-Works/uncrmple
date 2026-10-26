import { useRef, useState, type DragEvent } from "react";

interface Props {
  compact: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
}

export function UploadZone({ compact, busy, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
          <h2>Upload document photos</h2>
          <p>Drag and drop JPG, PNG, or WebP images here, or choose files.</p>
        </>
      )}
      <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>
        {compact ? "Add more photos" : "Choose photos"}
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
      {busy && (
        <p role="status" className="upload__status">
          Reading images…
        </p>
      )}
      {!compact && (
        <p className="upload__privacy">Images stay in your browser. Nothing is uploaded.</p>
      )}
    </div>
  );
}
