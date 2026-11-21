import caddyfile from "../../Caddyfile.template?raw";
import { securityTxt } from "../entry-server";
import { CONTACT_EMAIL, SITE_URL } from "../links";

// RFC 9116: Contact and Expires are required, and Expires should be less than a year away.
describe("security.txt", () => {
  const builtAt = new Date("2026-11-21T12:00:00.000Z");
  const fields = Object.fromEntries(
    securityTxt(builtAt)
      .trim()
      .split("\n")
      .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2)]),
  );

  it("names the contact for security reports and its own address", () => {
    expect(fields.Contact).toBe(`mailto:${CONTACT_EMAIL}`);
    expect(fields.Canonical).toBe(`${SITE_URL}/.well-known/security.txt`);
    expect(fields["Preferred-Languages"]).toBe("en");
  });

  it("expires a year after the build, in the RFC's date format", () => {
    expect(fields.Expires).toBe("2027-11-21T12:00:00Z");
  });

  it("is not hidden by the server", () => {
    expect(caddyfile).not.toMatch(/hide [^\n]*\.well-known/);
  });
});
