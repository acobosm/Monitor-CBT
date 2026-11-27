import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountUsage, DayPoint, SiteData, UsageChart } from "../../ui/api";
import { LineChart, linePaths, niceCeil, pointText, scaleTop, TEXT_NO_CHART_DATA, TEXT_RESCALED, TEXT_TODAY } from "../../ui/components/LineChart";
import { formatMs, formatNumber } from "../../ui/format";
import { SiteView } from "../../ui/pages/Site";
import { CPU_LIMIT_MS, TEXT_CPU_LIMIT, TEXT_CPU_SECTION, TEXT_CUT_TITLE, TEXT_P50_INFO, TEXT_P50_TITLE, TEXT_P99_INFO, TEXT_P99_TITLE, UsageView } from "../../ui/pages/Usage";

const point = (day: string, value: number | null, partial = false): DayPoint => ({ day, value, partial });
const days = (values: (number | null)[]) => values.map((v, i) => point(`2026-10-${String(i + 6).padStart(2, "0")}`, v, i === values.length - 1));

describe("R26 site chart", () => {
  it("shows on each site's page the daily visits chart, above the daily traffic table", () => {
    const site = { id: "soma", name: "SOMA", notice: null, traffic: { note: "", rows: [] }, visits: days([5, 7, 3]), pageViewsNotice: null, days: [], selectedDay: null, unavailableText: null, countries: [], topTrafficIps: [], topSecurityIps: [] } as SiteData;
    const out = html(<SiteView data={site} onSelectDay={() => {}} />);
    expect(out).toContain("Visitas diarias");
    expect(out.indexOf(`class="line-chart"`)).toBeLessThan(out.indexOf("Tráfico diario"));
  });
});

describe("R27 today", () => {
  it("labels the last day Hoy (parcial) and draws the step into it dashed", () => {
    const out = html(<LineChart points={days([5, 7, 3])} format={formatNumber} label="x" />);
    expect(out).toContain(TEXT_TODAY);
    expect(linePaths(days([5, 10, 3]), 10)).toEqual({ solid: "M72 104L348 16", partial: "M348 16L624 139.2" });
  });
});

describe("R28 limit line", () => {
  it("draws the dashed Límite line when the limit falls inside the scale", () => {
    const out = html(<LineChart points={days([80, 95, 10])} format={formatNumber} limit={100} label="x" />);
    expect(out).toContain(`<g class="limit">`);
    expect(out).toContain("Límite");
    expect(out).not.toContain(TEXT_RESCALED);
  });

  it("writes the limit above the chart when it is far above the data", () => {
    const out = html(<LineChart points={days([800, 950, 100])} format={formatNumber} limit={100000} label="x" />);
    expect(out).not.toContain(`<g class="limit">`);
    expect(out).toContain(`Límite: 100.000 <span class="rescaled">(${TEXT_RESCALED})</span>`);
  });

  it("has one chart per metric, with a line per account", () => {
    const chart = (metric: string, value: number): UsageChart => ({ product: "d1", metric, label: metric, period: "daily", limit: 100000, points: days([value, value, 1]) });
    const account = (id: string, value: number) =>
      ({ id, name: id.toUpperCase(), live: true, rows: [], charts: [chart("rows_read", value), chart("rows_written", value)], cpu: [], limitsCheckedText: "", unclassifiedText: null }) as AccountUsage;
    const out = html(<UsageView data={{ accounts: [account("cobtec", 10), account("soma", 900)], notice: null }} />);
    expect(out.match(/class="line-chart"/g)).toHaveLength(2);
    expect(out.match(/<g class="series s[12]">/g)).toHaveLength(4);
    // One scale per chart for every account: COBTEC's 10 sits low against SOMA's 900.
    expect(out.match(/>1\.000<\/text>/g)).toHaveLength(2);
  });

  it("can draw every account on one chart, with a legend and a color each", () => {
    const series = [
      { name: "COBTEC", points: days([10, 20, 1]) },
      { name: "SOMA", points: days([900, null, 5]) },
    ];
    const out = html(<LineChart series={series} format={formatNumber} limit={100000} label="x" />);
    expect(out).toContain(`<ul class="legend">`);
    expect(out).toMatch(/<li>.*COBTEC<\/li><li>.*SOMA<\/li>/);
    expect(out.match(/<g class="series s1">/g)).toHaveLength(1);
    expect(out.match(/<g class="series s2">/g)).toHaveLength(1);
    expect(out).toContain(TEXT_RESCALED);
  });

  it("has no legend for a single series", () => {
    expect(html(<LineChart points={days([1, 2, 3])} format={formatNumber} label="x" />)).not.toContain("legend");
  });
});

describe("R32 readout", () => {
  it("shows the day and its figure in es-EC", () => {
    expect(pointText(point("2026-11-03", 1234), formatNumber)).toBe("03/11/2026 · 1.234");
    expect(pointText(point("2026-11-04", 38, true), formatNumber)).toBe("Hoy (parcial) · 38");
    expect(pointText(point("2026-11-02", null), formatNumber)).toBe("02/11/2026 · Sin dato");
  });
});

describe("R33 gaps", () => {
  it("breaks the line on a missing day instead of drawing a 0", () => {
    const { solid } = linePaths(days([5, null, 5, 5, null, 2]), 10);
    expect(solid.match(/M/g)).toHaveLength(2);
    expect(solid).not.toContain(" 192");
  });

  it("draws a lone day as a dot", () => {
    expect(linePaths(days([null, 5, null, 1]), 10).solid).toMatch(/^M[\d.]+ [\d.]+h0$/);
  });
});

describe("R34 no data", () => {
  it("says so instead of drawing an empty chart", () => {
    expect(html(<LineChart points={days([null, null, null])} format={formatNumber} label="x" />)).toBe(`<p class="note">${TEXT_NO_CHART_DATA}</p>`);
  });
});

describe("scale", () => {
  it("rounds the top up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect([niceCeil(0), niceCeil(1), niceCeil(3), niceCeil(142), niceCeil(1320), niceCeil(2.2e6)]).toEqual([1, 1, 5, 200, 2000, 2.5e6]);
    expect(scaleTop([days([10, 3]), days([900, 1])])).toBe(1000);
  });
});

describe("spec 004 R10–R13 R20 R21 Workers CPU cards", () => {
  const script = (name: string, label: string, p50: (number | null)[], p99: (number | null)[], cut: (number | null)[]) => ({
    script: name,
    label,
    p50: days(p50),
    p99: days(p99),
    cut: days(cut),
  });
  const account = (id: string, cpu: AccountUsage["cpu"]) =>
    ({ id, name: id.toUpperCase(), live: true, rows: [], charts: [], cpu, limitsCheckedText: "", unclassifiedText: null }) as AccountUsage;
  const boraei = account("boraei", [
    script("__unknown__", "Sin script", [8.1, null, 2], [29, null, 5], [103, null, 0]),
    script("mohamed-boraei", "mohamed-boraei", [8.66, 1, 1], [108.96, 20, 9], [0, 0, 0]),
  ]);
  const view = (accounts: AccountUsage[]) => html(<UsageView data={{ accounts, notice: null }} />);
  // From the CPU heading to the end of its last account (the usage tables come after it).
  const section = (out: string) => {
    const start = out.indexOf(`<h2>${TEXT_CPU_SECTION}</h2>`);
    return out.slice(start, out.indexOf("</section></section>", start));
  };

  const esc = (text: string) => text.replace(/[.()]/g, "\\$&");

  it("R10 R11 shows, per account, a p50 card, a p99 card and a cut requests card, in that order", () => {
    const out = view([boraei, account("soma", [script("soma-web", "soma-web", [1, 1, 1], [9, 9, 9], [0, 0, 0])])]);
    for (const title of [TEXT_P50_TITLE, TEXT_P99_TITLE, TEXT_CUT_TITLE]) expect(out.match(new RegExp(`<h4>${esc(title)}`, "g"))).toHaveLength(2);
    const cpu = section(out);
    expect(cpu.indexOf(TEXT_P50_TITLE)).toBeLessThan(cpu.indexOf(TEXT_P99_TITLE));
    expect(cpu.indexOf(TEXT_P99_TITLE)).toBeLessThan(cpu.indexOf(TEXT_CUT_TITLE));
    expect(cpu.indexOf("BORAEI")).toBeLessThan(cpu.indexOf("SOMA"));
    expect(cpu).toContain(`class="usage-cards cpu-cards"`);
  });

  it("R10 gives each script one color in the three cards, with its name in each legend", () => {
    const out = section(view([boraei]));
    expect(out.match(/<g class="series s1">/g)).toHaveLength(3);
    expect(out.match(/<g class="series s2">/g)).toHaveLength(3);
    expect(out.match(/<li>.{0,200}?mohamed-boraei<\/li>/g)).toHaveLength(3);
  });

  it("R10 draws the dashed 10 ms line in the p50 card only, named in the legend so its text never covers the lines", () => {
    const out = html(<LineChart series={[{ name: "a", points: days([8, 30, 5]), slot: 1 }]} format={formatMs} limit={CPU_LIMIT_MS} limitLabel={TEXT_CPU_LIMIT} label="x" />);
    expect(out).toContain(`<g class="limit">`);
    expect(out).toContain(`<li class="limit">`);
    expect(out.match(new RegExp(esc(TEXT_CPU_LIMIT), "g"))).toHaveLength(1);
    const low = html(<LineChart series={[{ name: "a", points: days([0.5, 0.9, 0.2]), slot: 1 }]} format={formatMs} limit={CPU_LIMIT_MS} limitLabel={TEXT_CPU_LIMIT} label="x" />);
    expect(low).toContain(`${TEXT_CPU_LIMIT}: 10,0 ms`);
    expect(low).not.toContain(`<li class="limit">`);
    const cards = section(view([boraei])).split("<h4>");
    expect(cards.filter((card) => card.includes(`<g class="limit">`)).map((card) => card.slice(0, 40))).toEqual([TEXT_P50_TITLE.slice(0, 40)]);
  });

  it("R12 names the unattributed script Sin script", () => {
    expect(section(view([boraei]))).toContain("Sin script</li>");
    expect(section(view([boraei]))).not.toContain("__unknown__");
  });

  it("R13 puts an (i) next to the p50 and the p99 titles, and none on the cut requests card", () => {
    const out = section(view([boraei]));
    expect(out.match(new RegExp(esc(TEXT_P50_INFO), "g"))).toHaveLength(1);
    expect(out.match(new RegExp(esc(TEXT_P99_INFO), "g"))).toHaveLength(1);
    expect(out).toContain(`<h4>${TEXT_CUT_TITLE}</h4>`);
  });

  it("R20 shows milliseconds in es-EC with one decimal", () => {
    expect(formatMs(8.66)).toBe("8,7 ms");
    expect(formatMs(108.96)).toBe("109,0 ms");
    expect(formatMs(1234.5)).toBe("1.234,5 ms");
  });

  it("R21 leaves a day without a figure as a gap and reads Sin dato, never 0", () => {
    const points = days([8.1, null, 2]);
    expect(pointText(points[1]!, formatMs)).toContain("Sin dato");
    expect(linePaths(points, 10).solid).not.toContain("L");
  });

  it("keeps a lone script's color and name, so the cut card matches the CPU card", () => {
    const out = section(view([account("soma", [script("soma-web", "soma-web", [1, 1, 1], [9, 9, 9], [0, 2, 0])])]));
    expect(out).toContain(`<ul class="legend">`);
    expect(out.match(/<g class="series s1">/g)).toHaveLength(3);
  });

  it("shows only the accounts with a Worker seen, and no section while no CPU day is stored", () => {
    const out = section(view([account("cobtec", []), boraei]));
    expect(out).toContain("BORAEI");
    expect(out).not.toContain("COBTEC");
    expect(view([account("cobtec", [])])).not.toContain(TEXT_CPU_SECTION);
  });
});
