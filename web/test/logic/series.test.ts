import { describe, expect, it } from "vitest";
import limitsJson from "../../config/limits.json";
import { dayAlias, siteVisitsQuery } from "../../src/cloudflare/queries";
import type { UsageMetric } from "../../src/db/statistics";
import { chartDays, MAX_WORKER_DAY_AGE_MS, workerDays } from "../../src/logic/days";
import { dayPoints, mergeHistory, panelSummary, siteSummary, usageCharts } from "../../src/logic/series";
import { parseSiteVisits } from "../../src/logic/traffic";
import type { LimitsConfig } from "../../src/logic/usage";

const NOW = new Date("2026-11-02T15:00:00Z");
const limits = limitsJson as LimitsConfig;

function history(days: Record<string, Record<string, number>>): Record<string, UsageMetric[]> {
  return Object.fromEntries(
    Object.entries(days).map(([day, metrics]) => [
      day,
      Object.entries(metrics).map(([key, value]) => {
        const [product, metric] = key.split(":") as [UsageMetric["product"], string];
        return { product, metric, value };
      }),
    ]),
  );
}

const chart = (charts: ReturnType<typeof usageCharts>, product: string, metric: string) =>
  charts.find((c) => c.product === product && c.metric === metric)!;
const valueOn = (points: { day: string; value: number | null }[], day: string) => points.find((p) => p.day === day)?.value;

describe("R26 R27 chart days", () => {
  it("has the last 30 days, oldest first, with today as the partial day", () => {
    const points = dayPoints({ "2026-11-01": 7 }, NOW);
    expect(points).toHaveLength(30);
    expect(points[0]?.day).toBe("2026-10-04");
    expect(points.at(-1)).toEqual({ day: "2026-11-02", value: null, partial: true });
    expect(points.filter((p) => p.partial)).toHaveLength(1);
  });
});

describe("R33 gaps", () => {
  it("leaves a day without a figure empty, never 0, and keeps a real 0", () => {
    const points = dayPoints({ "2026-11-01": 0 }, NOW);
    expect(valueOn(points, "2026-11-01")).toBe(0);
    expect(valueOn(points, "2026-10-31")).toBeNull();
  });
});

describe("R28–R31 usage charts", () => {
  const charts = usageCharts(
    history({
      "2026-10-30": { "workers:requests": 300, "r2:class_a_ops": 10, "d1:storage_bytes": 1000 },
      "2026-10-31": { "workers:requests": 500, "r2:class_a_ops": 20, "d1:storage_bytes": 1200 },
      "2026-11-01": { "workers:requests": 100, "r2:class_a_ops": 5, "d1:storage_bytes": 1100 },
      "2026-11-02": { "r2:class_a_ops": 1 },
    }),
    limits,
    NOW,
  );

  it("R28 has one chart per metric with a limit, with that limit", () => {
    expect(charts).toHaveLength(limits.metrics.filter((m) => m.limit !== null).length);
    expect(chart(charts, "workers", "requests")).toMatchObject({ label: "Peticiones de Worker", limit: 100000 });
  });

  it("R28 leaves out a metric without a limit", () => {
    const noLimit = { ...limits, metrics: limits.metrics.map((m) => (m.metric === "requests" ? { ...m, limit: null } : m)) };
    expect(usageCharts({}, noLimit, NOW).some((c) => c.metric === "requests")).toBe(false);
  });

  it("R29 shows each day's value of a daily metric", () => {
    const points = chart(charts, "workers", "requests").points;
    expect([valueOn(points, "2026-10-30"), valueOn(points, "2026-10-31"), valueOn(points, "2026-11-01")]).toEqual([300, 500, 100]);
  });

  it("R30 shows the month's running total of a monthly metric, starting again on the 1st", () => {
    const points = chart(charts, "r2", "class_a_ops").points;
    expect([valueOn(points, "2026-10-30"), valueOn(points, "2026-10-31"), valueOn(points, "2026-11-01"), valueOn(points, "2026-11-02")]).toEqual([10, 30, 5, 6]);
  });

  it("R31 shows each day's value of a storage metric", () => {
    const points = chart(charts, "d1", "storage_bytes").points;
    expect([valueOn(points, "2026-10-31"), valueOn(points, "2026-11-01")]).toEqual([1200, 1100]);
  });

  it("R33 leaves the days without data empty in every chart", () => {
    expect(valueOn(chart(charts, "workers", "requests").points, "2026-11-02")).toBeNull();
    expect(valueOn(chart(charts, "r2", "class_a_ops").points, "2026-10-29")).toBeNull();
  });
});

describe("mergeHistory", () => {
  it("lets the live figure win per metric and keeps the stored ones the live read lacks", () => {
    const merged = mergeHistory(
      history({ "2026-10-05": { "workers:requests": 40, "d1:rows_read": 7 } }),
      history({ "2026-10-05": { "d1:rows_read": 9 }, "2026-10-06": { "d1:rows_read": 1 } }),
    );
    expect(merged["2026-10-05"]).toEqual(expect.arrayContaining([
      { product: "workers", metric: "requests", value: 40 },
      { product: "d1", metric: "rows_read", value: 9 },
    ]));
    expect(merged["2026-10-06"]).toEqual([{ product: "d1", metric: "rows_read", value: 1 }]);
  });
});

describe("R13 R14 R16 site summary and panel", () => {
  const values: Record<string, number> = Object.fromEntries(chartDays(NOW).map((day) => [day, 10]));
  values["2026-11-01"] = 20;
  values["2026-11-02"] = 4;

  it("R14 has yesterday, its comparison with the daily average and the 30-day total", () => {
    const summary = siteSummary(dayPoints(values, NOW), NOW);
    expect(summary.yesterday).toBe(20);
    expect(summary.dailyAverage).toBeCloseTo((28 * 10 + 20) / 29);
    expect(summary.changePercent).toBe(93);
    expect(summary.total).toBe(28 * 10 + 20 + 4);
  });

  it("R16 has no figure, not 0, when yesterday or every day is missing", () => {
    expect(siteSummary(dayPoints({}, NOW), NOW)).toEqual({ yesterday: null, dailyAverage: null, changePercent: null, total: null });
  });

  it("R13 sums yesterday's visits of all sites, counts sites and those near the limit", () => {
    const summary = (yesterday: number | null) => ({ yesterday, dailyAverage: null, changePercent: null, total: null });
    expect(panelSummary([{ summary: summary(20), nearLimit: true }, { summary: summary(5), nearLimit: false }])).toEqual({ visitsYesterday: 25, sites: 2, nearLimit: 1 });
  });

  it("R16 does not show a partial sum as yesterday's visits", () => {
    const summary = (yesterday: number | null) => ({ yesterday, dailyAverage: null, changePercent: null, total: null });
    expect(panelSummary([{ summary: summary(20), nearLimit: false }, { summary: summary(null), nearLimit: false }]).visitsYesterday).toBeNull();
  });
});

describe("R43 Worker days", () => {
  it("never reads a day that began 29.5 days ago or more, at any hour", () => {
    for (let hour = 0; hour < 48; hour++) {
      const now = new Date(Date.parse("2026-10-31T00:00:00Z") + hour * 3_600_000);
      const days = workerDays(chartDays(now), now);
      expect(now.getTime() - Date.parse(`${days[0]}T00:00:00Z`)).toBeLessThan(MAX_WORKER_DAY_AGE_MS);
      expect(days.at(-1)).toBe(now.toISOString().slice(0, 10));
    }
  });
});

describe("R35 site visits query", () => {
  it("reads one part per day and filters by host only when the site has one", () => {
    const query = siteVisitsQuery(["2026-10-31", "2026-11-01"], false);
    expect(query).toContain(`${dayAlias("v", "2026-10-31")}: httpRequestsAdaptiveGroups`);
    expect(query).toContain(`datetime_geq: "2026-10-31T00:00:00Z", datetime_lt: "2026-11-01T00:00:00Z"`);
    expect(query).not.toContain("clientRequestHTTPHost");
    expect(siteVisitsQuery(["2026-10-31"], true)).toContain("clientRequestHTTPHost: $host");
  });

  it("refuses anything that is not a day", () => {
    expect(() => siteVisitsQuery(['2026-10-31"}) { x }', ], false)).toThrow();
  });

  it("returns no figure for a day missing from the answer", () => {
    const data = { viewer: { zones: [{ v20261031: [{ sum: { visits: 3 } }], v20261101: [] }] } };
    expect(parseSiteVisits(data, ["2026-10-30", "2026-10-31", "2026-11-01"])).toEqual({ "2026-10-31": 3, "2026-11-01": 0 });
  });
});
