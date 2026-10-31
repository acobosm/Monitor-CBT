// Data routes behind the Access middleware. They validate input, read D1 and the live current day, and respond
// with everything ready to display. Cloudflare errors become fixed notices: no raw error, no token (R5).
import { Hono } from "hono";
import limitsJson from "../../config/limits.json";
import sitesJson from "../../config/sites.json";
import type { AccessVariables } from "../access";
import { describeError, graphql, GraphQLError } from "../cloudflare/graphql";
import { ACCOUNT_USAGE_QUERY, siteDayQuery, type AccountUsageData, type SiteDayData } from "../cloudflare/queries";
import { verifyToken } from "../cloudflare/token";
import { recordAudit } from "../db/audit";
import { readSiteDayDetail, readSiteTraffic, readUsage, zoneDatasets, type TrafficTotals, type UsageMetric } from "../db/statistics";
import { TtlCache } from "../logic/cache";
import { utcDay } from "../logic/days";
import { liveReadNotice } from "../logic/notices";
import { evaluateToken } from "../logic/token";
import { countryShares, datasetNotice, ipRows, parseSiteDay, siteDayVariables, trafficTable, type SiteConfig } from "../logic/traffic";
import { evaluateUsage, parseAccountUsage, partialDayMetrics, type LimitsConfig, type ParsedAccountUsage } from "../logic/usage";

const DAY_MS = 86_400_000;
const limits = limitsJson as LimitsConfig;
const sites = sitesJson.sites as SiteConfig[];

export interface ApiDeps {
  fetchFn?: typeof fetch;
  now?: () => Date;
}

function shiftDay(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

/** Days from `from` to `to`, both included. */
function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) days.push(day);
  return days;
}

function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && utcDay(new Date(`${day}T00:00:00Z`)) === day;
}

function tokenRejected(error: unknown): boolean {
  return error instanceof GraphQLError && error.kind === "auth";
}

export function apiRoutes(deps: ApiDeps = {}) {
  const fetchFn: typeof fetch = deps.fetchFn ?? ((input, init) => fetch(input, init));
  const clock = deps.now ?? (() => new Date());
  const cache = new TtlCache();
  const api = new Hono<{ Bindings: Env; Variables: AccessVariables }>();

  function requireToken(env: Env): string {
    if (!env.CLOUDFLARE_ANALYTICS_TOKEN) throw new GraphQLError("auth", "Analytics token is not set");
    return env.CLOUDFLARE_ANALYTICS_TOKEN;
  }

  /** R8–R13. */
  api.get("/token", async (c) => {
    const now = clock();
    await recordAudit(c.env.AUDIT_DB, { email: c.get("email"), action: "view", target: "token" }, now);
    return c.json(evaluateToken(await verifyToken(c.env.CLOUDFLARE_ANALYTICS_TOKEN, fetchFn), now));
  });

  /** R14–R20, R34, R35, R42. */
  api.get("/usage", async (c) => {
    const now = clock();
    await recordAudit(c.env.AUDIT_DB, { email: c.get("email"), action: "view", target: "usage" }, now);

    const today = utcDay(now);
    const monthStart = `${today.slice(0, 7)}-01`;
    const weekBack = shiftDay(today, -8);
    // One query per account covers the month and the last week: figures are complete from the first day,
    // when D1 has no history yet (P9). Nothing read here is stored (R34). Worker requests are a daily metric
    // (today and 7-day peak), so they only need the last week, which keeps them precise (R43).
    const fromDay = weekBack < monthStart ? weekBack : monthStart;
    const stored = await readUsage(c.env.STATS_DB, fromDay);

    const results = await Promise.allSettled(
      sitesJson.accounts.map((account) =>
        cache.get<ParsedAccountUsage>(`usage:${account.accountId}:${today}`, now.getTime(), async () => {
          const data = await graphql<AccountUsageData>(
            requireToken(c.env),
            ACCOUNT_USAGE_QUERY,
            { tag: account.accountId, from: fromDay, workersFrom: weekBack, to: today },
            fetchFn,
          );
          return parseAccountUsage(data, dayRange(fromDay, today));
        }),
      ),
    );

    let rejected = false;
    let failed = false;
    const accounts = sitesJson.accounts.map((account, i) => {
      const result = results[i]!;
      const history: Record<string, UsageMetric[]> = { ...stored.accounts[account.accountId] };
      let extras: { unclassifiedR2?: string[]; largestD1Id?: string | null } = {};
      if (result.status === "fulfilled") {
        const live = result.value;
        Object.assign(history, live.days);
        history[today] = partialDayMetrics(live.days[today] ?? []);
        // The base named is the one of the day whose size is shown: a database deleted since then is not named.
        const shownDay = Object.keys(history).filter((d) => history[d]?.some((m) => m.metric === "largest_db_bytes")).sort().at(-1);
        extras = { unclassifiedR2: live.unclassifiedR2, largestD1Id: shownDay ? live.largestD1[shownDay] : null };
      } else {
        failed = true;
        rejected ||= tokenRejected(result.reason);
        console.error("live usage failed", { account: account.id, error: describeError(result.reason) });
      }
      return {
        id: account.id,
        name: account.name,
        live: result.status === "fulfilled",
        ...evaluateUsage(history, limits, now, extras),
      };
    });

    return c.json({ accounts, notice: failed ? liveReadNotice(rejected, stored.lastDay) : null });
  });

  /** R21–R27, R34, R35, R42. */
  api.get("/sites/:id", async (c) => {
    const site = sites.find((s) => s.id === c.req.param("id"));
    if (!site) return c.json({ error: "invalid site" }, 400);

    const now = clock();
    const today = utcDay(now);
    const stored = await readSiteTraffic(c.env.STATS_DB, site.id, shiftDay(today, -29));

    const requestedDay = c.req.query("day");
    if (requestedDay !== undefined && !(isValidDay(requestedDay) && stored.days.includes(requestedDay))) {
      return c.json({ error: "invalid day" }, 400);
    }
    // R24: the last complete day by default.
    const selectedDay = requestedDay ?? stored.days.filter((d) => d < today).at(-1) ?? null;

    await recordAudit(c.env.AUDIT_DB, { email: c.get("email"), action: "view", target: `site:${site.id}` }, now);

    const traffic: Record<string, TrafficTotals> = { ...stored.traffic };
    let notice: string | null = null;
    try {
      // Only the totals are kept in memory, never the IPs of the response.
      traffic[today] = await cache.get<TrafficTotals>(`site:${site.id}:${today}`, now.getTime(), async () => {
        const data = await graphql<SiteDayData>(requireToken(c.env), siteDayQuery(!!site.host), siteDayVariables(site, today), fetchFn);
        return parseSiteDay(site, today, data, null).traffic;
      });
    } catch (error) {
      console.error("live traffic failed", { site: site.id, error: describeError(error) });
      notice = liveReadNotice(tokenRejected(error), stored.days.at(-1) ?? null);
    }

    const datasets = await zoneDatasets(c.env.STATS_DB, site.zoneTag);
    const unavailable = datasetNotice(datasets.httpRequestsAdaptiveGroups);
    const detail = selectedDay && !unavailable ? await readSiteDayDetail(c.env.STATS_DB, site.id, selectedDay) : null;

    return c.json({
      id: site.id,
      name: site.name,
      notice,
      traffic: trafficTable(traffic, now),
      pageViewsNotice: datasetNotice(datasets.httpRequests1dGroups),
      days: stored.days,
      selectedDay,
      // R27: the text replaces the tables when Cloudflare does not offer the data.
      unavailableText: unavailable,
      countries: detail ? countryShares(detail.countries) : [],
      topTrafficIps: detail ? ipRows(detail.ips, "traffic") : [],
      topSecurityIps: detail ? ipRows(detail.ips, "security") : [],
    });
  });

  return api;
}
