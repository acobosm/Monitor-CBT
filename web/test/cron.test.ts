import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sitesJson from "../config/sites.json";
import { ACCOUNT_DATASETS, ZONE_DATASETS } from "../src/cloudflare/queries";
import { GAP_SITE_DAYS_PER_RUN, runDailyTask } from "../src/cron";
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
}

/** Fake Cloudflare GraphQL API: answers by operation name with dummy fixtures and records each call. */
function fakeCloudflare(options: FakeOptions = {}) {
  const calls: { op: string; variables: Record<string, unknown> }[] = [];
  const fetchFn: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const op = /query (\w+)/.exec(body.query)?.[1] ?? "unknown";
    calls.push({ op, variables: body.variables });
    if (op === "Settings") return Response.json({ data: settingsData });
    if (op === "AccountUsage") {
      if (body.variables.tag === options.failAccount) return new Response("unavailable", { status: 503 });
      return Response.json({ data: accountFixture });
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
    ["usage_daily", "traffic_daily", "country_daily", "ip_daily", "dataset_availability"].map((t) => db.prepare(`DELETE FROM ${t}`)),
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
    expect(cobtecCall?.variables).toMatchObject({ from: "2026-10-25", workersFrom: "2026-10-25", to: YESTERDAY });
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
      "boraei:2026-10-04", "mohamed-boraei:2026-10-04",
    ]);
    // Cloudflare calls: 1 discovery + 3 accounts + 2 per site-day; D1 batches: 1 discovery + 1 stored days
    // + 3 accounts + 1 per site-day + 1 purge.
    const d1 = 1 + 1 + 3 + (3 + GAP_SITE_DAYS_PER_RUN) + 1;
    expect(calls).toHaveLength(1 + 3 + 2 * (3 + GAP_SITE_DAYS_PER_RUN));
    expect(calls.length + d1).toBeLessThanOrEqual(50);
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
