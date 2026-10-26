export type ThemePreference = "auto" | "light" | "dark";

/** localStorage key; also read by the inline script in index.html to avoid a flash on load. */
export const THEME_STORAGE_KEY = "theme";

const isPreference = (v: unknown): v is ThemePreference => v === "auto" || v === "light" || v === "dark";

/** The saved choice, or "auto" when nothing (or nothing valid) is stored or storage is unavailable. */
export function loadThemePreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Apply to the page and remember it in this browser. "auto" follows the system setting. */
export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "auto") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked (private mode, site data disabled): the choice lasts for this page only.
  }
}
