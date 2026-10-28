import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { isCoarsePointer } from "../../lib/browser/pointer";
import { validateQuad } from "../../lib/image-processing/geometry";
import type { Point, Quad } from "../../types/repair";

const LABELS = ["Top left", "Top right", "Bottom right", "Bottom left"] as const;
/** Keyboard nudge, as a fraction of the longer image side; Shift moves ten times as far. */
const NUDGE_FRACTION = 0.002;

/** Starting corners when nothing was detected: the photo inset by 10%. */
export function defaultCorners(width: number, height: number): Quad {
  const x = width * 0.1;
  const y = height * 0.1;
  return [
    { x, y },
    { x: width - x, y },
    { x: width - x, y: height - y },
    { x, y: height - y },
  ];
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

interface Props {
  imageUrl: string;
  imageAlt: string;
  /** Image size in pixels; corners are in these coordinates. */
  width: number;
  height: number;
  initial: Quad;
  /** What the corners outline, used in help text; defaults to "page". */
  subject?: string;
  onApply: (corners: Quad) => void;
  onCancel: () => void;
}

/** Drag (or use arrow keys on) the four handles to outline the page on the original photo. */
export function CornerEditor({ imageUrl, imageAlt, width, height, initial, subject = "page", onApply, onCancel }: Props) {
  const [corners, setCorners] = useState<Quad>(initial);
  const svgRef = useRef<SVGSVGElement>(null);
  const checked = validateQuad(corners, width, height);
  // Larger handles on touch screens, where a fingertip covers more of the image.
  const handle = Math.max(width, height) * (isCoarsePointer() ? 0.04 : 0.025);

  const move = (index: number, p: Point) =>
    setCorners((c) => c.map((q, i) => (i === index ? { x: clamp(p.x, width), y: clamp(p.y, height) } : q)) as unknown as Quad);

  // The overlay box can be wider or taller than the photo it is drawn over (the SVG letterboxes its
  // drawing to keep the photo's shape), so map through the SVG's own screen transform.
  const toImage = (e: PointerEvent): Point => {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM?.();
    if (ctm) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  };

  /** The handle being dragged, and where on it the pointer took hold (so it does not jump to centre). */
  const dragging = useRef<{ index: number; dx: number; dy: number } | null>(null);

  const onPointerMove = (index: number) => (e: PointerEvent) => {
    const d = dragging.current;
    if (d?.index !== index) return;
    const p = toImage(e);
    move(index, { x: p.x - d.dx, y: p.y - d.dy });
  };

  const onKeyDown = (index: number) => (e: KeyboardEvent) => {
    const step = Math.max(width, height) * NUDGE_FRACTION * (e.shiftKey ? 10 : 1);
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const p = corners[index]!;
    move(index, { x: p.x + d.x, y: p.y + d.y });
  };

  return (
    <div className="corners">
      <p className="muted">
        Drag each handle to a corner of the {subject}, or focus a handle and use the arrow keys (Shift moves faster).
      </p>
      <div className="corners__stage">
        <img src={imageUrl} alt={imageAlt} />
        <svg
          ref={svgRef}
          className="corners__overlay"
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`${subject[0]!.toUpperCase()}${subject.slice(1)} corners`}
        >
          <polygon
            className={checked.ok ? "corners__outline" : "corners__outline corners__outline--bad"}
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
          />
          {corners.map((p, i) => (
            <circle
              key={LABELS[i]}
              className="corners__handle"
              cx={p.x}
              cy={p.y}
              r={handle}
              tabIndex={0}
              role="slider"
              aria-label={`${LABELS[i]} corner`}
              aria-valuetext={`x ${Math.round(p.x)}, y ${Math.round(p.y)}`}
              aria-valuenow={Math.round(p.x)}
              onPointerDown={(e) => {
                const at = toImage(e);
                dragging.current = { index: i, dx: at.x - p.x, dy: at.y - p.y };
                // Capture keeps the drag alive outside the handle; unavailable for synthetic pointers.
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* the drag is still tracked through the dragging ref */
                }
                e.currentTarget.focus();
              }}
              onPointerMove={onPointerMove(i)}
              onPointerUp={() => (dragging.current = null)}
              onPointerCancel={() => (dragging.current = null)}
              onKeyDown={onKeyDown(i)}
            />
          ))}
        </svg>
      </div>
      {!checked.ok && (
        <p role="alert" className="notice notice--warn">
          {checked.error.message}
        </p>
      )}
      <div className="corners__actions">
        <button type="button" className="btn btn--primary" disabled={!checked.ok} onClick={() => onApply(corners)}>
          Apply corners
        </button>
        <button type="button" className="btn" onClick={() => setCorners(defaultCorners(width, height))}>
          Reset
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
