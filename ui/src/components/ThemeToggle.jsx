import { useEffect, useState } from "react";

const KEY = "geo-theme";
export const THEMES = ["light", "dark", "system"];

export function applyTheme(theme, root = document.documentElement) {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function storedTheme(storage = globalThis.localStorage) {
  const v = storage?.getItem(KEY);
  return THEMES.includes(v) ? v : "system";
}

/** Light / Dark / System. The explicit choice overrides the OS in both directions. */
export function ThemeToggle() {
  const [theme, setTheme] = useState(storedTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode — the choice just does not persist */
    }
  }, [theme]);

  return (
    <select
      aria-label="Colour theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value)}
      className="small"
    >
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="system">System</option>
    </select>
  );
}
