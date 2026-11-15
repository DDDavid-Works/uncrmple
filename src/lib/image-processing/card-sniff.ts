import type { CardDetection } from "../../types/repair";

/**
 * Proportions accepted as an ID-1 card (bank, ID, membership: 85.6 × 53.98 mm, 1.586:1), within
 * about 6% for the estimate's error under perspective. Paper pages (A4 1.41, Letter 1.29), open
 * passports (about 1.42) and receipts (long and narrow) fall outside.
 */
export const ID_CARD_ASPECT: readonly [number, number] = [1.49, 1.68];
/**
 * A card found this confidently. Shapes printed on a page (a banner, a framed box) can have card
 * proportions; on the test photos they scored at most 0.95, real cards 0.99.
 */
export const ID_CARD_MIN_CONFIDENCE = 0.97;

/**
 * Whether a card detection is clear enough to open ID & Card Crop for a photo on its own. Only a
 * confident, fully visible detection with ID-card proportions counts: a wrong switch costs the user
 * a click to switch back, but should still be rare.
 */
export function looksLikeIdCard(d: CardDetection): boolean {
  return (
    d.level === "ready" &&
    d.warnings.length === 0 &&
    d.confidence >= ID_CARD_MIN_CONFIDENCE &&
    d.aspectRatio >= ID_CARD_ASPECT[0] &&
    d.aspectRatio <= ID_CARD_ASPECT[1]
  );
}
