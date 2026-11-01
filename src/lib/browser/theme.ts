export type ThemePreference = "light" | "dark" | "auto";

/** Used when nothing (or nothing valid) is saved, or storage is unavailable. */
export const DEFAULT_THEME: ThemePreference = "light";

/** localStorage key; also read by public/theme.js, which index.html loads first, to avoid a flash on load. */
export const THEME_STORAGE_KEY = "theme";

const isPreference = (v: unknown): v is ThemePreference => v === "auto" || v === "light" || v === "dark";

/** The saved choice, or the default when nothing valid is stored or storage is unavailable. */
export function loadThemePreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Apply to the page and remember it in this browser. "auto" follows the system setting. */
export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked (private mode, site data disabled): the choice lasts for this page only.
  }
}
