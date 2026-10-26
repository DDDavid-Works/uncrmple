import type { CardEnhanceOptions, Result } from "../../types/repair";

export const NO_CARD_ENHANCEMENT: CardEnhanceOptions = {
  evenLighting: false,
  autoContrast: false,
  denoise: false,
  sharpen: false,
  grayscale: false,
};

const KEYS = Object.keys(NO_CARD_ENHANCEMENT) as (keyof CardEnhanceOptions)[];

/** True when at least one touch-up is selected. */
export function hasCardEnhancement(o: CardEnhanceOptions): boolean {
  return KEYS.some((k) => o[k]);
}

/** Validate options from the UI: every flag must be a boolean. Unknown keys are ignored. */
export function validateCardEnhanceOptions(options: CardEnhanceOptions): Result<CardEnhanceOptions> {
  if (!options || KEYS.some((k) => typeof options[k] !== "boolean")) {
    return { ok: false, error: { code: "invalid-input", message: "Unknown card enhancement options." } };
  }
  return { ok: true, value: options };
}
