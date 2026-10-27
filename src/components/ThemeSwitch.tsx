import { useState } from "react";
import { applyThemePreference, loadThemePreference } from "../lib/browser/theme";
import type { ThemePreference } from "../lib/browser/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Auto" },
];

/** Light (default) / Dark / Auto. Auto follows the system setting; the choice is remembered in this browser. */
export function ThemeSwitch() {
  const [pref, setPref] = useState(loadThemePreference);
  return (
    <fieldset className="theme">
      <legend className="visually-hidden">Colour theme</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className={`theme__option${pref === o.value ? " theme__option--on" : ""}`}>
          <input
            type="radio"
            name="theme"
            value={o.value}
            checked={pref === o.value}
            onChange={() => {
              setPref(o.value);
              applyThemePreference(o.value);
            }}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
