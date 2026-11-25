import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sitesJson from "../config/sites.json";
import { ACCOUNT_DATASETS, ZONE_DATASETS } from "../src/cloudflare/queries";
import { cpuDaysToRead, GAP_SITE_DAYS_PER_RUN, runDailyTask } from "../src/cron";
import { saveAccountDay, saveSiteDay, type SiteDay } from "../src/db/statistics";
import worker from "../src/index";
import accountFixture from "./fixtures/account-usage.json";
import hoursFixture from "./fixtures/site-day-hours.json";
import dayFixture from "./fixtures/site-day.json";

const db = env.STATS_DB;
const NOW = new Date("2026-10-29T01:00:00Z");
const YESTERDAY = "2026-10-28";
const soma = sitesJson.sites[0]!;
const boraei = sitesJson.sites[1]!;
const cobtec = sitesJson.accounts[0]!;

const datasetSettings = { enabled: true, notOlderThan: 2678400, maxDuration: 2592000 };
const settingsData = {
  viewer: Object.fromEntries([
    ...sitesJson.accounts.map((_, i) => [`a${i}`, [{ settings: Object.fromEntries(ACCOUNT_DATASETS.map((d) => [d, datasetSettings])) }]]),
    ...sitesJson.sites.map((_, i) => [`z${i}`, [{ settings: Object.fromEntries(ZONE_DATASETS.map((d) => [d, datasetSettings])) }]]),
  ]),
};

interface FakeOptions {
  failZone?: string;
  failAccount?: string;
  /** Spec 004: quantiles of every CPU row (microseconds); a negative one makes the D1 write fail. */
  cpuP99Us?: number;
  /** Spec 004: CPU days (YYYYMMDD) whose status part Cloudflare leaves out of the answer. */
  dropStatus?: string[];
  /** Spec 004: account whose CPU query Cloudflare refuses. */
  failCpu?: string;
}

/** Spec 004: one dummy script per `c<day>` and `x<day>` part the query asks for, 2 of its requests cut. */
function cpuParts(query: string, options: FakeOptions): Record<string, unknown> {
  const parts: Record<string, unknown> = {};
  for (const [, day] of query.matchAll(/\bc(\d{8}):/g)) {
    parts[`c${day}`] = [
      {
        sum: { requests: 100, errors: 2 },
        quantiles: { cpuTimeP50: 1200, cpuTimeP99: options.cpuP99Us ?? 9500, cpuTimeP999: 15000, wallTimeP50: 2000, wallTimeP99: 20000 },
        avg: { sampleInterval: 1 },
        dimensions: { scriptName: "dummy-worker" },
      },
    ];
    if (!options.dropStatus?.includes(day!)) {
      parts[`x${day}`] = [
        { sum: { requests: 98 }, dimensions: { scriptName: "dummy-worker", status: "success" } },
        { sum: { requests: 2 }, dimensions: { scriptName: "dummy-worker", status: "exceededResources" } },
      ];
    }
  }
  return parts;
}

/** Fake Cloudflare GraphQL API: answers by operation name with dummy fixtures and records each call. */
function fakeCloudflare(options: FakeOptions = {}) {
  const calls: { op: string; query: string; variables: Record<string, unknown> }[] = [];
  const fetchFn: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const op = /query (\w+)/.exec(body.query)?.[1] ?? "unknown";
    calls.push({ op, query: body.query, variables: body.variables });
    if (op === "Settings") return Response.json({ data: settingsData });
    if (op === "AccountUsage" || op === "AccountCpu") {
      if (body.variables.tag === options.failAccount) return new Response("unavailable", { status: 503 });
      if (op === "AccountUsage") return Response.json({ data: accountFixture });
      if (body.variables.tag === options.failCpu) return Response.json({ data: null, errors: [{ message: "too many nodes" }] });
      return Response.json({ data: { viewer: { accounts: [cpuParts(body.query, options)] } } });
    }
    if (op === "SiteDay") {
      if (body.variables.tag === options.failZone) return Response.json({ data: null, errors: [{ message: "zone error" }] });
      return Response.json({ data: dayFixture });
    }
    if (op === "SiteDayHours") return Response.json({ data: hoursFixture });
    return new Response("unexpected", { status: 400 });
  };
  return { fetchFn, calls };
}

function siteDay(siteId: string, day: string): SiteDay {
  return { day, siteId, traffic: { requests: 1, visits: 1, pageViews: 1, bytes: 1 }, countries: [], ips: [] };
}

async function trafficDays(siteId: string): Promise<string[]> {
  const { results } = await db.prepare("SELECT day FROM traffic_daily WHERE site_id = ? ORDER BY day").bind(siteId).all<{ day: string }>();
  return results.map((r) => r.day);
}

async function count(sql: string): Promise<number> {
  return (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await db.batch(
    ["usage_daily", "traffic_daily", "country_daily", "ip_daily", "dataset_availability", "workers_cpu_daily", "workers_cpu_checked"].map((t) => db.prepare(`DELETE FROM ${t}`)),
  );
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R28 previous UTC day", () => {
  it("stores yesterday for the 3 accounts and the 3 sites, and never today", async () => {
    const { fetchFn } = fakeCloudflare();
    const summary = await runDailyTask(env, NOW, fetchFn);

    expect(summary).toMatchObject({ day: YESTERDAY, discovery: "ok", accountsFailed: [], siteDaysFailed: [] });
    expect(summary.accountsStored).toEqual(["cobtec", "soma", "boraei"]);
    for (const site of sitesJson.sites) expect(await trafficDays(site.id)).toEqual([YESTERDAY]);
    expect(await count("SELECT COUNT(DISTINCT account_id) AS n FROM usage_daily WHERE day = '2026-10-28'")).toBe(3);
    expect(await count("SELECT COUNT(*) AS n FROM traffic_daily WHERE day = '2026-10-29'")).toBe(0);
  });

  it("P9 does not copy the past on the first run", async () => {
    const { fetchFn, calls } = fakeCloudflare();
    await runDailyTask(env, NOW, fetchFn);
    expect(calls.filter((c) => c.op === "SiteDay").map((c) => c.variables.day)).toEqual([YESTERDAY, YESTERDAY, YESTERDAY]);
    expect(calls.filter((c) => c.op === "AccountUsage").every((c) => c.variables.from === YESTERDAY)).toBe(true);
  });

  it("filters MOHAMED-BORAEI by its host", async () => {
    const { fetchFn, calls } = fakeCloudflare();
    await runDailyTask(env, NOW, fetchFn);
    const hosts = calls.filter((c) => c.op === "SiteDay").map((c) => c.variables.host);
    expect(hosts).toEqual([undefined, undefined, "www.mohamedboraei.com"]);
  });
});

describe("R30 running twice", () => {
  it("does not duplicate anything", async () => {
    await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    const before = await count("SELECT (SELECT COUNT(*) FROM usage_daily) + (SELECT COUNT(*) FROM traffic_daily) + (SELECT COUNT(*) FROM country_daily) + (SELECT COUNT(*) FROM ip_daily) AS n");
    await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    const after = await count("SELECT (SELECT COUNT(*) FROM usage_daily) + (SELECT COUNT(*) FROM traffic_daily) + (SELECT COUNT(*) FROM country_daily) + (SELECT COUNT(*) FROM ip_daily) AS n");
    expect(after).toBe(before);
  });
});

describe("R31 recovering missing days after the first stored day", () => {
  it("recovers the gaps of a site and of an account, oldest first", async () => {
    await saveSiteDay(db, siteDay(soma.id, "2026-10-24"));
    await saveAccountDay(db, "2026-10-24", cobtec.accountId, [{ product: "workers", metric: "requests", value: 1 }]);

    const { fetchFn, calls } = fakeCloudflare();
    await runDailyTask(env, NOW, fetchFn);

    expect(await trafficDays(soma.id)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", YESTERDAY]);
    expect(await trafficDays(boraei.id)).toEqual([YESTERDAY]);
    const cobtecCall = calls.find((c) => c.op === "AccountUsage" && c.variables.tag === cobtec.accountId);
    expect(cobtecCall?.variables).toMatchObject({ from: "2026-10-25", to: YESTERDAY });
    expect(cobtecCall?.query).toContain("w20261025: workersInvocationsAdaptive");
    expect(await count(`SELECT COUNT(DISTINCT day) AS n FROM usage_daily WHERE account_id = '${cobtec.accountId}'`)).toBe(5);
  });

  it("recovers a site-day that failed, on the next run", async () => {
    await saveSiteDay(db, siteDay(boraei.id, "2026-10-27"));
    const failed = await runDailyTask(env, NOW, fakeCloudflare({ failZone: boraei.zoneTag }).fetchFn);
    expect(failed.siteDaysFailed).toEqual([`boraei:${YESTERDAY}`]);

    await runDailyTask(env, new Date("2026-10-30T01:00:00Z"), fakeCloudflare().fetchFn);
    expect(await trafficDays(boraei.id)).toEqual(["2026-10-27", YESTERDAY, "2026-10-29"]);
  });

  it("caps the recovery per run and stays within the 50-subrequest budget", async () => {
    for (const site of sitesJson.sites) await saveSiteDay(db, siteDay(site.id, "2026-10-01"));
    const { fetchFn, calls } = fakeCloudflare();
    const summary = await runDailyTask(env, NOW, fetchFn);

    const gaps = 3 * 26; // 2026-10-02 … 2026-10-27 for each site
    expect(summary.siteDaysStored).toHaveLength(3 + GAP_SITE_DAYS_PER_RUN);
    expect(summary.gapsLeft).toBe(gaps - GAP_SITE_DAYS_PER_RUN);
    // Oldest first.
    expect(summary.siteDaysStored.slice(3)).toEqual([
      "boraei:2026-10-02", "mohamed-boraei:2026-10-02", "soma:2026-10-02",
      "boraei:2026-10-03", "mohamed-boraei:2026-10-03", "soma:2026-10-03",
      "boraei:2026-10-04",
    ]);
    // Cloudflare calls: 1 discovery + 3 accounts + 3 account CPU (spec 004) + 2 per site-day; D1 batches:
    // 1 discovery + 1 stored days + 1 stored CPU days + 3 accounts + 3 CPU writes + 1 per site-day + 1 purge.
    const d1 = 1 + 1 + 1 + 3 + 3 + (3 + GAP_SITE_DAYS_PER_RUN) + 1;
    expect(calls).toHaveLength(1 + 3 + 3 + 2 * (3 + GAP_SITE_DAYS_PER_RUN));
    expect(calls.length + d1).toBe(47);
    expect(calls.length + d1).toBeLessThanOrEqual(50);
  });
});

describe("spec 004 R3, R6 Workers CPU in the daily task", () => {
  async function cpuDays(accountId: string): Promise<string[]> {
    const { results } = await db.prepare("SELECT day FROM workers_cpu_checked WHERE account_id = ? ORDER BY day").bind(accountId).all<{ day: string }>();
    return results.map((r) => r.day);
  }

  it("reads the CPU in one query of its own per account, and the usage query carries no CPU part", async () => {
    const { fetchFn, calls } = fakeCloudflare();
    await runDailyTask(env, NOW, fetchFn);
    expect(calls.filter((c) => c.op === "AccountCpu").map((c) => c.variables.tag)).toEqual(sitesJson.accounts.map((a) => a.accountId));
    expect(calls.filter((c) => c.op === "AccountUsage").every((c) => !/\bc\d{8}:/.test(c.query))).toBe(true);
  });

  it("chooses yesterday plus the oldest missing days, at most 14, never older than the 29-day window", () => {
    const first = cpuDaysToRead([], NOW);
    expect(first).toHaveLength(14);
    expect(first.slice(0, 13)).toEqual(["2026-09-30", ...Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`)]);
    expect(first.at(-1)).toBe(YESTERDAY);
    expect(cpuDaysToRead(first, NOW)).toEqual([...Array.from({ length: 13 }, (_, i) => `2026-10-${String(13 + i).padStart(2, "0")}`), YESTERDAY]);
  });

  it("fills the 29 days in three runs, then reads only yesterday", async () => {
    const before = await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    expect(before.cpuDaysStored).toHaveLength(3 * 14);
    await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    const third = await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    expect(third.cpuDaysStored.filter((d) => d.startsWith("cobtec:"))).toEqual(["cobtec:2026-10-26", "cobtec:2026-10-27", `cobtec:${YESTERDAY}`]);

    const days = await cpuDays(cobtec.accountId);
    expect(days).toHaveLength(29);
    expect(days[0]).toBe("2026-09-30");
    expect(days.at(-1)).toBe(YESTERDAY);
  });

  it("stores the script figures in ms with the requests cut", async () => {
    await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    expect(
      await db.prepare("SELECT script, requests, errors, exceeded_resources, cpu_p50_ms, cpu_p99_ms FROM workers_cpu_daily WHERE day = ? AND account_id = ?").bind(YESTERDAY, cobtec.accountId).first(),
    ).toEqual({ script: "dummy-worker", requests: 100, errors: 2, exceeded_resources: 2, cpu_p50_ms: 1.2, cpu_p99_ms: 9.5 });
  });

  it("reads only yesterday once the window is full", async () => {
    for (let i = 0; i < 3; i++) await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    const { fetchFn, calls } = fakeCloudflare();
    const summary = await runDailyTask(env, new Date("2026-10-30T01:00:00Z"), fetchFn);

    const query = calls.find((c) => c.op === "AccountCpu")!.query;
    expect([...query.matchAll(/\bc(\d{8}):/g)].map((m) => m[1])).toEqual(["20261029"]);
    expect(summary.cpuDaysStored).toEqual(["cobtec:2026-10-29", "soma:2026-10-29", "boraei:2026-10-29"]);
  });

  it("reads again on the next run a day Cloudflare did not fully answer", async () => {
    await runDailyTask(env, NOW, fakeCloudflare({ dropStatus: ["20260930"] }).fetchFn);
    expect(await cpuDays(cobtec.accountId)).not.toContain("2026-09-30");

    const { fetchFn, calls } = fakeCloudflare();
    await runDailyTask(env, NOW, fetchFn);
    const query = calls.find((c) => c.op === "AccountCpu")!.query;
    expect(query).toContain("c20260930:");
    expect(await cpuDays(cobtec.accountId)).toContain("2026-09-30");
  });

  it("keeps the usage when Cloudflare refuses the CPU query, and logs only the described error", async () => {
    const summary = await runDailyTask(env, NOW, fakeCloudflare({ failCpu: cobtec.accountId }).fetchFn);

    expect(summary.accountsStored).toEqual(["cobtec", "soma", "boraei"]);
    expect(summary.cpuFailed).toEqual(["cobtec"]);
    expect(await cpuDays(cobtec.accountId)).toEqual([]);
    expect(await cpuDays(sitesJson.accounts[1]!.accountId)).toHaveLength(14);
    expect(errorSpy).toHaveBeenCalledWith("workers cpu failed", { account: "cobtec", error: "query: Cloudflare GraphQL query failed: too many nodes" });
  });

  it("keeps the usage when the CPU write fails, and logs it without the token", async () => {
    const summary = await runDailyTask(env, NOW, fakeCloudflare({ cpuP99Us: -1 }).fetchFn);

    expect(summary.accountsStored).toEqual(["cobtec", "soma", "boraei"]);
    expect(summary.cpuFailed).toEqual(["cobtec", "soma", "boraei"]);
    expect(await count("SELECT COUNT(*) AS n FROM workers_cpu_checked")).toBe(0);
    expect(await count("SELECT COUNT(DISTINCT account_id) AS n FROM usage_daily")).toBe(3);
    expect(errorSpy).toHaveBeenCalledWith("workers cpu failed", expect.objectContaining({ account: "cobtec" }));
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(env.CLOUDFLARE_ANALYTICS_TOKEN);
  });

  it("keeps going with the other accounts when one is unreachable", async () => {
    const summary = await runDailyTask(env, NOW, fakeCloudflare({ failAccount: cobtec.accountId }).fetchFn);
    expect(summary.cpuFailed).toEqual(["cobtec"]);
    expect(await cpuDays(cobtec.accountId)).toEqual([]);
    expect(await cpuDays(sitesJson.accounts[1]!.accountId)).toHaveLength(14);
  });
});

describe("R32 IP purge", () => {
  it("deletes IPs older than 13 months during the run", async () => {
    await saveSiteDay(db, {
      ...siteDay(soma.id, "2025-09-27"),
      ips: [{ kind: "traffic", ip: "192.0.2.99", country: "EC", requests: 1, lastSeenHour: null }],
    });
    const summary = await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    expect(summary.ipsPurged).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM ip_daily WHERE day = '2025-09-27'")).toBe(0);
  });
});

describe("R33 a failure does not stop the others", () => {
  it("keeps going when one zone fails", async () => {
    const summary = await runDailyTask(env, NOW, fakeCloudflare({ failZone: boraei.zoneTag }).fetchFn);
    expect(summary.siteDaysFailed).toEqual([`boraei:${YESTERDAY}`]);
    expect(summary.siteDaysStored).toEqual([`soma:${YESTERDAY}`, `mohamed-boraei:${YESTERDAY}`]);
    expect(await trafficDays(boraei.id)).toEqual([]);
  });

  it("keeps going when one account fails", async () => {
    const summary = await runDailyTask(env, NOW, fakeCloudflare({ failAccount: cobtec.accountId }).fetchFn);
    expect(summary.accountsFailed).toEqual(["cobtec"]);
    expect(summary.accountsStored).toEqual(["soma", "boraei"]);
    expect(summary.siteDaysStored).toHaveLength(3);
  });

  it("logs without the token, IPs or raw responses", async () => {
    await runDailyTask(env, NOW, fakeCloudflare({ failZone: boraei.zoneTag, failAccount: cobtec.accountId }).fetchFn);
    const logged = JSON.stringify([logSpy.mock.calls, errorSpy.mock.calls]);
    expect(errorSpy).toHaveBeenCalled();
    expect(logged).not.toContain(env.CLOUDFLARE_ANALYTICS_TOKEN);
    expect(logged).not.toMatch(/192\.0\.2\.|198\.51\.100\./);
    expect(logged).not.toContain("unavailable");
  });
});

describe("R41 daily discovery", () => {
  it("stores the availability of every dataset of every account and zone", async () => {
    await runDailyTask(env, NOW, fakeCloudflare().fetchFn);
    expect(await count("SELECT COUNT(*) AS n FROM dataset_availability WHERE enabled = 1")).toBe(3 * ACCOUNT_DATASETS.length + 3 * ZONE_DATASETS.length);
  });
});

describe("scheduled handler", () => {
  it("runs the daily task for the scheduled time", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fakeCloudflare().fetchFn);
    const controller = createScheduledController({ scheduledTime: NOW, cron: "0 1 * * *" });
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await trafficDays(soma.id)).toEqual([YESTERDAY]);
  });
});
