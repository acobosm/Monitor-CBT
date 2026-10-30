import { describe, expect, it } from "vitest";
import limitsJson from "../config/limits.json";
import type { AccountUsageData } from "../src/cloudflare/queries";
import type { UsageMetric } from "../src/db/statistics";
import {
  ACCOUNT_METRICS,
  evaluateUsage,
  parseAccountUsage,
  r2Class,
  TEXT_NO_LIMIT,
  TEXT_NO_RISK,
  TEXT_RESET,
  type LimitsConfig,
  type UsageRow,
} from "../src/logic/usage";
import fixture from "./fixtures/account-usage.json";

const limits = limitsJson as LimitsConfig;
const data = fixture as AccountUsageData;

function metric(day: Record<string, UsageMetric[]>, d: string, product: string, name: string) {
  return day[d]?.find((m) => m.product === product && m.metric === name)?.value;
}

/** History where every day has all metrics at 0 except the given values. */
function history(values: Record<string, Partial<Record<string, number>>>): Record<string, UsageMetric[]> {
  return Object.fromEntries(
    Object.entries(values).map(([day, v]) => [
      day,
      ACCOUNT_METRICS.map((m) => ({ ...m, value: v[`${m.product}:${m.metric}`] ?? 0 })),
    ]),
  );
}

function row(rows: UsageRow[], product: string, name: string): UsageRow {
  const found = rows.find((r) => r.product === product && r.metric === name);
  if (!found) throw new Error(`missing row ${product}:${name}`);
  return found;
}

describe("R20 R2 Class A / Class B", () => {
  it("classifies operations as on the R2 pricing page", () => {
    expect(r2Class("PutObject")).toBe("A");
    expect(r2Class("ListBuckets")).toBe("A");
    expect(r2Class("GetObject")).toBe("B");
    expect(r2Class("HeadBucket")).toBe("B");
    expect(r2Class("DeleteObject")).toBe("free");
    expect(r2Class("GetBucketSippyConfiguration")).toBe("unclassified");
  });

  it("counts unclassified operations as Class A and lists them (P7)", () => {
    const parsed = parseAccountUsage(data, ["2026-10-28"]);
    expect(metric(parsed.days, "2026-10-28", "r2", "class_a_ops")).toBe(2 + 12 + 2);
    expect(metric(parsed.days, "2026-10-28", "r2", "class_b_ops")).toBe(565 + 26);
    expect(parsed.unclassifiedR2).toEqual(["GetBucketNotificationConfiguration"]);
  });
});

describe("parseAccountUsage", () => {
  const parsed = parseAccountUsage(data, ["2026-10-27", "2026-10-28", "2026-10-29"]);

  it("sums Workers requests per day", () => {
    expect(metric(parsed.days, "2026-10-27", "workers", "requests")).toBe(1500);
    expect(metric(parsed.days, "2026-10-28", "workers", "requests")).toBe(900);
  });

  it("sums storage over databases and buckets", () => {
    expect(metric(parsed.days, "2026-10-28", "d1", "storage_bytes")).toBe(1_500_000);
    expect(metric(parsed.days, "2026-10-28", "r2", "storage_bytes")).toBe(2_501_500);
  });

  it("R31 returns every metric with 0 on days without usage", () => {
    expect(parsed.days["2026-10-29"]).toHaveLength(ACCOUNT_METRICS.length);
    expect(parsed.days["2026-10-29"]?.every((m) => m.value === 0)).toBe(true);
  });

  it("handles an account without any product (like COBTEC without Workers or D1)", () => {
    const empty = { viewer: { accounts: [{ workers: [], d1: [], d1Storage: [], r2Ops: [], r2Storage: [] }] } };
    const result = parseAccountUsage(empty, ["2026-10-28"]);
    expect(result.days["2026-10-28"]).toHaveLength(ACCOUNT_METRICS.length);
  });
});

describe("R14 R15 usage table", () => {
  const now = new Date("2026-10-29T17:00:00Z");
  const table = evaluateUsage(history({ "2026-10-29": { "workers:requests": 1000 } }), limits, now);

  it("has one row per metric with product, metric, usage, limit, %, period and state", () => {
    expect(table.rows).toHaveLength(ACCOUNT_METRICS.length);
    expect(row(table.rows, "workers", "requests")).toMatchObject({
      productLabel: "Workers",
      label: "Peticiones de Worker",
      usage: 1000,
      limit: 100000,
      percent: 1,
      period: "daily",
      periodLabel: "Diario",
      state: "ok",
      stateText: "Normal",
    });
  });

  it("shows the date limits were checked", () => {
    expect(table.limitsCheckedText).toBe("Límites verificados el 29 de octubre de 2026");
  });
});

describe("R16 thresholds", () => {
  const now = new Date("2026-10-29T17:00:00Z");
  const cases: [number, string, string, string][] = [
    [69_999, "ok", "Normal", "normal"],
    [70_000, "near", "Cerca del límite", "amber"],
    [90_000, "critical", "Límite crítico", "red"],
    [100_000, "exceeded", "Límite superado", "red"],
  ];

  for (const [requests, state, text, level] of cases) {
    it(`is ${state} at ${requests / 1000}% of the Workers limit`, () => {
      const table = evaluateUsage(history({ "2026-10-29": { "workers:requests": requests } }), limits, now);
      expect(row(table.rows, "workers", "requests")).toMatchObject({ state, stateText: text, level, percent: Math.floor(requests / 100) / 10 });
    });
  }
});

describe("R17 daily metrics", () => {
  it("shows the 7-day peak and the reset note", () => {
    const now = new Date("2026-10-29T17:00:00Z");
    const table = evaluateUsage(
      history({
        "2026-10-22": { "workers:requests": 99_000 }, // 8 days back: outside the peak window
        "2026-10-23": { "workers:requests": 5_000 },
        "2026-10-28": { "workers:requests": 2_000 },
        "2026-10-29": { "workers:requests": 1_000 },
      }),
      limits,
      now,
    );
    expect(row(table.rows, "workers", "requests")).toMatchObject({ usage: 1_000, peak7: 5_000, note: TEXT_RESET });
  });
});

describe("R18 projections", () => {
  it("projects when a monthly metric reaches its limit this month", () => {
    // 30 days elapsed in a 31-day month with 900,000 Class A ops: 30,000/day, the remaining 100,000 take ~3.3 days.
    const now = new Date("2026-10-31T00:00:00Z");
    const table = evaluateUsage(history({ "2026-10-10": { "r2:class_a_ops": 900_000 } }), limits, now);
    expect(row(table.rows, "r2", "class_a_ops").projection).toBe(TEXT_NO_RISK);

    const early = new Date("2026-10-10T00:00:00Z");
    const fast = evaluateUsage(history({ "2026-10-09": { "r2:class_a_ops": 540_000 } }), limits, early);
    // 540,000 in 9 days = 60,000/day; the remaining 460,000 take 7.7 days (shown as 8), before the month ends.
    expect(row(fast.rows, "r2", "class_a_ops")).toMatchObject({ usage: 540_000, projection: "Al ritmo actual llegas al límite en 8 días" });
  });

  it("shows no risk without usage", () => {
    const table = evaluateUsage(history({ "2026-10-29": {} }), limits, new Date("2026-10-29T17:00:00Z"));
    expect(row(table.rows, "r2", "class_b_ops").projection).toBe(TEXT_NO_RISK);
    expect(row(table.rows, "d1", "storage_bytes").projection).toBe(TEXT_NO_RISK);
  });

  it("projects storage from the growth of the last 7 days", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const table = evaluateUsage(
      history({
        "2026-10-13": { "d1:storage_bytes": 4_300_000_000 },
        "2026-10-20": { "d1:storage_bytes": 4_650_000_000 },
      }),
      limits,
      now,
    );
    // 50 MB per day; 350 MB left = 7 days, before the month ends.
    expect(row(table.rows, "d1", "storage_bytes")).toMatchObject({
      usage: 4_650_000_000,
      percent: 93,
      state: "critical",
      projection: "Al ritmo actual llegas al límite en 7 días",
    });
  });

  it("has no projection once the limit is exceeded", () => {
    const table = evaluateUsage(history({ "2026-10-29": { "r2:class_b_ops": 10_000_000 } }), limits, new Date("2026-10-29T17:00:00Z"));
    expect(row(table.rows, "r2", "class_b_ops")).toMatchObject({ state: "exceeded", projection: null });
  });
});

describe("R19 missing limit", () => {
  it("shows 'Límite no configurado' instead of the percentage", () => {
    const noR2 = { ...limits, metrics: limits.metrics.filter((m) => m.product !== "r2") };
    const table = evaluateUsage(history({ "2026-10-29": { "r2:class_a_ops": 10 } }), noR2, new Date("2026-10-29T17:00:00Z"));
    expect(row(table.rows, "r2", "class_a_ops")).toMatchObject({ limit: null, percent: null, state: "unconfigured", stateText: TEXT_NO_LIMIT });
  });
});

describe("P7 unclassified note", () => {
  it("lists the unclassified R2 operations under the table", () => {
    const table = evaluateUsage({}, limits, new Date("2026-10-29T17:00:00Z"), { unclassifiedR2: ["GetBucketSippyConfiguration"] });
    expect(table.unclassifiedText).toBe("Operaciones de R2 sin clasificar (contadas como Clase A): GetBucketSippyConfiguration");
  });
});

describe("P8 D1 per-database limits", () => {
  it("parses the largest database and the number of databases per day", () => {
    const parsed = parseAccountUsage(data, ["2026-10-27", "2026-10-28"]);
    expect(metric(parsed.days, "2026-10-28", "d1", "largest_db_bytes")).toBe(1_000_000);
    expect(metric(parsed.days, "2026-10-28", "d1", "database_count")).toBe(2);
    expect(parsed.largestD1["2026-10-28"]).toBe("db-1");
    expect(metric(parsed.days, "2026-10-27", "d1", "database_count")).toBe(0);
    expect(parsed.largestD1["2026-10-27"]).toBeNull();
  });

  it("evaluates the largest database against 500 MB, with its ID and a projection", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const table = evaluateUsage(
      history({
        "2026-10-13": { "d1:largest_db_bytes": 380_000_000, "d1:database_count": 6 },
        "2026-10-20": { "d1:largest_db_bytes": 450_000_000, "d1:database_count": 6 },
      }),
      limits,
      now,
      { largestD1Id: "db-1" },
    );
    // 10 MB per day; 50 MB left = 5 days.
    expect(row(table.rows, "d1", "largest_db_bytes")).toMatchObject({
      label: "Base más grande",
      usage: 450_000_000,
      limit: 500_000_000,
      percent: 90,
      state: "critical",
      note: "Base: db-1",
      projection: "Al ritmo actual llegas al límite en 5 días",
      peak7: null,
    });
    expect(row(table.rows, "d1", "database_count")).toMatchObject({
      label: "Cantidad de bases",
      usage: 6,
      limit: 10,
      percent: 60,
      state: "ok",
      period: "total",
      projection: TEXT_NO_RISK,
    });
  });
});
