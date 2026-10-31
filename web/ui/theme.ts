// Theme: the device's until the user chooses, then the choice is remembered in that browser (R4, R5).
export type Theme = "light" | "dark";

export const THEME_KEY = "cbt-theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

/** Storage can be blocked by the browser: the app still works, it just forgets the choice. */
export function rememberedTheme(storage: ThemeStorage): Theme | null {
  try {
    const value = storage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function rememberTheme(storage: ThemeStorage, theme: Theme): void {
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // Not remembered; the theme still changes for this page.
  }
}

export function oppositeTheme(remembered: Theme | null, deviceIsDark: boolean): Theme {
  const current = remembered ?? (deviceIsDark ? "dark" : "light");
  return current === "dark" ? "light" : "dark";
}

function deviceIsDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Without a remembered theme no attribute is set, and the CSS follows the device. */
export function applyRememberedTheme(): void {
  const theme = rememberedTheme(window.localStorage);
  if (theme) document.documentElement.dataset.theme = theme;
}

export function toggleTheme(): void {
  const theme = oppositeTheme(rememberedTheme(window.localStorage), deviceIsDark());
  rememberTheme(window.localStorage, theme);
  document.documentElement.dataset.theme = theme;
}
