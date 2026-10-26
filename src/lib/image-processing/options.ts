import type { EnhanceOptions, OutputStyle, Result } from "../../types/repair";

export const OUTPUT_STYLES: readonly OutputStyle[] = ["color", "grayscale", "blackwhite"];

export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptions = { style: "color" };

/** Validate options that may come from the UI or, later, from stored settings. */
export function validateEnhanceOptions(options: EnhanceOptions): Result<EnhanceOptions> {
  if (!options || !OUTPUT_STYLES.includes(options.style)) {
    return {
      ok: false,
      error: { code: "invalid-input", message: "Unknown output style." },
    };
  }
  return { ok: true, value: options };
}
