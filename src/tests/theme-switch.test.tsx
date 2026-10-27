import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { THEME_STORAGE_KEY, loadThemePreference } from "../lib/browser/theme";

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("data-theme");
});
afterEach(() => vi.restoreAllMocks());

describe("theme switch", () => {
  it("offers Light, Dark, then Auto, with Light selected by default", () => {
    render(<ThemeSwitch />);
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["light", "dark", "auto"]);
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("applies and remembers each choice; Auto hands over to the system setting", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitch />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "Auto" }));
    expect(root).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("auto");

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(root).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("starts from the saved choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "auto");
    render(<ThemeSwitch />);
    expect(screen.getByRole("radio", { name: "Auto" })).toBeChecked();
  });

  it("falls back to Light for an unknown value or blocked storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(loadThemePreference()).toBe("light");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadThemePreference()).toBe("light");
  });

  it("still switches the page when storage cannot be written", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<ThemeSwitch />);
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(root).toHaveAttribute("data-theme", "dark");
  });
});
