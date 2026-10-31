import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageTraces, sideTraces } from "../../ui/components/Circuit";
import { FOOTER_TEXT, Layout } from "../../ui/components/Layout";
import { THEME_BUTTON_TEXT } from "../../ui/components/ThemeButton";
import css from "../../ui/styles.css?raw";
import { oppositeTheme, rememberedTheme, rememberTheme, THEME_KEY } from "../../ui/theme";

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

const blocked = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

const layout = () => html(<Layout route={{ page: "usage" }} notice={<p>aviso</p>}>datos</Layout>);

describe("R1 logo", () => {
  it("has both versions, and each theme shows only its own", () => {
    const out = layout();
    expect(out).toContain(`class="logo-light"`);
    expect(out).toContain(`class="logo-dark"`);
    expect(css).toMatch(/\.logo-light\s*{\s*display: var\(--logo-light\)/);
    expect(css).toMatch(/\.logo-dark\s*{\s*display: var\(--logo-dark\)/);
    expect(css).toMatch(/--logo-light: block;\s*--logo-dark: none;/);
    expect(css).toMatch(/--logo-light: none;\s*--logo-dark: block;/);
  });
});

describe("R2 design system tokens", () => {
  it("defines the light and dark values", () => {
    for (const value of ["--surface-100: #f5f7fb", "--surface-100: #0b0f2e", "--brand: #2a3676", "--brand: #9fb0f2", "--space-4: 16px", "--radius-lg: 12px"]) {
      expect(css).toContain(value);
    }
  });

  it("uses no leftover hard-coded color outside the token definitions", () => {
    const rules = css.slice(css.indexOf("* {"));
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("draws the fixed circuit of the prototype", () => {
    expect(pageTraces()).toHaveLength(38);
    expect(pageTraces()).toEqual(pageTraces());
    expect(sideTraces()).toHaveLength(8);
    expect(layout()).toContain(`class="page-circuit"`);
  });
});

describe("R3 fonts", () => {
  it("uses IBM Plex Sans for the interface and IBM Plex Mono for figures", () => {
    expect(css).toContain(`--font-sans: "IBM Plex Sans"`);
    expect(css).toContain(`--font-mono: "IBM Plex Mono"`);
    expect(css).toMatch(/\.numeric\s*{[^}]*var\(--font-mono\)/);
    expect(css).not.toContain("googleapis");
  });
});

describe("R4 first visit", () => {
  it("has no remembered theme, so the device's is used", () => {
    expect(rememberedTheme(fakeStorage())).toBeNull();
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });

  it("ignores an unknown stored value", () => {
    expect(rememberedTheme(fakeStorage({ [THEME_KEY]: "pink" }))).toBeNull();
  });

  it("survives blocked storage", () => {
    expect(rememberedTheme(blocked)).toBeNull();
    expect(() => rememberTheme(blocked, "dark")).not.toThrow();
  });
});

describe("R5 Cambiar tema", () => {
  it("has the button", () => {
    expect(layout()).toContain(THEME_BUTTON_TEXT);
  });

  it("switches from the remembered theme, or else from the device's", () => {
    expect(oppositeTheme("dark", false)).toBe("light");
    expect(oppositeTheme("light", true)).toBe("dark");
    expect(oppositeTheme(null, true)).toBe("light");
    expect(oppositeTheme(null, false)).toBe("dark");
  });

  it("remembers the choice", () => {
    const storage = fakeStorage();
    rememberTheme(storage, "dark");
    expect(rememberedTheme(storage)).toBe("dark");
  });

  it("lets a chosen theme override the device's", () => {
    expect(css).toContain(`:root:not([data-theme="light"])`);
    expect(css).toContain(`:root[data-theme="dark"]`);
  });
});

describe("R6 side menu", () => {
  it("has the menu, Salir and the current page marked", () => {
    const out = layout();
    expect(out).toContain(`class="side"`);
    expect(out).toContain(`href="/consumo" aria-current="page"`);
    expect(out).toContain("Salir");
  });
});

describe("R7 keeps what spec 001 shows", () => {
  it("still has the notice, the content and the footer", () => {
    const out = layout();
    expect(out).toContain("aviso");
    expect(out).toContain("datos");
    expect(out).toContain(FOOTER_TEXT);
  });
});
