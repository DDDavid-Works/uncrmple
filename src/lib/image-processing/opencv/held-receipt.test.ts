// @vitest-environment node
import { boxBlur, HELD_RECEIPT, heldReceiptPhoto } from "../../../tests/synthetic";
import { repair } from "../pipeline";
import { createOpenCvProcessor } from "./processor";

const processor = createOpenCvProcessor();
const { height: H, left, right } = HELD_RECEIPT;

describe("a long receipt held in the hand, running off the top and bottom of the photo", () => {
  it("is repaired, cropped to the receipt between the dark surfaces, not refused or left whole", async () => {
    // Soft focus, as in a forwarded phone photo: print too soft for strong edges at full size
    // (edge density about 0.003 here, under the 0.015 "any print at all" floor), plain at half size.
    const photo = boxBlur(heldReceiptPhoto(), 2, 2);
    const r = await repair(processor, photo, { enhance: { style: "grayscale", profile: "receipt" } });
    expect(r.ok ? "ok" : r.error.message).toBe("ok");
    if (!r.ok) return;
    expect(r.value.source).not.toBe("whole-image");
    const [tl, tr, br, bl] = r.value.corners;
    expect(Math.abs(tl.x - left[0])).toBeLessThan(12);
    expect(Math.abs(tr.x - right[0])).toBeLessThan(12);
    expect(Math.abs(br.x - right[1])).toBeLessThan(12);
    expect(Math.abs(bl.x - left[1])).toBeLessThan(12);
    expect(Math.max(tl.y, tr.y)).toBeLessThan(12);
    expect(Math.min(bl.y, br.y)).toBeGreaterThan(H - 12);
  }, 120_000);
});
