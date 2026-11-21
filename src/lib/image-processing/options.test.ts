import { DEFAULT_ENHANCE_OPTIONS, OUTPUT_STYLES, PAPER_PROFILES, defaultStyleFor, validateEnhanceOptions } from "./options";

describe("paper profiles", () => {
  it("accepts every profile and leaves it optional", () => {
    for (const profile of PAPER_PROFILES) expect(validateEnhanceOptions({ style: "grayscale", profile }).ok).toBe(true);
    expect(validateEnhanceOptions({ style: "grayscale" }).ok).toBe(true);
  });
  it("rejects an unknown profile", () => {
    expect(validateEnhanceOptions({ style: "grayscale", profile: "napkin" as never })).toMatchObject({
      ok: false,
      error: { code: "invalid-input", message: "Unknown paper type." },
    });
  });
  it("starts receipts in grayscale and documents in the default style", () => {
    expect(defaultStyleFor("receipt")).toBe("grayscale");
    expect(defaultStyleFor("document")).toBe(DEFAULT_ENHANCE_OPTIONS.style);
  });
});

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
