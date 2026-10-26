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
  it("defaults to Auto, which follows the system setting", () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole("radio", { name: "Auto" })).toBeChecked();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("applies and remembers Light or Dark, and Auto clears the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitch />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(root).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    await user.click(screen.getByRole("radio", { name: "Auto" }));
    expect(root).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("starts from the saved choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeSwitch />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("falls back to Auto for an unknown value or blocked storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(loadThemePreference()).toBe("auto");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadThemePreference()).toBe("auto");
  });

  it("still switches the page when storage cannot be written", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<ThemeSwitch />);
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(root).toHaveAttribute("data-theme", "light");
  });
});
