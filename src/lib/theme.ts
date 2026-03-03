// ============================================================
// FlowType — Theme Manager
// Dark / Light mode with system preference detection
// ============================================================

export type Theme = "dark" | "light";

const STORAGE_KEY = "flowtype-theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY) as Theme | null;
}

export function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function getInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
}

export function toggleTheme(): Theme {
  const current = document.documentElement.getAttribute("data-theme") as Theme;
  const next: Theme = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
