import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  purgeIpsBefore,
  saveAccountDay,
  saveDatasetAvailability,
  saveSiteDay,
  saveAccountDays,
  saveCpuDays,
  readCpu,
  storedCpuDays,
  storedDays,
  type IpCount,
  type ScriptCpu,
  type SiteDay,
} from "../src/db/statistics";

const db = env.STATS_DB;
const DAY = "2026-10-28";

// Documentation-range IPs (RFC 5737): dummy data only.
function trafficIp(n: number, requests: number): IpCount {
  return { kind: "traffic", ip: `192.0.2.${n}`, country: "EC", requests, lastSeenHour: "2026-10-28T19:00:00Z" };
}

function securityIp(n: number, requests: number): IpCount {
  return { kind: "security", ip: `198.51.100.${n}`, country: "US", requests, action: "block", lastSeenHour: "2026-10-28T03:00:00Z" };
}

function siteDay(overrides: Partial<SiteDay> = {}): SiteDay {
  return {
    day: DAY,
    siteId: "soma",
    traffic: { requests: 614, visits: 120, pageViews: 300, bytes: 5_000_000 },
    countries: [
      { country: "EC", requests: 500 },
      { country: "US", requests: 114 },
    ],
    ips: [trafficIp(1, 50), securityIp(1, 5)],
    ...overrides,
  };
}

async function count(table: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await db.batch(
    ["usage_daily", "traffic_daily", "country_daily", "ip_daily", "dataset_availability", "workers_cpu_daily", "workers_cpu_checked"].map((t) => db.prepare(`DELETE FROM ${t}`)),
  );
});

describe("R30 processing a day twice replaces it", () => {
  it("replaces the traffic, countries and IPs of a site without duplicates", async () => {
    await saveSiteDay(db, siteDay());
    await saveSiteDay(
      db,
      siteDay({
        traffic: { requests: 700, visits: 130, pageViews: 310, bytes: 6_000_000 },
        countries: [{ country: "EC", requests: 700 }],
        ips: [trafficIp(2, 70)],
      }),
    );

    expect(await count("traffic_daily")).toBe(1);
    expect(await db.prepare("SELECT requests, visits, page_views, bytes FROM traffic_daily").first()).toEqual({
      requests: 700,
      visits: 130,
      page_views: 310,
      bytes: 6_000_000,
    });
    // The US row and the first IPs are gone: the result is exactly the last run.
    expect((await db.prepare("SELECT country FROM country_daily").all()).results).toEqual([{ country: "EC" }]);
    expect((await db.prepare("SELECT ip FROM ip_daily").all()).results).toEqual([{ ip: "192.0.2.2" }]);
  });

  it("replaces the usage of an account without duplicates", async () => {
    const account = "b74a9056b9ae179a543449713d41020d";
    await saveAccountDay(db, DAY, account, [
      { product: "workers", metric: "requests", value: 100 },
      { product: "d1", metric: "rows_read", value: 50 },
    ]);
    await saveAccountDay(db, DAY, account, [{ product: "workers", metric: "requests", value: 120 }]);

    expect((await db.prepare("SELECT product, metric, value FROM usage_daily").all()).results).toEqual([
      { product: "workers", metric: "requests", value: 120 },
    ]);
  });

  it("keeps the first run intact if the second one fails halfway", async () => {
    await saveSiteDay(db, siteDay());
    // The last statement of the batch breaks a CHECK (negative requests): nothing of the second run is kept.
    await expect(saveSiteDay(db, siteDay({ traffic: { requests: 1, visits: 1, pageViews: 1, bytes: 1 }, ips: [trafficIp(9, -1)] }))).rejects.toThrow();

    expect(await db.prepare("SELECT requests FROM traffic_daily").first()).toEqual({ requests: 614 });
    expect(await count("country_daily")).toBe(2);
    expect(await count("ip_daily")).toBe(2);
  });
});

describe("R29 only the top 20 IPs per kind", () => {
  it("stores the 20 IPs with most requests of each kind", async () => {
    const ips = [
      ...Array.from({ length: 25 }, (_, i) => trafficIp(i + 1, i + 1)),
      ...Array.from({ length: 25 }, (_, i) => securityIp(i + 1, i + 1)),
    ];
    await saveSiteDay(db, siteDay({ ips }));

    const rows = (await db.prepare("SELECT kind, MIN(requests) AS min, COUNT(*) AS n FROM ip_daily GROUP BY kind ORDER BY kind").all()).results;
    expect(rows).toEqual([
      { kind: "security", min: 6, n: 20 },
      { kind: "traffic", min: 6, n: 20 },
    ]);
  });

  it("breaks ties by IP, so the result is stable", async () => {
    const ips = Array.from({ length: 22 }, (_, i) => trafficIp(i + 10, 1));
    await saveSiteDay(db, siteDay({ ips }));
    const kept = (await db.prepare("SELECT ip FROM ip_daily ORDER BY ip").all<{ ip: string }>()).results.map((r) => r.ip);
    expect(kept).toHaveLength(20);
    expect(kept).not.toContain("192.0.2.30");
    expect(kept).not.toContain("192.0.2.31");
  });

  it("stores the action only for security IPs", async () => {
    await saveSiteDay(db, siteDay());
    expect((await db.prepare("SELECT kind, action FROM ip_daily ORDER BY kind").all()).results).toEqual([
      { kind: "security", action: "block" },
      { kind: "traffic", action: null },
    ]);
  });
});

describe("R32 IP purge", () => {
  it("deletes only the days before the cutoff", async () => {
    for (const day of ["2025-09-29", "2025-09-30", "2025-10-01"]) await saveSiteDay(db, siteDay({ day }));

    expect(await purgeIpsBefore(db, "2025-09-30")).toBe(2);
    expect((await db.prepare("SELECT DISTINCT day FROM ip_daily ORDER BY day").all()).results).toEqual([
      { day: "2025-09-30" },
      { day: "2025-10-01" },
    ]);
    // Traffic and countries of the purged day are kept.
    expect(await count("traffic_daily")).toBe(3);
  });
});

describe("R31 stored days", () => {
  it("lists stored days per site and account from a given day, and the first day ever stored", async () => {
    for (const day of ["2026-09-28", "2026-10-01", "2026-10-02"]) {
      await saveSiteDay(db, siteDay({ day }));
      await saveAccountDay(db, day, "acc", [
        { product: "workers", metric: "requests", value: 1 },
        { product: "d1", metric: "rows_read", value: 1 },
      ]);
    }
    const stored = await storedDays(db, "2026-09-30");
    expect(stored.sites).toEqual({ days: { soma: ["2026-10-01", "2026-10-02"] }, first: { soma: "2026-09-28" } });
    expect(stored.accounts).toEqual({ days: { acc: ["2026-10-01", "2026-10-02"] }, first: { acc: "2026-09-28" } });
  });

  it("is empty before the first run", async () => {
    expect(await storedDays(db, "2026-09-30")).toEqual({ sites: { days: {}, first: {} }, accounts: { days: {}, first: {} } });
  });

  it("saves several days of an account in one batch, replacing them", async () => {
    const m = (value: number) => [{ product: "workers" as const, metric: "requests", value }];
    await saveAccountDays(db, "acc", { "2026-10-01": m(1), "2026-10-02": m(2) });
    await saveAccountDays(db, "acc", { "2026-10-02": m(5) });
    expect((await db.prepare("SELECT day, value FROM usage_daily ORDER BY day").all()).results).toEqual([
      { day: "2026-10-01", value: 1 },
      { day: "2026-10-02", value: 5 },
    ]);
  });
});

describe("R41 dataset availability", () => {
  it("upserts without duplicates", async () => {
    const row = { scope: "zone" as const, tag: "e0fb73db5802715db5c839304a86c43e", dataset: "httpRequestsAdaptiveGroups", enabled: true, notOlderThanS: 2678400, maxDurationS: 2592000 };
    await saveDatasetAvailability(db, [row]);
    await saveDatasetAvailability(db, [{ ...row, enabled: false }]);

    expect((await db.prepare("SELECT enabled, not_older_than_s FROM dataset_availability").all()).results).toEqual([
      { enabled: 0, not_older_than_s: 2678400 },
    ]);
  });
});

describe("spec 004 R5 Workers CPU per day, account and script", () => {
  const BORAEI = "31767db4f7f58a6651b7a284e211be81";
  const SOMA = "b74a9056b9ae179a543449713d41020d";
  const script = (overrides: Partial<ScriptCpu> = {}): ScriptCpu => ({
    script: "mohamed-boraei",
    requests: 2600,
    errors: 0,
    exceededResources: 0,
    cpuP50Ms: 1.167,
    cpuP99Ms: 69.244,
    cpuP999Ms: 123.157,
    wallP50Ms: 2.159,
    wallP99Ms: 91.87,
    sampleInterval: 1.7,
    ...overrides,
  });

  it("stores one row per script, including __unknown__ with empty quantiles, and keeps the decimals", async () => {
    await saveCpuDays(db, BORAEI, {
      [DAY]: [script(), script({ script: "__unknown__", requests: 103, errors: 103, exceededResources: 103, cpuP50Ms: null, cpuP99Ms: null, cpuP999Ms: null, wallP50Ms: null, wallP99Ms: null, sampleInterval: null })],
    });

    const stored = await readCpu(db, DAY);
    expect(stored[BORAEI]?.[DAY]).toEqual([
      script({ script: "__unknown__", requests: 103, errors: 103, exceededResources: 103, cpuP50Ms: null, cpuP99Ms: null, cpuP999Ms: null, wallP50Ms: null, wallP99Ms: null, sampleInterval: null }),
      script(),
    ]);
  });

  it("processing a day again replaces its scripts without duplicates", async () => {
    await saveCpuDays(db, BORAEI, { [DAY]: [script(), script({ script: "__unknown__", exceededResources: 5 })] });
    await saveCpuDays(db, BORAEI, { [DAY]: [script({ requests: 3000, cpuP99Ms: 12.5 })] });

    expect(await count("workers_cpu_daily")).toBe(1);
    expect(await count("workers_cpu_checked")).toBe(1);
    expect((await readCpu(db, DAY))[BORAEI]?.[DAY]).toEqual([script({ requests: 3000, cpuP99Ms: 12.5 })]);
  });

  it("keeps the days of other accounts and other days untouched", async () => {
    await saveCpuDays(db, SOMA, { [DAY]: [script({ script: "soma-web" })] });
    await saveCpuDays(db, BORAEI, { [DAY]: [script()], "2026-10-29": [script()] });
    await saveCpuDays(db, BORAEI, { [DAY]: [] });

    const stored = await readCpu(db, DAY);
    expect(stored[SOMA]?.[DAY]).toEqual([script({ script: "soma-web" })]);
    expect(stored[BORAEI]?.[DAY]).toEqual([]);
    expect(stored[BORAEI]?.["2026-10-29"]).toEqual([script()]);
  });

  it("R21 a processed day without invocations is present and empty; a day never processed is absent", async () => {
    await saveCpuDays(db, SOMA, { [DAY]: [] });

    const stored = await readCpu(db, "2026-10-01");
    expect(stored[SOMA]).toEqual({ [DAY]: [] });
    expect(stored[BORAEI]).toBeUndefined();
  });

  it("R6 lists the processed days of each account from a given day, oldest first", async () => {
    await saveCpuDays(db, BORAEI, { "2026-10-30": [], [DAY]: [script()], "2026-10-20": [] });
    await saveCpuDays(db, SOMA, { "2026-10-29": [script({ script: "soma-web" })] });

    expect(await storedCpuDays(db, "2026-10-25")).toEqual({ [BORAEI]: [DAY, "2026-10-30"], [SOMA]: ["2026-10-29"] });
  });

  it("refuses negative counts and times", async () => {
    await expect(saveCpuDays(db, BORAEI, { [DAY]: [script({ cpuP99Ms: -1 })] })).rejects.toThrow();
    expect(await count("workers_cpu_checked")).toBe(0);
  });
});
