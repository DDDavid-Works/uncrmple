import { DEFAULT_ENHANCE_OPTIONS, OUTPUT_STYLES, validateEnhanceOptions } from "./options";

describe("validateEnhanceOptions", () => {
  it("accepts every supported style and the default", () => {
    for (const style of OUTPUT_STYLES) expect(validateEnhanceOptions({ style }).ok).toBe(true);
    expect(validateEnhanceOptions(DEFAULT_ENHANCE_OPTIONS).ok).toBe(true);
  });
  it("rejects unknown or missing styles", () => {
    expect(validateEnhanceOptions({ style: "sepia" as never })).toMatchObject({ ok: false, error: { code: "invalid-input" } });
    expect(validateEnhanceOptions({} as never).ok).toBe(false);
    expect(validateEnhanceOptions(undefined as never).ok).toBe(false);
  });
});
