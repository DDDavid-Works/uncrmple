import { render, screen } from "@testing-library/react";
import { App } from "../App";
import { PRODUCT_NAME, WORDMARK } from "../config";

describe("branding", () => {
  it("shows the wordmark but names the app properly for screen readers", () => {
    render(<App />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAccessibleName(PRODUCT_NAME);
    expect(heading).toHaveTextContent(WORDMARK);
  });
});
