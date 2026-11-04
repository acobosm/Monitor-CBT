import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountUsage, DayPoint, SiteData, UsageChart } from "../../ui/api";
import { LineChart, linePaths, niceCeil, pointText, scaleTop, TEXT_NO_CHART_DATA, TEXT_RESCALED, TEXT_TODAY } from "../../ui/components/LineChart";
import { formatNumber } from "../../ui/format";
import { SiteView } from "../../ui/pages/Site";
import { UsageView } from "../../ui/pages/Usage";

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
      ({ id, name: id.toUpperCase(), live: true, rows: [], charts: [chart("rows_read", value), chart("rows_written", value)], limitsCheckedText: "", unclassifiedText: null }) as AccountUsage;
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
