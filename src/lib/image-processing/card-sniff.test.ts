import type { CardDetection } from "../../types/repair";
import { looksLikeIdCard } from "./card-sniff";

const card = (over: Partial<CardDetection> = {}): CardDetection => ({
  corners: [{ x: 0, y: 0 }, { x: 159, y: 0 }, { x: 159, y: 100 }, { x: 0, y: 100 }],
  confidence: 0.99,
  level: "ready",
  aspectRatio: 1.59,
  areaFraction: 0.4,
  edgeSupport: 0.95,
  sideVisibility: [1, 1, 1, 1],
  warnings: [],
  ...over,
});

describe("looksLikeIdCard", () => {
  it("accepts a confident, clean detection with ID-card proportions", () => {
    expect(looksLikeIdCard(card())).toBe(true);
    expect(looksLikeIdCard(card({ aspectRatio: 1.5 }))).toBe(true);
    expect(looksLikeIdCard(card({ aspectRatio: 1.67 }))).toBe(true);
  });

  it("rejects page, passport and receipt proportions", () => {
    for (const aspectRatio of [1.29, 1.41, 1.42, 1.74, 2.5]) expect(looksLikeIdCard(card({ aspectRatio }))).toBe(false);
  });

  it("rejects a less confident, unconfirmed or flagged detection", () => {
    // A box printed on a page scored 0.89 and 0.95 on the test photos.
    expect(looksLikeIdCard(card({ confidence: 0.95 }))).toBe(false);
    expect(looksLikeIdCard(card({ level: "verify" }))).toBe(false);
    expect(looksLikeIdCard(card({ warnings: ["edge-unclear"] }))).toBe(false);
  });
});
