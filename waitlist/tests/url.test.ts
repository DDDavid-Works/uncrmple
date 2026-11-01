import { describe, expect, it } from "vitest";
import { toOrigin } from "../src/lib/url";

describe("toOrigin", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(toOrigin("uncrmple-production.up.railway.app/")).toBe("https://uncrmple-production.up.railway.app");
  });

  it("keeps an existing scheme and drops trailing slashes", () => {
    expect(toOrigin(" https://uncrmple.com// ")).toBe("https://uncrmple.com");
    expect(toOrigin("http://localhost:7210")).toBe("http://localhost:7210");
  });

  it("leaves an empty setting empty", () => {
    expect(toOrigin("  ")).toBe("");
  });
});
