import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sitesJson from "../config/sites.json";
import { saveAccountDay, saveDatasetAvailability, saveSiteDay, type SiteDay } from "../src/db/statistics";
import { createApp } from "../src/index";
import { TEXT_NO_HISTORY } from "../src/logic/notices";
import { TEXT_INVALID, TEXT_UNVERIFIED } from "../src/logic/token";
import { TEXT_NOT_ON_FREE, TEXT_PARTIAL } from "../src/logic/traffic";
import dayFixture from "./fixtures/site-day.json";
import { accessJwt, testKeys } from "./helpers/access-jwt";

const NOW = new Date("2026-10-29T15:00:00Z");
const TODAY = "2026-10-29";
const YESTERDAY = "2026-10-28";
const ORIGIN = "https://monitor-cbt.example.workers.dev";
const soma = sitesJson.sites[0]!;
const cobtec = sitesJson.accounts[0]!;
const db = env.STATS_DB;

interface FakeOptions {
  graphql?: () => Response | Promise<Response>;
  verify?: () => Response | Promise<Response>;
}

/** Fake Cloudflare: dummy data only, every call recorded. */
function fakeCloudflare(options: FakeOptions = {}) {
  const calls: { op: string; variables: Record<string, unknown> }[] = [];
  const usage = {
    viewer: {
      accounts: [
        {
          workers: [
            { sum: { requests: 900 }, dimensions: { date: TODAY } },
            { sum: { requests: 2000 }, dimensions: { date: YESTERDAY } },
          ],
          d1: [],
          d1Storage: [{ max: { databaseSizeBytes: 1000 }, dimensions: { date: YESTERDAY, databaseId: "db-1" } }],
          r2Storage: [],
          r2Ops: [{ sum: { requests: 5 }, dimensions: { date: TODAY, actionType: "UnknownOperation" } }],
        },
      ],
    },
  };
  const fetchFn: typeof fetch = async (url, init) => {
    if (String(url).includes("tokens/verify")) {
      calls.push({ op: "verify", variables: {} });
      return options.verify
        ? options.verify()
        : Response.json({ success: true, result: { status: "active", not_before: "2026-10-01T00:00:00Z", expires_on: "2026-12-31T00:00:00Z" } });
    }
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const op = /query (\w+)/.exec(body.query)?.[1] ?? "unknown";
    calls.push({ op, variables: body.variables });
    if (options.graphql) return options.graphql();
    return Response.json({ data: op === "AccountUsage" ? usage : dayFixture });
  };
  return { fetchFn, calls };
}

function appWith(fake: ReturnType<typeof fakeCloudflare>, now = () => NOW) {
  return createApp(testKeys, { fetchFn: fake.fetchFn, now });
}

async function get(app: ReturnType<typeof createApp>, path: string, overrides: Partial<Env> = {}) {
  const headers = { "Cf-Access-Jwt-Assertion": await accessJwt() };
  return app.request(`${ORIGIN}${path}`, { headers }, { ...env, ...overrides });
}

async function json(res: Response): Promise<any> {
  return res.json();
}

function storedDay(day: string, requests = 7): SiteDay {
  return {
    day,
    siteId: soma.id,
    traffic: { requests, visits: 2, pageViews: 3, bytes: 4 },
    countries: [
      { country: "EC", requests: 3 },
      { country: "US", requests: 1 },
    ],
    ips: [
      { kind: "traffic", ip: "192.0.2.1", country: "EC", requests: 9, lastSeenHour: `${day}T15:00:00Z` },
      { kind: "security", ip: "192.0.2.2", country: "US", requests: 4, action: "block", lastSeenHour: `${day}T16:00:00Z` },
    ],
  };
}

async function auditRows() {
  const { results } = await env.AUDIT_DB.prepare("SELECT email, action, target FROM audit_event ORDER BY id").all();
  return results;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await db.batch(["usage_daily", "traffic_daily", "country_daily", "ip_daily", "dataset_availability"].map((t) => db.prepare(`DELETE FROM ${t}`)));
  await env.AUDIT_DB.prepare("DELETE FROM audit_event").run();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R1 data routes are protected", () => {
  for (const path of ["/api/token", "/api/usage", "/api/sites/soma"]) {
    it(`${path} answers 403 without a JWT and calls nothing`, async () => {
      const fake = fakeCloudflare();
      const res = await appWith(fake).request(`${ORIGIN}${path}`, {}, env);
      expect(res.status).toBe(403);
      expect(fake.calls).toEqual([]);
      expect(await auditRows()).toEqual([]);
    });
  }
});

describe("R5 the token never reaches a response", () => {
  it("is absent from successful answers and from errors that quote it", async () => {
    const quoting = fakeCloudflare({
      graphql: () => Response.json({ errors: [{ message: "bad token test-token" }] }),
      verify: () => Response.json({ success: false, errors: [{ message: "test-token" }] }),
    });
    for (const fake of [fakeCloudflare(), quoting]) {
      const app = appWith(fake);
      for (const path of ["/api/token", "/api/usage", "/api/sites/soma"]) {
        expect(await (await get(app, path)).text()).not.toContain("test-token");
      }
    }
  });
});

describe("R6, R7 audit", () => {
  it("records email, date and time, and the screen or site requested", async () => {
    const app = appWith(fakeCloudflare());
    await get(app, "/api/usage");
    await get(app, "/api/sites/soma");
    await get(app, "/api/token");
    expect(await auditRows()).toEqual([
      { email: "owner@example.com", action: "view", target: "usage" },
      { email: "owner@example.com", action: "view", target: "site:soma" },
      { email: "owner@example.com", action: "view", target: "token" },
    ]);
    const row = await env.AUDIT_DB.prepare("SELECT at FROM audit_event LIMIT 1").first<{ at: string }>();
    expect(row?.at).toBe(NOW.toISOString());
  });

  it("still returns the data and logs the error when the audit cannot be written", async () => {
    const broken = { prepare: () => { throw new Error("audit down"); } } as unknown as D1Database;
    const res = await get(appWith(fakeCloudflare()), "/api/usage", { AUDIT_DB: broken });
    expect(res.status).toBe(200);
    expect((await json(res)).accounts).toHaveLength(3);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("does not audit a rejected request", async () => {
    await get(appWith(fakeCloudflare()), "/api/sites/nope");
    expect(await auditRows()).toEqual([]);
  });
});

describe("/api/token (R8–R13)", () => {
  it("R8 shows the remaining days read from tokens/verify", async () => {
    const body = await json(await get(appWith(fakeCloudflare()), "/api/token"));
    expect(body).toMatchObject({ state: "valid", daysLeft: 63, text: "Token vence en 63 días", level: "normal" });
  });

  it("R11 shows the invalid notice for a rejected token", async () => {
    const fake = fakeCloudflare({ verify: () => Response.json({ success: false, result: null }, { status: 401 }) });
    expect((await json(await get(appWith(fake), "/api/token"))).text).toBe(TEXT_INVALID);
  });

  it("R11 shows the invalid notice without calling Cloudflare when the token is missing", async () => {
    const fake = fakeCloudflare();
    const res = await get(appWith(fake), "/api/token", { CLOUDFLARE_ANALYTICS_TOKEN: "" });
    expect((await json(res)).text).toBe(TEXT_INVALID);
    expect(fake.calls).toEqual([]);
  });

  const unreachable: [string, () => Response][] = [
    ["a network error", () => { throw new TypeError("network"); }],
    ["a server error", () => new Response("down", { status: 503 })],
    ["a non-JSON answer", () => new Response("<html>", { status: 200 })],
  ];
  for (const [name, verify] of unreachable) {
    it(`R12 answers 200 with the unverified notice on ${name}`, async () => {
      const res = await get(appWith(fakeCloudflare({ verify })), "/api/token");
      expect(res.status).toBe(200);
      expect((await json(res)).text).toBe(TEXT_UNVERIFIED);
    });
  }
});

describe("/api/usage (R14–R20, R34, R35, R42)", () => {
  it("R14, R15 returns every account with its table, limits date and states ready", async () => {
    const body = await json(await get(appWith(fakeCloudflare()), "/api/usage"));
    expect(body.notice).toBeNull();
    expect(body.accounts.map((a: { id: string }) => a.id)).toEqual(sitesJson.accounts.map((a) => a.id));
    const account = body.accounts[0];
    expect(account.live).toBe(true);
    expect(account.limitsCheckedText).toContain("Límites verificados el");
    expect(account.rows.map((r: { label: string }) => r.label)).toContain("Base más grande");
    expect(account.rows[0]).toMatchObject({ metric: "requests", usage: 900, peak7: 2000, stateText: "Normal" });
  });

  it("R20 lists unclassified R2 operations", async () => {
    const body = await json(await get(appWith(fakeCloudflare()), "/api/usage"));
    expect(body.accounts[0].unclassifiedText).toContain("UnknownOperation");
  });

  it("R18 keeps the last known storage when today's is not reported yet", async () => {
    const body = await json(await get(appWith(fakeCloudflare()), "/api/usage"));
    const storage = body.accounts[0].rows.find((r: { product: string; metric: string }) => r.product === "d1" && r.metric === "storage_bytes");
    expect(storage.usage).toBe(1000);
  });

  it("R34 reads the current day from the API and stores nothing", async () => {
    const fake = fakeCloudflare();
    await get(appWith(fake), "/api/usage");
    expect(fake.calls.map((c) => c.op)).toEqual(["AccountUsage", "AccountUsage", "AccountUsage"]);
    expect(fake.calls[0]?.variables).toMatchObject({ to: TODAY, from: "2026-10-01" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM usage_daily").first("n")).toBe(0);
  });

  it("uses at most 32 days per query, also when the week reaches into the previous month", async () => {
    const fake = fakeCloudflare();
    await get(appWith(fake, () => new Date("2026-10-03T12:00:00Z")), "/api/usage");
    expect(fake.calls[0]?.variables).toMatchObject({ from: "2026-09-25", to: "2026-10-03" });
  });

  it("R34 reuses the read for 60 seconds, then reads again", async () => {
    const fake = fakeCloudflare();
    let now = NOW;
    const app = appWith(fake, () => now);
    await get(app, "/api/usage");
    now = new Date(NOW.getTime() + 59_000);
    await get(app, "/api/usage");
    expect(fake.calls).toHaveLength(3);
    now = new Date(NOW.getTime() + 60_000);
    await get(app, "/api/usage");
    expect(fake.calls).toHaveLength(6);
  });

  it("does not cache a failed read", async () => {
    let fail = true;
    const fake = fakeCloudflare({
      graphql: () => (fail ? new Response("down", { status: 503 }) : Response.json({ data: { viewer: { accounts: [] } } })),
    });
    const app = appWith(fake);
    expect((await json(await get(app, "/api/usage"))).notice).not.toBeNull();
    fail = false;
    expect((await json(await get(app, "/api/usage"))).notice).toBeNull();
  });

  it("R35 shows the stored history and its date when the API does not respond", async () => {
    await saveAccountDay(db, YESTERDAY, cobtec.accountId, [{ product: "workers", metric: "requests", value: 1234 }]);
    const fake = fakeCloudflare({ graphql: () => new Response("down", { status: 503 }) });
    const body = await json(await get(appWith(fake), "/api/usage"));
    expect(body.notice).toBe("No pudimos leer los datos recientes de Cloudflare. Se muestra el historial guardado hasta el 28 de octubre de 2026.");
    expect(body.accounts[0].live).toBe(false);
    expect(body.accounts[0].rows[0].peak7).toBe(1234);
  });

  it("R42 says there is no history when the API fails and nothing is stored", async () => {
    const fake = fakeCloudflare({ graphql: () => new Response("down", { status: 503 }) });
    expect((await json(await get(appWith(fake), "/api/usage"))).notice).toBe(TEXT_NO_HISTORY);
  });

  it("R11 keeps the history when Cloudflare rejects the token", async () => {
    await saveAccountDay(db, YESTERDAY, cobtec.accountId, [{ product: "workers", metric: "requests", value: 1234 }]);
    const fake = fakeCloudflare({ graphql: () => new Response("no", { status: 403 }) });
    const body = await json(await get(appWith(fake), "/api/usage"));
    expect(body.notice).toBe(TEXT_INVALID);
    expect(body.accounts[0].rows[0].peak7).toBe(1234);
  });

  it("R11 does not call GraphQL when the token is missing", async () => {
    const fake = fakeCloudflare();
    const body = await json(await get(appWith(fake), "/api/usage", { CLOUDFLARE_ANALYTICS_TOKEN: "" }));
    expect(body.notice).toBe(TEXT_INVALID);
    expect(fake.calls).toEqual([]);
  });
});

describe("/api/sites/:id (R21–R27, R34, R35, R42)", () => {
  it("R21, R22, R23 returns 30 days with the current one labeled and the day note", async () => {
    await saveSiteDay(db, storedDay(YESTERDAY));
    const body = await json(await get(appWith(fakeCloudflare()), "/api/sites/soma"));
    expect(body.traffic.note).toBe("Cada día va de 19:00 a 19:00 ECT.");
    expect(body.traffic.rows).toHaveLength(30);
    expect(body.traffic.rows[0]).toMatchObject({ day: TODAY, label: TEXT_PARTIAL, partial: true, totals: { requests: 1561 } });
    expect(body.traffic.rows[1].totals.requests).toBe(7);
    expect(body.traffic.rows[2].totals).toBeNull();
  });

  it("R34 reads today with one query and stores nothing", async () => {
    const fake = fakeCloudflare();
    await get(appWith(fake), "/api/sites/soma");
    expect(fake.calls.map((c) => c.op)).toEqual(["SiteDay"]);
    expect(fake.calls[0]?.variables).toMatchObject({ day: TODAY, tag: soma.zoneTag });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM traffic_daily").first("n")).toBe(0);
  });

  it("R34 reuses the read for 60 seconds, per site", async () => {
    const fake = fakeCloudflare();
    const app = appWith(fake);
    await get(app, "/api/sites/soma");
    await get(app, "/api/sites/soma");
    expect(fake.calls).toHaveLength(1);
    await get(app, "/api/sites/boraei");
    expect(fake.calls).toHaveLength(2);
  });

  it("R24, R25, R26 selects the last complete day by default, with countries and both top IP tables", async () => {
    await saveSiteDay(db, storedDay("2026-10-27"));
    await saveSiteDay(db, storedDay(YESTERDAY));
    const body = await json(await get(appWith(fakeCloudflare()), "/api/sites/soma"));
    expect(body.selectedDay).toBe(YESTERDAY);
    expect(body.days).toEqual(["2026-10-27", YESTERDAY]);
    expect(body.countries).toEqual([
      { country: "EC", requests: 3, percent: 75 },
      { country: "US", requests: 1, percent: 25 },
    ]);
    expect(body.topTrafficIps).toEqual([{ ip: "192.0.2.1", country: "EC", requests: 9, actionText: null, lastSeen: "10:00–11:00" }]);
    expect(body.topSecurityIps).toEqual([{ ip: "192.0.2.2", country: "US", requests: 4, actionText: "Bloqueada", lastSeen: "11:00–12:00" }]);
  });

  it("R24 returns the chosen day of the history", async () => {
    await saveSiteDay(db, storedDay("2026-10-27"));
    await saveSiteDay(db, storedDay(YESTERDAY));
    expect((await json(await get(appWith(fakeCloudflare()), "/api/sites/soma?day=2026-10-27"))).selectedDay).toBe("2026-10-27");
  });

  it("one site's data never appears in another's", async () => {
    await saveSiteDay(db, storedDay(YESTERDAY));
    const body = await json(await get(appWith(fakeCloudflare()), "/api/sites/boraei"));
    expect(body).toMatchObject({ selectedDay: null, days: [], countries: [], topTrafficIps: [], topSecurityIps: [] });
    expect(JSON.stringify(body)).not.toContain("192.0.2.1\"");
  });

  it("answers an empty selection when there is no history yet", async () => {
    const body = await json(await get(appWith(fakeCloudflare()), "/api/sites/soma"));
    expect(body).toMatchObject({ selectedDay: null, days: [], countries: [] });
  });

  const invalid = ["/api/sites/nope", "/api/sites/soma?day=ayer", "/api/sites/soma?day=2026-02-30", "/api/sites/soma?day=2026-10-27", `/api/sites/soma?day=${TODAY}`, "/api/sites/soma?day="];
  for (const path of invalid) {
    it(`answers 400 with no data for ${path}`, async () => {
      await saveSiteDay(db, storedDay(YESTERDAY));
      const fake = fakeCloudflare();
      const res = await get(appWith(fake), path);
      expect(res.status).toBe(400);
      expect(Object.keys(await json(res))).toEqual(["error"]);
      expect(fake.calls).toEqual([]);
    });
  }

  it("R27 replaces the tables when the discovery says the dataset is disabled", async () => {
    await saveSiteDay(db, storedDay(YESTERDAY));
    await saveDatasetAvailability(db, [
      { scope: "zone", tag: soma.zoneTag, dataset: "httpRequestsAdaptiveGroups", enabled: false, notOlderThanS: null, maxDurationS: null },
      { scope: "zone", tag: soma.zoneTag, dataset: "httpRequests1dGroups", enabled: false, notOlderThanS: null, maxDurationS: null },
    ]);
    const body = await json(await get(appWith(fakeCloudflare()), "/api/sites/soma"));
    expect(body).toMatchObject({ unavailableText: TEXT_NOT_ON_FREE, pageViewsNotice: TEXT_NOT_ON_FREE, countries: [], topTrafficIps: [], topSecurityIps: [] });
  });

  it("R27 shows the tables while the dataset is enabled or not yet discovered", async () => {
    await saveSiteDay(db, storedDay(YESTERDAY));
    const body = await json(await get(appWith(fakeCloudflare()), "/api/sites/soma"));
    expect(body.unavailableText).toBeNull();
    expect(body.countries).toHaveLength(2);
  });

  it("R35 keeps the stored days and names the last one when the API does not respond", async () => {
    await saveSiteDay(db, storedDay(YESTERDAY));
    const fake = fakeCloudflare({ graphql: () => { throw new TypeError("network"); } });
    const res = await get(appWith(fake), "/api/sites/soma");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.notice).toBe("No pudimos leer los datos recientes de Cloudflare. Se muestra el historial guardado hasta el 28 de octubre de 2026.");
    expect(body.traffic.rows[0].totals).toBeNull();
    expect(body.traffic.rows[1].totals.requests).toBe(7);
  });

  it("R42 says there is no history when the API fails and nothing is stored", async () => {
    const fake = fakeCloudflare({ graphql: () => new Response("down", { status: 503 }) });
    expect((await json(await get(appWith(fake), "/api/sites/soma"))).notice).toBe(TEXT_NO_HISTORY);
  });

  it("R11 shows the token notice when Cloudflare rejects the token", async () => {
    const fake = fakeCloudflare({ graphql: () => new Response("no", { status: 401 }) });
    expect((await json(await get(appWith(fake), "/api/sites/soma"))).notice).toBe(TEXT_INVALID);
  });
});
