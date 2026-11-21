import { describe, expect, it } from "vitest";
import template from "./truth-template.json";
import { amountsIn, normalizeText, scoreReceipt, similarity, substringDistance, summarize, type OcrLine } from "./score";
import { parseTruth, type ReceiptTruth } from "./truth";

function truthFromTemplate(): ReceiptTruth {
  const result = parseTruth(structuredClone(template));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.truth;
}

const ocr = (...texts: string[]): OcrLine[] => texts.map((text) => ({ text, confidence: 90 }));

/** A perfect reading of the template, printed the way a receipt usually lays it out. */
const PERFECT = ocr(
  "SAMPLE MART",
  "123 EXAMPLE ST., QUEZON CITY",
  "VAT REG TIN 000-000-000-00000",
  "11/21/26 14:05 CASHIER 01",
  "PANDESAL 10PCS 25.00",
  "SARDINES 155G 2 x 18.50 37.00",
  "LAUNDRY DETERGENT POWDER 1KG 189.00",
  "PROMO DISCOUNT (10.00)",
  "TOTAL 241.00",
  "CASH 500.00",
  "CHANGE 259.00",
  "VATABLE SALES 215.18",
  "VAT 12% 25.82",
  "**** **** **** 1234",
  "THANK YOU, COME AGAIN",
);

describe("text helpers", () => {
  it("keeps only letters and digits", () => {
    expect(normalizeText("Vat Reg. TIN: 000-000")).toBe("VATREGTIN000000");
  });

  it("finds amounts, including tax flags and currency marks", () => {
    expect(amountsIn("PANDESAL 10PCS 25.00V")).toEqual(["25.00"]);
    expect(amountsIn("SARDINES 2 x 18.50 37.00 T")).toEqual(["2", "18.50", "37.00"]);
    expect(amountsIn("TOTAL P1,234.50")).toEqual(["1234.50"]);
    expect(amountsIn("DISCOUNT (10.00)")).toEqual(["-10.00"]);
    expect(amountsIn("LESS 20.00-")).toEqual(["-20.00"]);
    expect(amountsIn("THANK YOU")).toEqual([]);
  });

  it("measures distance to the best stretch of a longer line", () => {
    expect(substringDistance("TOTAL", "XXTOTALXX")).toBe(0);
    expect(substringDistance("TOTAL", "XXT0TALXX")).toBe(1);
    expect(substringDistance("", "ANY")).toBe(0);
  });

  it("ignores spacing, punctuation and amounts when comparing words", () => {
    expect(similarity("SARDINES 155G", "SARDINES155G  2 x 18.50 37.00")).toBe(1);
    expect(similarity("TOTAL", "T0TAL 241.00")).toBeCloseTo(0.8);
    expect(similarity("CASH", "GROCERY 25.00")).toBeLessThan(0.8);
  });
});

describe("scoreReceipt", () => {
  it("scores a perfect reading as complete", () => {
    const score = scoreReceipt(truthFromTemplate(), PERFECT);
    expect(score.scoredLines).toBe(14); // 16 lines, 2 ignored
    expect(score.foundLines).toBe(14);
    expect(score.pricedLines).toBe(9);
    expect(score.amountsInRow).toBe(9);
    expect(score.amountsAnywhere).toBe(9);
    expect(score.total).toBe("correct");
  });

  it("counts a misread digit as wrong, never as close enough", () => {
    const lines = PERFECT.map((l) => (l.text === "TOTAL 241.00" ? { ...l, text: "TOTAL 247.00" } : l));
    const score = scoreReceipt(truthFromTemplate(), lines);
    expect(score.foundLines).toBe(14);
    expect(score.amountsInRow).toBe(8);
    expect(score.total).toBe("wrong-amount");
  });

  it("tells a wrong row apart from a misread amount", () => {
    // Amounts read as their own column, separate from the item names.
    const lines = ocr("PANDESAL 10PCS", "SARDINES 155G", "25.00", "37.00");
    const truth = truthFromTemplate();
    const score = scoreReceipt({ ...truth, lines: truth.lines.slice(4, 6) }, lines);
    expect(score.foundLines).toBe(2);
    expect(score.amountsInRow).toBe(0);
    expect(score.amountsAnywhere).toBe(2);
  });

  it("takes an amount from the unmatched line printed under the item", () => {
    const lines = PERFECT.flatMap((l) =>
      l.text.startsWith("SARDINES")
        ? ocr("SARDINES 155G", "2 x 18.50 37.00")
        : l.text.startsWith("LAUNDRY")
          ? ocr("LAUNDRY DETERGENT POWDER", "1KG 189.00")
          : [l],
    );
    const score = scoreReceipt(truthFromTemplate(), lines);
    expect(score.foundLines).toBe(14);
    expect(score.amountsInRow).toBe(9);
  });

  it("does not take an amount from a line that belongs to another item", () => {
    const truth: ReceiptTruth = {
      ...truthFromTemplate(),
      lines: [
        { kind: "item", text: "PANDESAL", amount: "25.00" },
        { kind: "item", text: "SARDINES", amount: "37.00" },
      ],
    };
    const score = scoreReceipt(truth, ocr("PANDESAL", "SARDINES 25.00"));
    expect(score.lines.map((l) => l.amountInRow)).toEqual([false, false]);
  });

  it("reports a total whose line was not read", () => {
    const score = scoreReceipt(truthFromTemplate(), PERFECT.filter((l) => !l.text.startsWith("TOTAL")));
    expect(score.total).toBe("line-not-found");
    expect(score.foundLines).toBe(13);
  });

  it("uses each OCR line once and keeps repeated items in order", () => {
    const truth: ReceiptTruth = {
      ...truthFromTemplate(),
      lines: [
        { kind: "item", text: "PANDESAL", amount: "25.00" },
        { kind: "item", text: "PANDESAL", amount: "30.00" },
      ],
    };
    const score = scoreReceipt(truth, ocr("PANDESAL 25.00", "PANDESAL 30.00"));
    expect(score.lines.map((l) => l.ocrLine)).toEqual([0, 1]);
    expect(score.amountsInRow).toBe(2);

    const once = scoreReceipt(truth, ocr("PANDESAL 25.00"));
    expect(once.foundLines).toBe(1);
  });

  it("finds nothing in an empty reading", () => {
    const score = scoreReceipt(truthFromTemplate(), []);
    expect(score.foundLines).toBe(0);
    expect(score.amountsAnywhere).toBe(0);
    expect(score.total).toBe("line-not-found");
  });
});

describe("summarize", () => {
  it("pools lines across receipts", () => {
    const truth = truthFromTemplate();
    const good = scoreReceipt(truth, PERFECT);
    const empty = scoreReceipt(truth, []);
    const s = summarize([good, empty]);
    expect(s.receipts).toBe(2);
    expect(s.lineRecall).toBe(0.5);
    expect(s.amountsInRow).toBe(0.5);
    expect(s.totalsCorrect).toBe(1);
    expect(s.totalsPossible).toBe(2);
  });

  it("reports no ratio when there is nothing to count", () => {
    expect(summarize([]).lineRecall).toBeNull();
  });
});
