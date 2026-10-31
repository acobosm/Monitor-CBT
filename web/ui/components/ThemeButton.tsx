import { toggleTheme } from "../theme";

export const THEME_BUTTON_TEXT = "Cambiar tema";

export function ThemeButton() {
  return (
    <button type="button" className="button" onClick={toggleTheme}>
      {THEME_BUTTON_TEXT}
    </button>
  );
}
