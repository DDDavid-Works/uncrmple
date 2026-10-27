interface Props {
  className?: string;
}

/**
 * Uncrmple mark: a page with a folded corner and a camera lens in front. Colours come from the
 * theme tokens so it follows light/dark mode. public/favicon.svg is the static copy of this mark.
 */
export function Logo({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M16 5H41L53 17V59H16Z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M41 5V17H53" fill="var(--logo-fold)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="24" cy="44" r="15" fill="var(--ink)" />
      <circle cx="24" cy="44" r="9.5" fill="var(--accent)" />
      {/* The pupil and glint stay dark and light in both themes, like a real lens. */}
      <circle cx="24" cy="44" r="4.5" fill="#111111" />
      <circle cx="20.5" cy="40.5" r="2" fill="#faf7f2" />
    </svg>
  );
}
