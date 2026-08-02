"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
const STORAGE_KEY = "unlimited-ocr:theme";

interface ThemeContextValue {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (pref !== "system") root.classList.add(pref);
}

/** Inline script string, injected before hydration to avoid a flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("${STORAGE_KEY}") || "system";
    if (t !== "system") document.documentElement.classList.add(t);
  } catch (e) {}
})();
`;

function readStoredTheme(): ThemePref {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(STORAGE_KEY) as ThemePref | null) || "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: re-evaluated on the client during hydration (after
  // running once with a "system" fallback during static-export prerendering,
  // where `window` doesn't exist), so state matches THEME_INIT_SCRIPT's
  // already-applied class from the very first client render — no effect,
  // no extra re-render, no flash.
  const [theme, setThemeState] = useState<ThemePref>(readStoredTheme);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
