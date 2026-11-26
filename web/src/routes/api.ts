// Data routes behind the Access middleware. They validate input, read D1 and the live current day, and respond
// with everything ready to display. Cloudflare errors become fixed notices: no raw error, no token (R5).
import { Hono } from "hono";
import limitsJson from "../../config/limits.json";
import sitesJson from "../../config/sites.json";
import type { AccessVariables } from "../access";
import { describeError, graphql, GraphQLError } from "../cloudflare/graphql";
import {
  accountCpuQuery,
  accountUsageQuery,
  type AccountCpuData,
  siteDayQuery,
  siteVisitsQuery,
  type AccountUsageData,
  type SiteDayData,
  type SiteVisitsData,
} from "../cloudflare/queries";
import { verifyToken } from "../cloudflare/token";
import { recordAudit } from "../db/audit";
import { readCpu, readSiteDayDetail, readSiteTraffic, readUsage, zoneDatasets, type ScriptCpu, type TrafficTotals } from "../db/statistics";
import { PAST_TTL_MS, TtlCache } from "../logic/cache";
import { accountCpuSeries, parseCpu, siteCpuDays, UNKNOWN_SCRIPT } from "../logic/cpu";
import { chartDays, dayRange, utcDay, workerDays } from "../logic/days";
import { liveReadNotice } from "../logic/notices";
import { dayPoints, mergeHistory, panelSummary, siteSummary, usageCharts } from "../logic/series";
import { evaluateToken } from "../logic/token";
import { countryShares, datasetNotice, ipRows, parseSiteDay, parseSiteVisits, siteDayVariables, trafficTable, type SiteConfig } from "../logic/traffic";
import { evaluateUsage, nearLimit, parseAccountUsage, partialDayMetrics, type LimitsConfig, type ParsedAccountUsage } from "../logic/usage";

const limits = limitsJson as LimitsConfig;
const sites = sitesJson.sites as SiteConfig[];

export interface ApiDeps {
  fetchFn?: typeof fetch;
  now?: () => Date;
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
  const pastCache = new TtlCache(PAST_TTL_MS);
  const api = new Hono<{ Bindings: Env; Variables: AccessVariables }>();

  function requireToken(env: Env): string {
    if (!env.CLOUDFLARE_ANALYTICS_TOKEN) throw new GraphQLError("auth", "Analytics token is not set");
    return env.CLOUDFLARE_ANALYTICS_TOKEN;
  }

  /**
   * Usage of every account: stored days completed with one live query per account, which covers the month
   * and the 30 chart days. Nothing read here is stored (R34, R35).
   */
  async function accountsUsage(env: Env, now: Date) {
    const today = utcDay(now);
    const monthStart = `${today.slice(0, 7)}-01`;
    const days = chartDays(now);
    // At most 31 days per query: the month, or the chart days when they reach into the previous month.
    const fromDay = days[0]! < monthStart ? days[0]! : monthStart;
    const stored = await readUsage(env.STATS_DB, fromDay);
    const query = accountUsageQuery(workerDays(dayRange(fromDay, today), now));

    const results = await Promise.allSettled(
      sitesJson.accounts.map((account) =>
        cache.get<ParsedAccountUsage>(`usage:${account.accountId}:${today}`, now.getTime(), async () => {
          const data = await graphql<AccountUsageData>(requireToken(env), query, { tag: account.accountId, from: fromDay, to: today }, fetchFn);
          return parseAccountUsage(data, dayRange(fromDay, today));
        }),
      ),
    );

    let rejected = false;
    let failed = false;
    const accounts = sitesJson.accounts.map((account, i) => {
      const result = results[i]!;
      let history = stored.accounts[account.accountId] ?? {};
      let extras: { unclassifiedR2?: string[]; largestD1Id?: string | null } = {};
      if (result.status === "fulfilled") {
        const live = result.value;
        history = mergeHistory(history, live.days);
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
        accountId: account.accountId,
        live: result.status === "fulfilled",
        table: evaluateUsage(history, limits, now, extras),
        charts: usageCharts(history, limits, now),
      };
    });
    return { accounts, failed, rejected, lastDay: stored.lastDay };
  }

  /**
   * Workers CPU of the given accounts over the chart days (spec 004 R9, R21): stored days from D1 and today
   * read live in a query of its own, so a failure never touches the plan usage. Nothing read here is stored.
   */
  async function accountsCpu(env: Env, now: Date, accountIds: string[]) {
    const today = utcDay(now);
    const stored = await readCpu(env.STATS_DB, chartDays(now)[0]!);
    const results = await Promise.allSettled(
      accountIds.map((accountId) =>
        cache.get<ScriptCpu[]>(`cpu:${accountId}:${today}`, now.getTime(), async () => {
          const data = await graphql<AccountCpuData>(requireToken(env), accountCpuQuery([today]), { tag: accountId }, fetchFn);
          const parsed = parseCpu(data, [today])[today];
          if (!parsed) throw new GraphQLError("query", "Workers CPU of today missing from the response");
          return parsed;
        }),
      ),
    );

    let failed = false;
    let rejected = false;
    const days: Record<string, Record<string, ScriptCpu[]>> = {};
    accountIds.forEach((accountId, i) => {
      const result = results[i]!;
      const accountDays = { ...(stored[accountId] ?? {}) };
      if (result.status === "fulfilled") accountDays[today] = result.value;
      else {
        // Today stays "Sin dato": the stored days are still shown.
        delete accountDays[today];
        failed = true;
        rejected ||= tokenRejected(result.reason);
        console.error("live workers cpu failed", { account: accountId, error: describeError(result.reason) });
      }
      days[accountId] = accountDays;
    });
    return { days, failed, rejected };
  }

  /**
   * Daily visits of one site for the chart days (R26, R35): stored days, and the missing ones read from
   * Cloudflare one day per part of a single query, without storing them. `today` is the live figure when the
   * caller already has it; otherwise today is read too.
   */
  async function siteVisits(env: Env, site: SiteConfig, now: Date, stored: Record<string, TrafficTotals>, today?: number | null) {
    const day = utcDay(now);
    const values: Record<string, number | null> = Object.fromEntries(Object.entries(stored).map(([d, t]) => [d, t.visits]));
    const read = async (cacheOf: TtlCache, days: string[]) => {
      if (!days.length) return {};
      return cacheOf.get(`visits:${site.id}:${days.join(",")}`, now.getTime(), async () => {
        const data = await graphql<SiteVisitsData>(requireToken(env), siteVisitsQuery(days, !!site.host), { tag: site.zoneTag, ...(site.host ? { host: site.host } : {}) }, fetchFn);
        return parseSiteVisits(data, days);
      });
    };

    let error: unknown = null;
    const missing = chartDays(now).filter((d) => d !== day && !(d in stored));
    const [past, live] = await Promise.allSettled([read(pastCache, missing), today === undefined ? read(cache, [day]) : Promise.resolve({ [day]: today })]);
    for (const result of [past, live]) {
      if (result.status === "fulfilled") Object.assign(values, result.value);
      else error = result.reason;
    }
    if (error) console.error("live visits failed", { site: site.id, error: describeError(error) });
    return { points: dayPoints(values, now), error };
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

    const [usage, cpu] = await Promise.all([accountsUsage(c.env, now), accountsCpu(c.env, now, sitesJson.accounts.map((a) => a.accountId))]);
    return c.json({
      accounts: usage.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        live: a.live,
        ...a.table,
        charts: a.charts,
        cpu: accountCpuSeries(cpu.days[a.accountId] ?? {}, now),
      })),
      notice: usage.failed || cpu.failed ? liveReadNotice(usage.rejected || cpu.rejected, usage.lastDay) : null,
    });
  });

  /** R13–R16: summary and one card per site. It shows every site together, so it stays owner-only. */
  api.get("/panel", async (c) => {
    const now = clock();
    await recordAudit(c.env.AUDIT_DB, { email: c.get("email"), action: "view", target: "panel" }, now);

    const usage = await accountsUsage(c.env, now);
    const cards = await Promise.all(
      sites.map(async (site) => {
        const stored = await readSiteTraffic(c.env.STATS_DB, site.id, chartDays(now)[0]!);
        const visits = await siteVisits(c.env, site, now, stored.traffic);
        const account = usage.accounts.find((a) => a.accountId === site.accountId);
        return {
          id: site.id,
          name: site.name,
          domain: site.zone,
          nearLimit: account ? nearLimit(account.table.rows) : false,
          summary: siteSummary(visits.points, now),
          visits: visits.points,
          error: visits.error,
        };
      }),
    );

    const failed = usage.failed || cards.some((card) => card.error);
    const rejected = usage.rejected || cards.some((card) => tokenRejected(card.error));
    return c.json({
      summary: panelSummary(cards),
      cards: cards.map(({ error: _error, ...card }) => card),
      notice: failed ? liveReadNotice(rejected, usage.lastDay) : null,
    });
  });

  /** R21–R27, R34, R35, R42. */
  api.get("/sites/:id", async (c) => {
    const site = sites.find((s) => s.id === c.req.param("id"));
    if (!site) return c.json({ error: "invalid site" }, 400);

    const now = clock();
    const today = utcDay(now);
    const stored = await readSiteTraffic(c.env.STATS_DB, site.id, chartDays(now)[0]!);

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

    // R26: the chart reuses today's live figure; only the days missing from D1 are read.
    const visits = await siteVisits(c.env, site, now, stored.traffic, traffic[today]?.visits ?? null);
    // Spec 004: only the site's own scripts, and never their names (R9). A site without scripts reads nothing.
    let cpu: Record<string, unknown> | null = null;
    if (site.scripts.length) {
      const accountCpu = await accountsCpu(c.env, now, [site.accountId]);
      if (accountCpu.failed) notice ??= liveReadNotice(accountCpu.rejected, stored.days.at(-1) ?? null);
      cpu = siteCpuDays(site, accountCpu.days[site.accountId] ?? {}, now);
    }

    const datasets = await zoneDatasets(c.env.STATS_DB, site.zoneTag);
    const unavailable = datasetNotice(datasets.httpRequestsAdaptiveGroups);
    const detail = selectedDay && !unavailable ? await readSiteDayDetail(c.env.STATS_DB, site.id, selectedDay) : null;

    return c.json({
      id: site.id,
      name: site.name,
      notice,
      traffic: trafficTable(traffic, now),
      hasWorkers: site.scripts.length > 0,
      includesUnknown: site.scripts.includes(UNKNOWN_SCRIPT),
      cpu,
      visits: visits.points,
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
