import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pageTraces, sideTraces } from "../../ui/components/Circuit";
import { FOOTER_TEXT, Layout } from "../../ui/components/Layout";
import { tipShift } from "../../ui/components/LineChart";
import { makeNodes, moveNodes, startNetwork, type NetworkWindow } from "../../ui/components/NodeNetwork";
import { THEME_BUTTON_TEXT } from "../../ui/components/ThemeButton";
import { Home, LANDING_TEXT, LANDING_TITLE, MODULE_NAME } from "../../ui/pages/Home";
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

/** A canvas of 700×700 and a browser whose frames only run when the test says so. */
function fakeNetwork(reducedMotion: boolean) {
  const drawing = { clearRect: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), stroke: vi.fn() };
  const canvas = { getContext: () => drawing, getBoundingClientRect: () => ({ width: 700, height: 700 }), width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const win = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame: vi.fn(() => 5),
    cancelAnimationFrame: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return { canvas, drawing, win, browser: win as unknown as NetworkWindow };
}

describe("R8 dark landing", () => {
  it("has the logo for dark backgrounds, the title and the text", () => {
    const out = html(<Home />);
    expect(out).toContain(`class="landing-logo"`);
    expect(out).toContain(LANDING_TITLE);
    expect(out).toContain(LANDING_TEXT);
  });

  it("is dark in either theme", () => {
    expect(css).toMatch(/\.landing {\s*color-scheme: dark;\s*--surface-100: #0b0f2e;/);
  });
});

describe("R9 node network", () => {
  it("is on the landing, hidden from screen readers", () => {
    expect(html(<Home />)).toContain(`class="node-network" aria-hidden="true"`);
  });

  it("starts with the same nodes on every load, as many as fit up to 70", () => {
    expect(makeNodes(700, 700)).toEqual(makeNodes(700, 700));
    expect(makeNodes(700, 700)).toHaveLength(35);
    expect(makeNodes(1600, 1000)).toHaveLength(70);
  });

  it("moves the nodes, which turn back at the edge", () => {
    const node = { x: 99.9, y: 50, vx: 0.2, vy: 0, color: "x" };
    moveNodes([node], 100, 100);
    expect(node.x).toBeCloseTo(100.1);
    expect(node.vx).toBe(-0.2);
  });

  it("keeps animating, and stops when leaving the landing", () => {
    const { canvas, win, browser } = fakeNetwork(false);
    const stop = startNetwork(canvas, browser);
    expect(win.requestAnimationFrame).toHaveBeenCalledOnce();
    stop();
    expect(win.cancelAnimationFrame).toHaveBeenCalledWith(5);
    expect(win.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});

describe("R10 reduced motion", () => {
  it("draws the network once and does not animate it", () => {
    const { canvas, drawing, win, browser } = fakeNetwork(true);
    startNetwork(canvas, browser);
    expect(drawing.clearRect).toHaveBeenCalledOnce();
    expect(drawing.arc).toHaveBeenCalledTimes(35);
    expect(win.requestAnimationFrame).not.toHaveBeenCalled();
  });
});

describe("R11 module selector", () => {
  it("has the only module", () => {
    const out = html(<Home />);
    expect(out).toContain(MODULE_NAME);
    expect(out.match(/<li>/g)).toHaveLength(1);
  });
});

/** The body of an at-rule, up to its matching brace. */
function atRule(header: string): string {
  const start = css.indexOf(`${header} {`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
}

/** The declarations of `selector` inside `block`. */
function rule(block: string, selector: string): string {
  const match = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(block);
  return match?.[2] ?? "";
}

const phone = atRule("@media (max-width: 860px)");

describe("R36 menu on top", () => {
  it("puts the menu above the content at 860 px or less, logo and links in rows", () => {
    expect(rule(phone, ".app")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(rule(phone, ".side")).toContain("position: static");
    expect(rule(phone, ".side")).toContain("height: auto");
    expect(rule(phone, "nav")).toContain("flex-wrap: wrap");
  });
});

describe("R37 one column", () => {
  it("shows cards and charts in a single column", () => {
    expect(phone).toMatch(/\.stats,\s*\.site-cards,\s*\.usage-cards\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });
});

describe("R38 no sideways scroll", () => {
  it("lets no fixed width wider than 360 px push the page", () => {
    const widths = [...css.matchAll(/(?<![-\w])(min-width|width):\s*(\d+)px/g)].map((m) => Number(m[2]));
    expect(widths.every((w) => w <= 360)).toBe(true);
  });

  it("opens the (i) messages as a strip inside the screen, and keeps the chart readout inside the chart", () => {
    const tip = rule(phone, '.info-tip [role="tooltip"]');
    expect(tip).toContain("position: fixed");
    expect(tip).toContain("left: var(--space-4)");
    expect(tip).toContain("right: var(--space-4)");
    expect([tipShift(0.1), tipShift(0.5), tipShift(0.9)]).toEqual(["none", "translateX(-50%)", "translateX(-100%)"]);
  });
});

describe("R39 wide tables", () => {
  it("scroll sideways inside their own frame", () => {
    expect(rule(css, ".table-scroll")).toContain("overflow-x: auto");
  });
});

describe("R40 landing on a phone", () => {
  it("takes the whole width, with the network still moving", () => {
    expect(rule(phone, ".landing main")).toContain("width: 100%");
    expect(phone).not.toContain("node-network");
  });
});

describe("R41 touch targets", () => {
  it("makes links and buttons at least 44 px tall on touch screens, and the (i) 44 px to touch", () => {
    const touch = atRule("@media (pointer: coarse)");
    expect(touch).toMatch(/nav a,\s*\.button,\s*select\s*\{[^}]*min-height: 44px/);
    expect(rule(touch, ".info-tip button::after")).toContain("inset: -13px");
  });
});
