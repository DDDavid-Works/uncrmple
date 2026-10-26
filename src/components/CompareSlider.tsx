import { useState, type CSSProperties } from "react";

interface Props {
  /** Both images must have the same size and geometry, or the wipe would mislead. */
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  beforeAlt: string;
  afterAlt: string;
}

/**
 * Before/after wipe: the "before" image is revealed left of the divider. Driven by a native
 * range input, so mouse, touch, keyboard and screen readers all work without custom handling.
 */
export function CompareSlider({ beforeUrl, afterUrl, beforeLabel, afterLabel, beforeAlt, afterAlt }: Props) {
  const [position, setPosition] = useState(50);
  return (
    <div className="wipe" style={{ "--wipe": `${position}%` } as CSSProperties}>
      <div className="wipe__stage">
        <img className="wipe__img" src={afterUrl} alt={afterAlt} />
        <img className="wipe__img wipe__img--before" src={beforeUrl} alt={beforeAlt} />
        <span className="wipe__divider" aria-hidden="true" />
        <span className="wipe__tag wipe__tag--before" aria-hidden="true">
          {beforeLabel}
        </span>
        <span className="wipe__tag wipe__tag--after" aria-hidden="true">
          {afterLabel}
        </span>
        <input
          className="wipe__range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label={`Compare ${beforeLabel.toLowerCase()} and ${afterLabel.toLowerCase()}`}
          aria-valuetext={`${position}% ${beforeLabel.toLowerCase()} shown`}
        />
      </div>
    </div>
  );
}
