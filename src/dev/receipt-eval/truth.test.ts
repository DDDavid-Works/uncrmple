import { describe, expect, it } from "vitest";
import template from "./truth-template.json";
import { normalizeAmount, parseTruth } from "./truth";

const valid = () => structuredClone(template) as Record<string, unknown> & { lines: Record<string, unknown>[] };

/** One template line by index; throws instead of returning undefined. */
function line(raw: ReturnType<typeof valid>, i: number): Record<string, unknown> {
  const l = raw.lines[i];
  if (!l) throw new Error(`template has no line ${i}`);
  return l;
}

function errorsOf(raw: unknown): string[] {
  const result = parseTruth(raw);
  return result.ok ? [] : result.errors;
}

describe("normalizeAmount", () => {
  it.each([
    ["25.00", "25.00"],
    ["1,234.50", "1234.50"],
    ["P 95.00", "95.00"],
    ["₱1,089.00", "1089.00"],
    ["PHP 12.5", "12.5"],
    ["-20.00", "-20.00"],
    ["(10.00)", "-10.00"],
    ["20.00-", "-20.00"],
    ["0.00", "0.00"],
    ["-0.00", "0.00"],
  ])("reads %s as %s", (printed, expected) => {
    expect(normalizeAmount(printed)).toBe(expected);
  });

  it.each(["", "TOTAL", "12,34.00", "1.234,50", "12a.00", "--5.00"])("rejects %j", (printed) => {
    expect(normalizeAmount(printed)).toBeNull();
  });
});

describe("parseTruth", () => {
  it("accepts the committed template", () => {
    const result = parseTruth(template);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.truth.lines).toHaveLength(template.lines.length);
      expect(result.truth.lines.filter((l) => l.kind === "total")).toHaveLength(1);
    }
  });

  it("keeps lines in printed order", () => {
    const result = parseTruth(template);
    expect(result.ok && result.truth.lines.map((l) => l.text)).toEqual(template.lines.map((l) => l.text));
  });

  it("does not change the input object", () => {
    const raw = valid();
    const before = JSON.stringify(raw);
    parseTruth(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("accepts a quarter turn for a sideways photo and rejects any other angle", () => {
    const raw = valid();
    raw.rotate = 90;
    const result = parseTruth(raw);
    expect(result.ok && result.truth.rotate).toBe(90);
    raw.rotate = 45;
    expect(errorsOf(raw)).toEqual(["rotate: must be 0, 90, 180 or 270"]);
    raw.rotate = 0;
    const upright = parseTruth(raw);
    expect(upright.ok && upright.truth.rotate).toBeUndefined();
  });

  it("rejects a non-object", () => {
    expect(errorsOf([])).toEqual(["file must contain a JSON object"]);
    expect(errorsOf(null)).toEqual(["file must contain a JSON object"]);
  });

  it("reports every problem at once", () => {
    const raw = valid();
    raw.version = 2;
    raw.currency = "USD";
    line(raw, 4).amount = "twenty";
    const errors = errorsOf(raw);
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toMatch(/version/);
    expect(errors.join("\n")).toMatch(/currency/);
    expect(errors.join("\n")).toMatch(/lines\[4\]\.amount/);
  });

  it("requires an amount on priced lines unless ignored", () => {
    const raw = valid();
    delete line(raw, 4).amount;
    expect(errorsOf(raw)).toEqual(["lines[4].amount: required on item lines"]);
    line(raw, 4).ignore = "unreadable";
    expect(errorsOf(raw)).toEqual([]);
  });

  it("rejects an amount on a text line", () => {
    const raw = valid();
    line(raw, 0).amount = "5.00";
    expect(errorsOf(raw)[0]).toMatch(/text lines have no amount/);
  });

  it("allows qty and unitPrice only on item lines, and unitPrice only with qty", () => {
    const raw = valid();
    line(raw, 8).qty = 1;
    expect(errorsOf(raw)[0]).toMatch(/item lines only/);

    const other = valid();
    delete line(other, 5).qty;
    expect(errorsOf(other)[0]).toMatch(/only allowed together with qty/);
  });

  it("rejects more than one readable total", () => {
    const raw = valid();
    line(raw, 10).kind = "total";
    expect(errorsOf(raw)[0]).toMatch(/2 readable total lines/);
  });

  it("rejects unknown kinds, ignore reasons and conditions", () => {
    const raw = valid();
    line(raw, 0).kind = "header";
    line(raw, 1).ignore = "smudged";
    raw.conditions = ["faded", "wet"];
    const errors = errorsOf(raw).join("\n");
    expect(errors).toMatch(/lines\[0\]\.kind/);
    expect(errors).toMatch(/lines\[1\]\.ignore/);
    expect(errors).toMatch(/conditions/);
  });

  it("requires a photo file name and at least one line", () => {
    const raw = valid();
    raw.photo = "receipt";
    raw.lines = [];
    const errors = errorsOf(raw).join("\n");
    expect(errors).toMatch(/photo/);
    expect(errors).toMatch(/lines: must be a non-empty list/);
  });
});
