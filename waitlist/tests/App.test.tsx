import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { CONTACT_EMAIL } from "../src/config";

describe("App privacy section", () => {
  it("names Web3Forms as the email processor and says how to be removed", () => {
    render(<App />);
    const privacy = within(screen.getByRole("region", { name: /stay yours/i }));
    expect(privacy.getByRole("link", { name: "Web3Forms" })).toHaveAttribute("href", "https://web3forms.com/privacy");
    expect(privacy.getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });
});
