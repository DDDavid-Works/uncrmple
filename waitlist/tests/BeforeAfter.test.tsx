import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BeforeAfter } from "../src/components/BeforeAfter";

const SLIDER = { name: "Compare the document before and after repair" };

function preferReducedMotion() {
  // With reduced motion the Repair button jumps straight to the result, so no animation frames are needed.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
}

describe("BeforeAfter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts mostly on the original photo with the try-it callout", () => {
    render(<BeforeAfter />);
    expect(screen.getByRole("slider", SLIDER)).toHaveValue("75");
    expect(screen.getByRole("button", { name: "Repair" })).toBeInTheDocument();
    expect(screen.getByText("Try it!")).toBeInTheDocument();
  });

  it("Repair shows the repaired document and can switch back to the original", async () => {
    preferReducedMotion();
    const user = userEvent.setup();
    render(<BeforeAfter />);

    await user.click(screen.getByRole("button", { name: "Repair" }));
    expect(screen.getByRole("slider", SLIDER)).toHaveValue("0");
    expect(screen.queryByText("Try it!")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show original" }));
    expect(screen.getByRole("slider", SLIDER)).toHaveValue("75");
    expect(screen.getByRole("button", { name: "Repair" })).toBeInTheDocument();
  });

  it("switches between the note and receipt samples, starting each one over", async () => {
    preferReducedMotion();
    const user = userEvent.setup();
    render(<BeforeAfter />);
    const note = screen.getByRole("tab", { name: "Note" });
    const receipt = screen.getByRole("tab", { name: "Receipt" });
    expect(note).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Note" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Repair" }));
    await user.click(receipt);
    expect(receipt).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Receipt" })).toBeInTheDocument();
    expect(screen.getByRole("slider", SLIDER)).toHaveValue("75");
    expect(screen.getByRole("button", { name: "Repair" })).toBeInTheDocument();

    // Arrow keys move between tabs, as in any tab list.
    await user.keyboard("{ArrowRight}");
    expect(note).toHaveAttribute("aria-selected", "true");
    expect(note).toHaveFocus();
  });

  it("dragging still compares and hides the callout", () => {
    render(<BeforeAfter />);
    const slider = screen.getByRole("slider", SLIDER);
    fireEvent.change(slider, { target: { value: "30" } });

    expect(slider).toHaveValue("30");
    expect(screen.getByRole("button", { name: "Show original" })).toBeInTheDocument();
    expect(screen.queryByText("Try it!")).not.toBeInTheDocument();
  });
});
