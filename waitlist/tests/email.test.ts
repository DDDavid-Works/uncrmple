import { checkEmail } from "../src/lib/email";

describe("checkEmail", () => {
  it("accepts and trims a valid address", () => {
    expect(checkEmail("  a@b.co ")).toEqual({ ok: true, email: "a@b.co" });
  });
  it.each(["", "   ", "plain", "a@b", "a b@c.com", "@c.com", `${"a".repeat(250)}@b.com`])("rejects %j", (v) => {
    expect(checkEmail(v).ok).toBe(false);
  });
});
