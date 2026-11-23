import template from "./truth-template.json";
import { auditAmounts, checkAmounts, joinSplitAmounts, type CheckedAmount } from "./checks";
import { scoreReceipt, type OcrLine } from "./score";
import { parseTruth, type ReceiptTruth } from "./truth";

const ocr = (...texts: string[]): OcrLine[] => texts.map((text) => ({ text, confidence: 90 }));

/** The fictional template receipt, read perfectly. */
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

function truth(): ReceiptTruth {
  const r = parseTruth(structuredClone(template));
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.truth;
}

const statusOf = (checked: CheckedAmount[], text: string) => checked.find((c) => c.text === text)?.status;
const replace = (from: string, to: string) => PERFECT.map((l) => (l.text === from ? { ...l, text: to } : l));

describe("joinSplitAmounts", () => {
  it("joins a space read inside an amount and leaves other text alone", () => {
    expect(joinSplitAmounts("1 VM BCNCHZYYUMFF 199. 00V")).toBe("1 VM BCNCHZYYUMFF 199.00V");
    expect(joinSplitAmounts("TOTAL 199 .00")).toBe("TOTAL 199.00");
    expect(joinSplitAmounts("CASHIER 01 14.05")).toBe("CASHIER 01 14.05");
    expect(joinSplitAmounts("Vat Exempt Sales 420 00")).toBe("Vat Exempt Sales 420 00");
  });
});

describe("checkAmounts", () => {
  it("confirms every amount of a receipt that adds up", () => {
    const checked = checkAmounts(PERFECT);
    expect(checked.map((c) => c.text)).toEqual(["25.00", "37.00", "189.00", "(10.00)", "241.00", "500.00", "259.00", "215.18", "25.82"]);
    expect(checked.every((c) => c.status === "confirmed")).toBe(true);
  });

  it("flags the items when one is misread, never corrects it, and keeps amounts proven another way", () => {
    const checked = checkAmounts(replace("LAUNDRY DETERGENT POWDER 1KG 189.00", "LAUNDRY DETERGENT POWDER 1KG 169.00"));
    expect(statusOf(checked, "169.00")).toBe("flagged");
    expect(statusOf(checked, "25.00")).toBe("flagged");
    expect(checked.find((c) => c.text === "169.00")!.cents).toBe(16900);
    // Quantity × price still proves the sardines; VAT parts and cash/change still prove the total.
    expect(statusOf(checked, "37.00")).toBe("confirmed");
    expect(statusOf(checked, "241.00")).toBe("confirmed");
    expect(statusOf(checked, "500.00")).toBe("confirmed");
  });

  it("flags a misread VAT amount that no longer adds up, leaving it unchecked rather than confirmed", () => {
    const checked = checkAmounts(replace("VAT 12% 25.82", "VAT 12% 25.87"));
    expect(statusOf(checked, "25.87")).toBe("unchecked");
    expect(statusOf(checked, "215.18")).toBe("unchecked");
  });

  it("checks quantity × unit price on the line, wherever the quantity is printed", () => {
    expect(statusOf(checkAmounts(ocr("MOBY CARAMEL 16 9.00 144.00")), "144.00")).toBe("confirmed");
    expect(statusOf(checkAmounts(ocr("5 x 78.75 393.75")), "393.75")).toBe("confirmed");
    const wrong = checkAmounts(ocr("200 x 7.95 1,580.00"))[0]!;
    expect(wrong.status).toBe("flagged");
    expect(wrong.reasons[0]).toMatch(/200 × 7.95 is not 1,580.00/);
  });

  it("flags a malformed amount and an amount in brackets that nothing confirms", () => {
    const checked = checkAmounts(ocr("VATable Sales 1.328.65", "Moby Choco 25g", "200 x 6.60 (1,320.00)"));
    expect(checked[0]!.status).toBe("flagged");
    expect(checked[0]!.cents).toBeNull();
    // A pen circle read as brackets: negative, and 200 × 6.60 is not -1,320.00.
    expect(checked[1]!.status).toBe("flagged");
  });

  it("flags low-confidence readings unless a sum confirms them", () => {
    const lines = PERFECT.map((l) => (l.text.startsWith("CASH") || l.text.startsWith("SAMPLE") ? { ...l, confidence: 30 } : l));
    expect(statusOf(checkAmounts(lines), "500.00")).toBe("confirmed");
    expect(statusOf(checkAmounts(ocr("SOMETHING 12.00").map((l) => ({ ...l, confidence: 30 }))), "12.00")).toBe("flagged");
  });

  it("finds the total on the line under a TOTAL label and skips a subtotal when adding items", () => {
    const checked = checkAmounts(ocr("ITEM A 120.00", "ITEM B 80.00", "SUBTOTAL 200.00", "TOTAL", "200.00"));
    expect(checked.every((c) => c.status === "confirmed")).toBe(true);
  });
});

describe("auditAmounts", () => {
  it("counts every shown amount of a perfect reading as correct and confirmed", () => {
    const a = auditAmounts(scoreReceipt(truth(), PERFECT).lines, checkAmounts(PERFECT));
    expect(a.shown).toBe(9);
    expect(a.counts["correct-confirmed"]).toBe(9);
    expect(a.silentLenient + a.silentStrict + a.warnedLenient + a.warnedStrict).toBe(0);
  });

  it("separates a caught misread from one shown without a warning", () => {
    const lines = replace("VAT 12% 25.82", "VAT 12% 25.87");
    const a = auditAmounts(scoreReceipt(truth(), lines).lines, checkAmounts(lines));
    expect(a.counts["wrong-unchecked"]).toBe(1);
    expect(a.silentLenient).toBe(1); // shown without a warning if only flagged amounts get one
    expect(a.silentStrict).toBe(0); // warned about if everything unconfirmed gets one
    expect(a.warnedStrict).toBe(2); // the wrong VAT and the correct VATable sales it no longer adds up with

    const item = replace("PANDESAL 10PCS 25.00", "PANDESAL 10PCS 26.00");
    const b = auditAmounts(scoreReceipt(truth(), item).lines, checkAmounts(item));
    expect(b.counts["wrong-flagged"]).toBe(1);
    expect(b.silentLenient).toBe(0);
  });

  it("counts a found row with no amount as missing, not wrong", () => {
    const lines = replace("CASH 500.00", "CASH");
    const a = auditAmounts(scoreReceipt(truth(), lines).lines, checkAmounts(lines));
    expect(a.counts.missing).toBe(1);
  });
});
