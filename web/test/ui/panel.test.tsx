import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DayPoint, PanelCard, PanelData } from "../../ui/api";
import { Layout } from "../../ui/components/Layout";
import { sparklinePath } from "../../ui/components/Sparkline";
import { Home } from "../../ui/pages/Home";
import { comparisonText, PanelView, TEXT_DETAIL, TEXT_NEAR_LIMIT, TEXT_TOTAL_30, TEXT_VISITS_SUM } from "../../ui/pages/Panel";

const point = (day: string, value: number | null, partial = false): DayPoint => ({ day, value, partial });

const soma: PanelCard = {
  id: "soma",
  name: "SOMA",
  domain: "somabwc.com",
  nearLimit: false,
  summary: { yesterday: 1234, dailyAverage: 1000, changePercent: 23, total: 30500 },
  visits: [point("2026-11-02", 900), point("2026-11-03", 1234), point("2026-11-04", 50, true)],
};

const boraei: PanelCard = { ...soma, id: "boraei", name: "BORAEI", domain: "boraei.com", nearLimit: true };
const mohamed: PanelCard = { ...boraei, id: "mohamed-boraei", name: "MOHAMED-BORAEI", domain: "mohamedboraei.com" };

const data: PanelData = { summary: { visitsYesterday: 3702, sites: 3, nearLimit: 2 }, cards: [soma, boraei, mohamed], notice: null };
const panel = (change: Partial<PanelData> = {}) => html(<PanelView data={{ ...data, ...change }} />);

describe("R12 Panel general in the menu", () => {
  it("is the first menu entry and marks itself as the current page", () => {
    const out = html(<Layout route={{ page: "panel" }} notice={null}>x</Layout>);
    expect(out).toContain(`<nav aria-label="Menú"><a href="/panel" aria-current="page">Panel general</a>`);
  });

  it("is where the landing's module leads", () => {
    expect(html(<Home />)).toContain(`href="/panel"`);
  });
});

describe("R13 summary", () => {
  it("has yesterday's visits of all sites, the number of sites and those near the limit", () => {
    const out = panel();
    expect(out).toContain("Visitas ayer");
    expect(out).toContain("3.702");
    expect(out).toMatch(/Sitios<\/span><span class="stat-value">3</);
    expect(out).toMatch(/Con recursos cerca del límite<\/span><span class="stat-value">2</);
  });

  it("explains in an (i) that Visitas ayer adds up every site shown", () => {
    const out = panel();
    expect(out).toContain(`aria-label="Más información"`);
    expect(out).toContain(`role="tooltip">${TEXT_VISITS_SUM}<`);
    expect(out.match(new RegExp(TEXT_VISITS_SUM, "g"))).toHaveLength(1);
  });

  it("explains in an (i) on each card that the total covers the last 30 days with today", () => {
    expect(panel().match(new RegExp(`role="tooltip">${TEXT_TOTAL_30}<`, "g"))).toHaveLength(3);
  });
});

describe("R14 site cards", () => {
  it("has one card per site with name, domain, yesterday, comparison, total, chart and Ver detalle", () => {
    const out = panel();
    expect(out.match(/class="card site-card"/g)).toHaveLength(3);
    for (const text of ["SOMA", "somabwc.com", "1.234", "▲ 23 % sobre su promedio diario", "30.500", `class="sparkline"`]) {
      expect(out).toContain(text);
    }
    expect(out).toContain(`href="/sitios/soma">${TEXT_DETAIL}</a>`);
  });

  it("says whether yesterday was above, below or equal to the average", () => {
    expect(comparisonText(93)).toBe("▲ 93 % sobre su promedio diario");
    expect(comparisonText(-12)).toBe("▼ 12 % bajo su promedio diario");
    expect(comparisonText(0)).toBe("Igual a su promedio diario");
  });

  it("draws the complete days, breaks the line on a missing day and leaves out today", () => {
    expect(sparklinePath([point("a", 0), point("b", 10), point("c", 5, true)])).toBe("M0 32L50 0");
    expect(sparklinePath([point("a", 10), point("b", null), point("c", 10), point("d", 5)])).toBe("M0 0h0M66.67 0L100 16");
    expect(sparklinePath([point("a", null), point("b", null)])).toBe("");
  });
});

describe("R15 near the limit", () => {
  it("shows the word on each card of the shared account, and not on the others", () => {
    const out = panel();
    expect(out.match(new RegExp(TEXT_NEAR_LIMIT, "g"))).toHaveLength(2);
    const somaCard = out.slice(out.indexOf("SOMA"), out.indexOf("BORAEI"));
    expect(somaCard).not.toContain(TEXT_NEAR_LIMIT);
  });
});

describe("R16 missing figures", () => {
  it("shows Sin dato, never 0, in the summary and in a card", () => {
    const empty: PanelCard = { ...soma, summary: { yesterday: null, dailyAverage: null, changePercent: null, total: null } };
    const out = panel({ summary: { ...data.summary, visitsYesterday: null }, cards: [empty] });
    expect(out.match(/Sin dato/g)).toHaveLength(4);
    expect(out).not.toMatch(/class="(stat-value|figure)">0</);
  });

  it("shows the API's notice when a live read failed", () => {
    expect(panel({ notice: "Mostrando datos guardados" })).toContain("Mostrando datos guardados");
  });
});
