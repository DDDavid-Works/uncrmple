/**
 * Ground truth for the receipt OCR spike (development only, see docs/receipt-mode.md).
 *
 * One hand-typed file per photo, saved next to it in test-photos/receipts/ as
 * `<photo name without extension>.truth.json`. Lines are listed top to bottom in printed order.
 * Amounts are typed exactly as printed ("1,234.50", "-20.00", "P 95.00"); they are normalised
 * only when compared.
 */

export const TRUTH_VERSION = 1;

/** What a line is, used only for scoring. The app itself never labels lines. */
export type LineKind =
  /** Shop name, address, TIN, date, cashier, "Thank you" and other lines without a price. */
  | "text"
  /** A bought item with its amount. */
  | "item"
  /** Subtotal, VAT, discount, cash, change and similar lines with an amount. */
  | "summary"
  /** The amount due. Exactly one per receipt, unless it cannot be read. */
  | "total";

/** Why a line is left out of scoring. */
export type IgnoreReason =
  /** A person cannot read it either (torn, faded away, covered). */
  | "unreadable"
  /** Hidden because it holds personal data (card number, name, loyalty ID). Type its text as "[hidden]". */
  | "private";

export interface TruthLine {
  kind: LineKind;
  /** The printed words, with wrapped item names joined into one line. */
  text: string;
  /** Required for item, summary and total lines; never set on text lines. */
  amount?: string;
  /** Only when the line clearly prints a quantity, as in "2 x 45.00". */
  qty?: number;
  /** Only together with qty. */
  unitPrice?: string;
  ignore?: IgnoreReason;
}

export type Condition =
  | "faded"
  | "crumpled"
  | "folded"
  | "long"
  | "curled"
  | "shadow"
  | "glare"
  | "angled"
  | "blurry"
  | "low-light";

export interface ReceiptTruth {
  version: typeof TRUTH_VERSION;
  /** File name of the photo in test-photos/receipts/. */
  photo: string;
  /** Kind of shop, not its name: supermarket, convenience, restaurant, pharmacy, fuel, other. */
  shop: string;
  currency: "PHP";
  conditions: Condition[];
  lines: TruthLine[];
  notes?: string;
}

export type ParseResult = { ok: true; truth: ReceiptTruth } | { ok: false; errors: string[] };

const LINE_KINDS: readonly LineKind[] = ["text", "item", "summary", "total"];
const IGNORE_REASONS: readonly IgnoreReason[] = ["unreadable", "private"];
const CONDITIONS: readonly Condition[] = [
  "faded",
  "crumpled",
  "folded",
  "long",
  "curled",
  "shadow",
  "glare",
  "angled",
  "blurry",
  "low-light",
];

/**
 * Canonical form of a printed amount for exact comparison: currency marks and thousands
 * separators removed, two decimals kept as printed. "P 1,234.50" -> "1234.50", "(20.00)" -> "-20.00".
 * Returns null when the text is not an amount.
 */
export function normalizeAmount(printed: string): string | null {
  let s = printed.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^(₱|PHP|Php|P)\s*/, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  }
  if (s.endsWith("-")) {
    // Some printers put the minus sign after the number: "20.00-".
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const plain = s.replace(/,/g, "");
  return negative && Number(plain) !== 0 ? `-${plain}` : plain;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkLine(raw: unknown, at: string, errors: string[]): TruthLine | null {
  if (!isRecord(raw)) {
    errors.push(`${at}: must be an object`);
    return null;
  }
  const before = errors.length;
  const { kind, text, amount, qty, unitPrice, ignore } = raw;

  if (!LINE_KINDS.includes(kind as LineKind)) errors.push(`${at}.kind: must be one of ${LINE_KINDS.join(", ")}`);
  if (typeof text !== "string" || text.trim() === "") errors.push(`${at}.text: must be non-empty text`);
  if (ignore !== undefined && !IGNORE_REASONS.includes(ignore as IgnoreReason)) {
    errors.push(`${at}.ignore: must be one of ${IGNORE_REASONS.join(", ")}`);
  }

  const priced = kind === "item" || kind === "summary" || kind === "total";
  if (kind === "text" && amount !== undefined) errors.push(`${at}.amount: text lines have no amount (use kind "summary")`);
  if (priced && ignore === undefined && amount === undefined) errors.push(`${at}.amount: required on ${kind} lines`);
  if (amount !== undefined && (typeof amount !== "string" || normalizeAmount(amount) === null)) {
    errors.push(`${at}.amount: "${String(amount)}" is not a printed amount`);
  }

  if (qty !== undefined && (typeof qty !== "number" || !(qty > 0))) errors.push(`${at}.qty: must be a positive number`);
  if (unitPrice !== undefined) {
    if (qty === undefined) errors.push(`${at}.unitPrice: only allowed together with qty`);
    if (typeof unitPrice !== "string" || normalizeAmount(unitPrice) === null) {
      errors.push(`${at}.unitPrice: "${String(unitPrice)}" is not a printed amount`);
    }
  }
  if ((qty !== undefined || unitPrice !== undefined) && kind !== "item") {
    errors.push(`${at}: qty and unitPrice belong on item lines only`);
  }

  if (errors.length > before) return null;
  const line: TruthLine = { kind: kind as LineKind, text: text as string };
  if (amount !== undefined) line.amount = amount as string;
  if (qty !== undefined) line.qty = qty as number;
  if (unitPrice !== undefined) line.unitPrice = unitPrice as string;
  if (ignore !== undefined) line.ignore = ignore as IgnoreReason;
  return line;
}

/** Validates a parsed truth file and lists every problem, so a typo is found in one pass. */
export function parseTruth(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ["file must contain a JSON object"] };

  if (raw.version !== TRUTH_VERSION) errors.push(`version: must be ${TRUTH_VERSION}`);
  if (typeof raw.photo !== "string" || !/\.(jpe?g|png|webp)$/i.test(raw.photo)) {
    errors.push("photo: must be the photo's file name (.jpg, .jpeg, .png or .webp)");
  }
  if (typeof raw.shop !== "string" || raw.shop.trim() === "") errors.push("shop: must be non-empty text");
  if (raw.currency !== "PHP") errors.push('currency: must be "PHP"');
  if (!Array.isArray(raw.conditions) || raw.conditions.some((c) => !CONDITIONS.includes(c as Condition))) {
    errors.push(`conditions: must be a list using only ${CONDITIONS.join(", ")} (empty if none)`);
  }
  if (raw.notes !== undefined && typeof raw.notes !== "string") errors.push("notes: must be text");

  const lines: TruthLine[] = [];
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    errors.push("lines: must be a non-empty list");
  } else {
    raw.lines.forEach((l, i) => {
      const line = checkLine(l, `lines[${i}]`, errors);
      if (line) lines.push(line);
    });
    const totals = lines.filter((l) => l.kind === "total" && l.ignore === undefined).length;
    if (totals > 1) errors.push(`lines: ${totals} readable total lines; mark exactly one as "total"`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    truth: {
      version: TRUTH_VERSION,
      photo: raw.photo as string,
      shop: raw.shop as string,
      currency: "PHP",
      conditions: raw.conditions as Condition[],
      lines,
      ...(raw.notes !== undefined ? { notes: raw.notes as string } : {}),
    },
  };
}
