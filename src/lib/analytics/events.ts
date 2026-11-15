// The complete list of usage events the app may send. Every property is a fixed word or a coarse
// bucket, never text or numbers taken from a photo, a file name or a result, so nothing about a
// document can be sent even by mistake. Adding an event means adding it here, where it is reviewed,
// and to the privacy policy (waitlist/src/PrivacyPage.tsx).
import type { OutputStyle, RepairErrorCode } from "../../types/repair";

/** A count, reported only as a range. */
export type CountBucket = "0" | "1" | "2-5" | "6-10" | "11+";

export function countBucket(n: number): CountBucket {
  if (n <= 0) return "0";
  if (n === 1) return "1";
  if (n <= 5) return "2-5";
  if (n <= 10) return "6-10";
  return "11+";
}

/** What started a page repair: the first repair (or "Repair again"), set corners, a style change or a turn. */
export type RepairTrigger = "repair" | "corners" | "style" | "rotate";

/** Where a page outline came from: found automatically, the whole photo (nothing usable found), or set by hand. */
export type RepairSource = "detected" | "whole-image" | "manual";

export type AnalyticsEvent =
  /** Photos added in one go: how many were accepted and how many were turned away. */
  | { name: "upload"; data: { accepted: CountBucket; rejected: CountBucket } }
  | { name: "repair_done"; data: { trigger: RepairTrigger; source: RepairSource; style: OutputStyle } }
  | { name: "repair_failed"; data: { trigger: RepairTrigger; code: RepairErrorCode } }
  /** Automatic card detection: cropped at once, needs the corners checked, nothing found, or failed. */
  | { name: "card_detect"; data: { result: "ready" | "review" | "none" | "error" } }
  /** A card cropped from corners the user confirmed: as suggested, or moved by hand. */
  | { name: "card_crop"; data: { corners: "suggested" | "adjusted" } }
  /** Cropping the card failed (not "no card found", which is card_detect "none"). */
  | { name: "card_failed"; data: { code: RepairErrorCode } }
  /** Back to the untouched original photo. */
  | { name: "card_reset"; data: Record<string, never> }
  /** "Download image" for one repaired page or cropped card. */
  | { name: "image_download"; data: { mode: "page" | "card" } }
  /** One PDF or ZIP of every finished photo. */
  | { name: "export"; data: { format: "pdf" | "zip"; pages: CountBucket } }
  | { name: "export_failed"; data: { format: "pdf" | "zip" } };

export type EventName = AnalyticsEvent["name"];
