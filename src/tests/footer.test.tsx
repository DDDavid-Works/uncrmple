import { render, screen, within } from "@testing-library/react";
import { App } from "../App";
import { CONTACT_EMAIL, PRIVACY_URL, TERMS_URL, toOrigin } from "../links";

describe("app footer", () => {
  it("links the privacy policy and terms in a new tab, so open work is kept", () => {
    render(<App />);
    const footer = within(screen.getByRole("navigation", { name: "Footer" }));
    for (const [name, href] of [
      [/privacy policy/i, PRIVACY_URL],
      [/terms of use/i, TERMS_URL],
    ] as const) {
      const link = footer.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });

  it("points at the site's privacy and terms pages", () => {
    expect(PRIVACY_URL).toMatch(/^https:\/\/[^/]+\/privacy\/$/);
    expect(TERMS_URL).toMatch(/^https:\/\/[^/]+\/terms\/$/);
  });

  it("adds https:// to a site address configured without it", () => {
    expect(toOrigin("uncrmple-production.up.railway.app/")).toBe("https://uncrmple-production.up.railway.app");
    expect(toOrigin("https://uncrmple.com")).toBe("https://uncrmple.com");
  });
});
