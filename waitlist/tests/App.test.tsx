import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { CONTACT_EMAIL, PRIVACY_PATH, TERMS_PATH } from "../src/config";

describe("App privacy section", () => {
  it("names Web3Forms as the email processor and says how to be removed", () => {
    render(<App />);
    const privacy = within(screen.getByRole("region", { name: /stay yours/i }));
    expect(privacy.getByRole("link", { name: "Web3Forms" })).toHaveAttribute("href", "https://web3forms.com/privacy");
    expect(privacy.getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    expect(privacy.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", PRIVACY_PATH);
  });

  it("links the privacy policy and terms from the footer", () => {
    render(<App />);
    const footer = within(screen.getByRole("navigation", { name: "Footer" }));
    expect(footer.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", PRIVACY_PATH);
    expect(footer.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", TERMS_PATH);
  });
});
