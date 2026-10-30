import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TermsPage } from "../src/TermsPage";
import { CONTACT_EMAIL, PRIVACY_PATH, TERMS_UPDATED } from "../src/config";

describe("TermsPage", () => {
  it("shows the date, links the privacy policy and gives a contact", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of use" })).toBeInTheDocument();
    expect(screen.getByText(`Last updated ${TERMS_UPDATED}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", PRIVACY_PATH);
    expect(screen.getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });

  it("says a repaired image is not an official copy and forbids forgery", () => {
    render(<TermsPage />);
    expect(screen.getByText(/not a certified, notarised or official copy/)).toBeInTheDocument();
    expect(screen.getByText(/forge, alter or falsify a document/)).toBeInTheDocument();
  });
});
