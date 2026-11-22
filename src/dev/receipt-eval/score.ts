/**
 * Scores OCR output against hand-typed ground truth for the receipt spike (development only, see
 * docs/receipt-mode.md). Pure functions: no OCR or browser APIs, so they can be unit-tested.
 *
 * - A truth line is "found" when some OCR line contains its words closely enough (spaces and
 *   punctuation ignored, amounts removed). Each stretch of an OCR line can be used once; two truth
 *   lines printed side by side may match different parts of the same OCR line.
 * - An amount is "in row" when that matched OCR line, or the unmatched line right under it, holds
 *   the exact printed amount, digit for digit, and "anywhere" when any OCR line holds it. The gap
 *   between the two shows row assignment errors.
 */
import { normalizeAmount, type ReceiptTruth, type TruthLine } from "./truth";

/** Minimum similarity (0..1) for a truth line to count as found. */
export const MATCH_THRESHOLD = 0.8;

export interface OcrLine {
  text: string;
  /** Tesseract line confidence, 0..100. */
  confidence: number;
}

export interface LineScore {
  /** Index into truth.lines. */
  index: number;
  line: TruthLine;
  /** Index into the OCR lines, or null when not found. */
  ocrLine: number | null;
  similarity: number;
  /** Only for lines with an amount. */
  amountInRow?: boolean;
  amountAnywhere?: boolean;
}

export type TotalResult = "correct" | "wrong-amount" | "line-not-found" | "not-in-truth";

export interface ReceiptScore {
  lines: LineScore[];
  /** Truth lines that count (not ignored). */
  scoredLines: number;
  foundLines: number;
  /** Scored truth lines with an amount. */
  pricedLines: number;
  amountsInRow: number;
  amountsAnywhere: number;
  total: TotalResult;
}

/** Upper-case letters and digits only, so spacing and punctuation errors do not count. */
export function normalizeText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Amounts found in an OCR line, normalised. Tolerates a trailing tax flag printed after the
 * amount ("25.00V", "25.00 T") and a currency mark before it.
 */
export function amountsIn(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^(.*\d\)?-?)[A-Za-z]{1,2}$/, "$1");
    const amount = normalizeAmount(token);
    if (amount !== null) found.push(amount);
  }
  return found;
}

/** The line's text with decimal amounts taken out, for comparing words only. */
function wordsOf(text: string): string {
  return normalizeText(
    text
      .split(/\s+/)
      .filter((t) => !(/[.,]\d/.test(t) && amountsIn(t).length > 0))
      .join(" "),
  );
}

/**
 * Edit distance between `needle` and its best-matching stretch of `haystack` (free start and end
 * in the haystack), so a truth line is found inside a longer OCR line.
 */
export function substringDistance(needle: string, haystack: string): number {
  return bestStretch(needle, haystack).distance;
}

/** Where in `haystack` the best match for `needle` lies: [start, end) and its edit distance. */
export function bestStretch(needle: string, haystack: string): { distance: number; start: number; end: number } {
  if (needle.length === 0) return { distance: 0, start: 0, end: 0 };
  let prev = new Array<number>(haystack.length + 1).fill(0);
  // Where the alignment ending at each cell began in the haystack.
  let prevStart = Array.from({ length: haystack.length + 1 }, (_, j) => j);
  for (let i = 1; i <= needle.length; i++) {
    const cur = new Array<number>(haystack.length + 1);
    const curStart = new Array<number>(haystack.length + 1);
    cur[0] = i;
    curStart[0] = 0;
    for (let j = 1; j <= haystack.length; j++) {
      const cost = needle[i - 1] === haystack[j - 1] ? 0 : 1;
      const diag = prev[j - 1]! + cost, up = prev[j]! + 1, left = cur[j - 1]! + 1;
      if (diag <= up && diag <= left) {
        cur[j] = diag;
        curStart[j] = prevStart[j - 1]!;
      } else if (up <= left) {
        cur[j] = up;
        curStart[j] = prevStart[j]!;
      } else {
        cur[j] = left;
        curStart[j] = curStart[j - 1]!;
      }
    }
    prev = cur;
    prevStart = curStart;
  }
  let end = 0;
  for (let j = 1; j <= haystack.length; j++) if (prev[j]! < prev[end]!) end = j;
  return { distance: prev[end]!, start: prevStart[end]!, end };
}

export function similarity(truthText: string, ocrText: string): number {
  const needle = normalizeText(truthText);
  if (needle.length === 0) return 0;
  return Math.max(0, 1 - substringDistance(needle, wordsOf(ocrText)) / needle.length);
}

/** Similarity and where it matched, in the OCR line's words (see wordsOf). */
function locate(truthText: string, ocrText: string): { sim: number; start: number; end: number } {
  const needle = normalizeText(truthText);
  if (needle.length === 0) return { sim: 0, start: 0, end: 0 };
  const m = bestStretch(needle, wordsOf(ocrText));
  return { sim: Math.max(0, 1 - m.distance / needle.length), start: m.start, end: m.end };
}

/**
 * Matches truth lines to OCR lines. Each truth line takes the unused OCR line it resembles most;
 * ties go to the first line at or after the previous match, so repeated items keep their order.
 */
export function scoreReceipt(truth: ReceiptTruth, ocr: readonly OcrLine[]): ReceiptScore {
  // Parts of each OCR line already matched, [start, end) in its words: a row can hold two printed
  // blocks side by side ("Received the above…" and "Grand Total"), but one stretch of text counts once.
  const taken = new Map<number, [number, number][]>();
  const used = { has: (j: number) => taken.has(j) };
  const overlaps = (j: number, start: number, end: number) =>
    (taken.get(j) ?? []).some(([a, b]) => start < b && end > a);
  const allAmounts = new Set(ocr.flatMap((l) => amountsIn(l.text)));
  const lines: LineScore[] = [];
  let cursor = 0;

  truth.lines.forEach((line, index) => {
    if (line.ignore) return;
    let best = -1;
    let bestSim = 0;
    let bestSpan: [number, number] = [0, 0];
    for (let j = 0; j < ocr.length; j++) {
      const { sim, start, end } = locate(line.text, ocr[j]!.text);
      if (overlaps(j, start, end)) continue;
      if (sim > bestSim || (sim === bestSim && best >= 0 && best < cursor && j >= cursor)) {
        best = j;
        bestSim = sim;
        bestSpan = [start, end];
      }
    }
    const ocrLine = best >= 0 && bestSim >= MATCH_THRESHOLD ? best : null;
    if (ocrLine !== null) {
      taken.set(ocrLine, [...(taken.get(ocrLine) ?? []), bestSpan]);
      cursor = ocrLine + 1;
    }
    lines.push({ index, line, ocrLine, similarity: bestSim });
  });

  // Amounts are checked once every line is matched, so a continuation line is known to belong to
  // no other truth line.
  for (const score of lines) {
    if (score.line.amount === undefined) continue;
    const expected = normalizeAmount(score.line.amount);
    score.amountAnywhere = expected !== null && allAmounts.has(expected);
    score.amountInRow = false;
    if (score.ocrLine === null || expected === null) continue;
    // The item's own line, plus the next one when it matched no truth line: a wrapped name or a
    // "2 x 18.50   37.00" line printed under the item, which the table joins into one row.
    const rows = [score.ocrLine];
    const next = score.ocrLine + 1;
    if (next < ocr.length && !used.has(next)) rows.push(next);
    score.amountInRow = rows.some((r) => amountsIn(ocr[r]!.text).includes(expected));
  }

  const priced = lines.filter((l) => l.line.amount !== undefined);
  const totalLine = lines.find((l) => l.line.kind === "total");
  const total: TotalResult = !totalLine
    ? "not-in-truth"
    : totalLine.ocrLine === null
      ? "line-not-found"
      : totalLine.amountInRow
        ? "correct"
        : "wrong-amount";

  return {
    lines,
    scoredLines: lines.length,
    foundLines: lines.filter((l) => l.ocrLine !== null).length,
    pricedLines: priced.length,
    amountsInRow: priced.filter((l) => l.amountInRow).length,
    amountsAnywhere: priced.filter((l) => l.amountAnywhere).length,
    total,
  };
}

export interface Summary {
  receipts: number;
  lineRecall: number | null;
  amountsInRow: number | null;
  amountsAnywhere: number | null;
  totalsCorrect: number;
  /** Receipts whose truth has a readable total. */
  totalsPossible: number;
}

/** Pooled over all lines (not averaged per receipt), so long receipts weigh more. */
export function summarize(scores: readonly ReceiptScore[]): Summary {
  const sum = (pick: (s: ReceiptScore) => number) => scores.reduce((n, s) => n + pick(s), 0);
  const ratio = (num: number, den: number) => (den === 0 ? null : num / den);
  const priced = sum((s) => s.pricedLines);
  return {
    receipts: scores.length,
    lineRecall: ratio(sum((s) => s.foundLines), sum((s) => s.scoredLines)),
    amountsInRow: ratio(sum((s) => s.amountsInRow), priced),
    amountsAnywhere: ratio(sum((s) => s.amountsAnywhere), priced),
    totalsCorrect: scores.filter((s) => s.total === "correct").length,
    totalsPossible: scores.filter((s) => s.total !== "not-in-truth").length,
  };
}
