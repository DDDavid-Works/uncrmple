/**
 * Arithmetic checks on OCR'd receipt amounts, for the receipt spike (development only, see
 * docs/receipt-mode.md). OCR cannot be trusted digit for digit on a small photo, so every amount is
 * given a status instead of being taken at face value:
 *
 * - confirmed: a sum printed on the receipt proves it (quantity × unit price = amount, items add up
 *   to the total, VAT parts add up, cash − total = change, or another line prints the same value).
 * - flagged: a check failed, or the reading itself is doubtful (malformed number, brackets that may
 *   be a pen circle, low OCR confidence). A malformed number or a failed quantity × price is never
 *   cleared. Brackets, low confidence and items that do not add up to the total are cleared when
 *   another sum proves the amount: when the items fall short, the one at fault is unknown (or a
 *   row was not read), so amounts proven another way stay trusted.
 * - unchecked: nothing confirms or contradicts it.
 *
 * Words such as TOTAL are used only to find where to check, never shown to the user as labels.
 * Nothing is corrected: a failed check marks amounts for the user to look at (rule 2).
 * Pure functions, no OCR or browser APIs.
 */
import { normalizeText, type LineScore, type OcrLine } from "./score";
import { normalizeAmount } from "./truth";

/** Lines Tesseract is less sure of than this (0..100) are flagged unless a sum confirms them. */
export const MIN_CONFIDENCE = 60;

export type AmountStatus = "confirmed" | "flagged" | "unchecked";

export interface CheckedAmount {
  /** Index of the OCR line. */
  line: number;
  /** The amount as read, after joining a split decimal ("199. 00" -> "199.00"). */
  text: string;
  /** In cents; null when the number is malformed. */
  cents: number | null;
  status: AmountStatus;
  reasons: string[];
}

/** "199. 00" and "199 .00" -> "199.00": a space read inside an amount. */
export function joinSplitAmounts(text: string): string {
  return text.replace(/(\d)\s*\.\s+(\d{2})(?!\d)/g, "$1.$2").replace(/(\d)\s+\.(\d{2})(?!\d)/g, "$1.$2");
}

interface Token {
  raw: string;
  cents: number | null;
  bracketed: boolean;
  /** The whole number printed just before it ("2 x 18.50", "16  9.00"), if any. */
  before: number | null;
}

/** A token that looks like an amount with two decimals; a trailing tax flag ("V", "E") is dropped. */
const AMOUNT_LIKE = /^\(?(?:₱|PHP|P)?-?\d[\d.,]*[.,]\d{2}-?\)?$/;

function amountTokens(text: string): Token[] {
  const out: Token[] = [];
  const pieces = joinSplitAmounts(text).split(/\s+/).filter((p) => p.length > 0);
  pieces.forEach((piece, i) => {
    const raw = piece.replace(/^(.*\d\)?-?)[A-Za-z]{1,2}$/, "$1");
    if (!AMOUNT_LIKE.test(raw)) return;
    const bracketed = raw.startsWith("(") || raw.endsWith(")");
    const balanced = raw.startsWith("(") === raw.endsWith(")");
    const value = balanced ? normalizeAmount(raw) : null;
    // A decimal comma ("159,43") or two points ("1.328.65") is a misread, not a valid amount.
    const ok = value !== null && /\.\d{2}$/.test(value);
    out.push({ raw, cents: ok ? Math.round(Number(value) * 100) : null, bracketed, before: quantityBefore(pieces, i) });
  });
  return out;
}

/** The whole number before pieces[i], skipping a multiplication sign: "2 x 18.50", "16 9.00", "2x 18.50". */
function quantityBefore(pieces: readonly string[], i: number): number | null {
  let j = i - 1;
  if (j >= 0 && /^[xX×*]$/.test(pieces[j]!)) j--;
  const m = j >= 0 ? /^(\d{1,4})[xX×*]?$/.exec(pieces[j]!) : null;
  return m ? Number(m[1]) : null;
}

const isTotalLine = (text: string) => {
  const t = normalizeText(text);
  return t.includes("TOTAL") && !t.includes("SUBTOTAL") && !t.includes("ITEMS");
};
/** Lines whose amount repeats others and must not be summed as an item. */
const isSubtotalLine = (text: string) => normalizeText(text).includes("SUBTOTAL");

/** Every amount the OCR lines hold (the last one on each line), with its status. */
export function checkAmounts(lines: readonly OcrLine[], minConfidence = MIN_CONFIDENCE): CheckedAmount[] {
  const items: (CheckedAmount & { confirmedBy: Set<string>; hard: Set<string>; soft: Set<string> })[] = [];
  lines.forEach((l, line) => {
    const tokens = amountTokens(l.text);
    const last = tokens[tokens.length - 1];
    if (!last) return;
    const a = { line, text: last.raw, cents: last.cents, status: "unchecked" as AmountStatus, reasons: [], confirmedBy: new Set<string>(), hard: new Set<string>(), soft: new Set<string>() };
    if (last.cents === null) a.hard.add("not a well-formed amount");
    if (last.bracketed) a.soft.add("in brackets (a negative amount, or a pen circle)");
    if (l.confidence < minConfidence) a.soft.add("read with low confidence");
    // Quantity × unit price on the same line.
    const unit = tokens[tokens.length - 2];
    const qty = unit?.before ?? null;
    if (qty !== null && unit && unit.cents !== null && last.cents !== null) {
      if (qty * unit.cents === last.cents) a.confirmedBy.add("quantity × price");
      else a.hard.add(`${qty} × ${unit.raw} is not ${last.raw}`);
    }
    items.push(a);
  });

  // Items add up to the total.
  const totalIdx = items.findIndex((a) => isTotalLine(lines[a.line]!.text) || (a.line > 0 && isTotalLine(lines[a.line - 1]!.text) && amountTokens(lines[a.line - 1]!.text).length === 0));
  if (totalIdx > 0) {
    const total = items[totalIdx]!;
    const above = items.slice(0, totalIdx).filter((a) => !isSubtotalLine(lines[a.line]!.text));
    if (total.cents !== null && above.length > 0) {
      const sum = above.reduce((s, a) => (s === null || a.cents === null ? null : s + a.cents), 0 as number | null);
      if (sum === total.cents) {
        for (const a of [...above, total]) a.confirmedBy.add("items add up to the total");
      } else {
        // Which one is wrong is unknown (or an item row was not read at all), so every amount not
        // proven some other way (quantity × price, VAT parts, cash and change) is flagged.
        for (const a of [...above, total]) a.soft.add("items do not add up to the total");
      }
    }
  }

  // From the subtotal or total down: amounts that add up (VATable + VAT = total, total + change =
  // cash) or that another line prints again (subtotal = total, cash = total). Zero proves nothing.
  const subtotalIdx = items.findIndex((a) => isSubtotalLine(lines[a.line]!.text));
  const from = Math.max(0, subtotalIdx >= 0 && (totalIdx < 0 || subtotalIdx < totalIdx) ? subtotalIdx : totalIdx);
  const block = items.slice(from).filter((a) => a.cents !== null && a.cents !== 0);
  for (let i = 0; i < block.length; i++) {
    for (let j = i + 1; j < block.length; j++) {
      const a = block[i]!, b = block[j]!;
      if (a.cents === b.cents) {
        a.confirmedBy.add("printed again on another line");
        b.confirmedBy.add("printed again on another line");
      }
      for (let k = 0; k < block.length; k++) {
        const c = block[k]!;
        if (k === i || k === j) continue;
        if (a.cents! + b.cents! === c.cents) for (const x of [a, b, c]) x.confirmedBy.add("adds up with other amounts");
      }
    }
  }

  return items.map(({ confirmedBy, hard, soft, ...a }) => {
    const status: AmountStatus = hard.size > 0 ? "flagged" : confirmedBy.size > 0 ? "confirmed" : soft.size > 0 ? "flagged" : "unchecked";
    const reasons = status === "confirmed" ? [...confirmedBy] : [...hard, ...soft];
    return { ...a, status, reasons };
  });
}

export type Outcome =
  | "correct-confirmed" | "correct-unchecked" | "correct-flagged"
  | "wrong-confirmed" | "wrong-unchecked" | "wrong-flagged"
  | "missing";

export interface Audit {
  counts: Record<Outcome, number>;
  /** Wrong amounts shown without a warning when only flagged amounts get one. */
  silentLenient: number;
  /** Wrong amounts shown without a warning when every amount not confirmed gets one. */
  silentStrict: number;
  /** Amounts the user would be asked to check under each policy. */
  warnedLenient: number;
  warnedStrict: number;
  shown: number;
}

export const emptyAudit = (): Audit => ({
  counts: { "correct-confirmed": 0, "correct-unchecked": 0, "correct-flagged": 0, "wrong-confirmed": 0, "wrong-unchecked": 0, "wrong-flagged": 0, missing: 0 },
  silentLenient: 0, silentStrict: 0, warnedLenient: 0, warnedStrict: 0, shown: 0,
});

/**
 * What the app would show for each priced truth line found by the scorer: the amount on its OCR
 * line, or on the unmatched line under it (as the scorer allows), chosen without looking at the
 * truth. Compared digit for digit with the truth and sorted by the amount's status.
 */
export function auditAmounts(scores: readonly LineScore[], checked: readonly CheckedAmount[]): Audit {
  const audit = emptyAudit();
  const used = new Set(scores.flatMap((s) => (s.ocrLine === null ? [] : [s.ocrLine])));
  const byLine = new Map(checked.map((c) => [c.line, c]));
  for (const s of scores) {
    if (s.line.amount === undefined || s.ocrLine === null) continue;
    const shown = byLine.get(s.ocrLine) ?? (!used.has(s.ocrLine + 1) ? byLine.get(s.ocrLine + 1) : undefined);
    if (!shown) {
      audit.counts.missing++;
      continue;
    }
    const expected = normalizeAmount(s.line.amount);
    const correct = expected !== null && shown.cents === Math.round(Number(expected) * 100);
    audit.counts[`${correct ? "correct" : "wrong"}-${shown.status}`]++;
    audit.shown++;
  }
  const c = audit.counts;
  audit.silentLenient = c["wrong-confirmed"] + c["wrong-unchecked"];
  audit.silentStrict = c["wrong-confirmed"];
  audit.warnedLenient = c["correct-flagged"] + c["wrong-flagged"];
  audit.warnedStrict = audit.warnedLenient + c["correct-unchecked"] + c["wrong-unchecked"];
  return audit;
}

export function addAudits(a: Audit, b: Audit): Audit {
  const out = emptyAudit();
  for (const k of Object.keys(out.counts) as Outcome[]) out.counts[k] = a.counts[k] + b.counts[k];
  out.silentLenient = a.silentLenient + b.silentLenient;
  out.silentStrict = a.silentStrict + b.silentStrict;
  out.warnedLenient = a.warnedLenient + b.warnedLenient;
  out.warnedStrict = a.warnedStrict + b.warnedStrict;
  out.shown = a.shown + b.shown;
  return out;
}
