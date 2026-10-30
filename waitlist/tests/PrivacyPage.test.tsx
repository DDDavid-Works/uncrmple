import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPage } from "../src/PrivacyPage";
import { CONTACT_EMAIL, OPERATOR_NAME, PRIVACY_UPDATED } from "../src/config";

describe("PrivacyPage", () => {
  it("names the operator, the date and how to reach them", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByText(`Last updated ${PRIVACY_UPDATED}`)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(OPERATOR_NAME)).length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: CONTACT_EMAIL })) {
      expect(link).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    }
  });

  it("names every service that handles signups and where to complain", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "Web3Forms" })).toHaveAttribute("href", "https://web3forms.com/privacy");
    expect(screen.getByRole("link", { name: "Railway" })).toHaveAttribute("href", "https://railway.com/legal/privacy");
    expect(screen.getByRole("link", { name: "National Privacy Commission" })).toHaveAttribute(
      "href",
      "https://privacy.gov.ph",
    );
  });

  it("points the header button back to the home page form", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/#waitlist");
  });
});
