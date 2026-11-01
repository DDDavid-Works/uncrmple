import caddyfile from "../../Caddyfile.template?raw";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "../security-headers";

describe("security headers", () => {
  it("are sent by the production Caddyfile exactly as `vite preview` sends them", () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(caddyfile).toContain(`${name} "${value}"`);
    }
  });

  it("let the page and worker reach no server, only local blob: URLs", () => {
    const connect = CONTENT_SECURITY_POLICY.split("; ").find((d) => d.startsWith("connect-src "));
    expect(connect).toBe("connect-src blob:");
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
  });

  it("forbid inline and third-party scripts", () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self' ");
  });
});
