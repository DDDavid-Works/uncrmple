import type { EnhanceOptions, OutputStyle, PaperProfile, Result } from "../../types/repair";

export const OUTPUT_STYLES: readonly OutputStyle[] = ["color", "grayscale", "blackwhite"];
export const PAPER_PROFILES: readonly PaperProfile[] = ["document", "receipt"];

export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptions = { style: "color" };

/** Style a page starts with: colour for documents, grayscale for receipts (their print is one colour). */
export function defaultStyleFor(profile: PaperProfile): OutputStyle {
  return profile === "receipt" ? "grayscale" : DEFAULT_ENHANCE_OPTIONS.style;
}

/** Validate options that may come from the UI or, later, from stored settings. */
export function validateEnhanceOptions(options: EnhanceOptions): Result<EnhanceOptions> {
  if (!options || !OUTPUT_STYLES.includes(options.style)) {
    return {
      ok: false,
      error: { code: "invalid-input", message: "Unknown output style." },
    };
  }
  if (options.profile !== undefined && !PAPER_PROFILES.includes(options.profile)) {
    return {
      ok: false,
      error: { code: "invalid-input", message: "Unknown paper type." },
    };
  }
  return { ok: true, value: options };
}
