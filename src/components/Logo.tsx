interface Props {
  className?: string;
}

/**
 * Uncrmple mark: one page on a navy tile, crumpled on the left and smoothed flat on the right, with
 * its text lines straightening as they cross the middle. The colours are fixed so the logo looks
 * the same in light and dark mode. public/favicon.svg is the same drawing.
 */
export function Logo({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="#17324d" />
      {/* Left half: crumpled outline, then a patchwork of folds in light and shadow. It runs a
          little past the middle so the flat half covers the join without a hairline seam. */}
      <path d="M33 10L24 12L15 9L17 21L12 30L17 39L13 50L22 55L33 54Z" fill="#ffffff" />
      <path d="M24 12L15 9L22 20Z" fill="#c9d9e5" />
      <path d="M15 9L17 21L22 20Z" fill="#e3edf3" />
      <path d="M22 20L17 21L12 30L21 33Z" fill="#f4f8fb" />
      <path d="M22 20L21 33L28 27Z" fill="#d5e3ec" />
      <path d="M28 27L21 33L28 41L32 35Z" fill="#e6eef4" />
      <path d="M12 30L17 39L21 33Z" fill="#cbdbe6" />
      <path d="M21 33L17 39L22 46L28 41Z" fill="#f2f6f9" />
      <path d="M17 39L13 50L22 46Z" fill="#d6e4ed" />
      <path d="M13 50L22 55L22 46Z" fill="#eaf1f6" />
      <path d="M28 41L32 35L32 47Z" fill="#f6f9fb" />
      {/* Right half: flat, with a neat folded corner. */}
      <path d="M32 10H43L50 17V54H32Z" fill="#ffffff" />
      <path d="M43 10L50 17H43Z" fill="#d4ecee" />
      {/* Text lines: faint and bent on the crumpled side, crisp and straight on the flat side. */}
      <g fill="none" stroke="#17324d" strokeLinejoin="round" strokeLinecap="round">
        {/* Stops just short of the middle so the two strokes' caps don't overlap into a dark dot. */}
        <path d="M17 26L22 28.5L28 26.5L30.6 26.8M16 33L21 34.5L27 32L30.6 32.8M17 40L22 38.5L28 41L30.6 39.2" strokeOpacity="0.5" strokeWidth="1.6" />
        <path d="M32 27H44M32 33H45M32 39H42" strokeOpacity="0.85" strokeWidth="1.8" />
      </g>
    </svg>
  );
}
