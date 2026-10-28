import { fireEvent, render, screen } from "@testing-library/react";
import { BeforeAfter } from "../src/components/BeforeAfter";

describe("BeforeAfter", () => {
  it("shows the try-it callout until the divider is first moved", () => {
    render(<BeforeAfter />);
    expect(screen.getByText("Try it! Drag me")).toBeInTheDocument();

    const slider = screen.getByRole("slider", { name: "Compare the document before and after repair" });
    fireEvent.change(slider, { target: { value: "40" } });

    expect(slider).toHaveValue("40");
    expect(screen.queryByText("Try it! Drag me")).not.toBeInTheDocument();
  });
});
