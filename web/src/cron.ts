// Daily task (01:00 UTC): discovery, plan usage of every account, traffic of every site for the previous
// UTC day, recovery of days that failed after the first stored day, and IP purge (R28–R33, R41).
// Spec 004: Workers CPU per account in a query and a D1 batch of their own.
// Budget: Workers Free allows 50 subrequests per invocation (fetch and D1 counted together here).
// A normal run uses about 26; the worst case with the full recovery cap is 47.
import sitesJson from "../config/sites.json";
import { describeError, graphql } from "./cloudflare/graphql";
import {
  accountCpuQuery,
  accountUsageQuery,
  CPU_DAYS_PER_QUERY,
  settingsQuery,
  siteDayHoursQuery,
  siteDayQuery,
  type AccountCpuData,
  type AccountUsageData,
  type SettingsData,
  type SiteDayData,
  type SiteDayHoursData,
} from "./cloudflare/queries";
import { purgeIpsBefore, saveAccountDays, saveCpuDays, saveDatasetAvailability, saveSiteDay, storedCpuDays, storedDays } from "./db/statistics";
import { parseCpu } from "./logic/cpu";
import { BACKFILL_DAYS, gapDays, ipCutoffDay, missingDays, previousUtcDay, utcDay, workerDays } from "./logic/days";
import { parseSettings, settingsVariables } from "./logic/discovery";
import { hoursVariables, parseSiteDay, siteDayVariables, topIpsOf, type SiteConfig } from "./logic/traffic";
import { parseAccountUsage } from "./logic/usage";

/**
 * Site-days recovered per run besides yesterday: 3 subrequests each (2 queries + 1 D1 batch). Lowered from 8
 * to 7 by spec 004, whose CPU query and write add 2 subrequests per account.
 */
export const GAP_SITE_DAYS_PER_RUN = 7;

/**
 * CPU days to read for one account (spec 004, R6): yesterday plus the oldest missing days of the last 29, at most
 * `CPU_DAYS_PER_QUERY` in all. The oldest go first because they are the first to leave Cloudflare's precise
 * window (P11); the first run fills 14 days, the next ones the rest, then only yesterday.
 */
export function cpuDaysToRead(stored: string[], now: Date): string[] {
  const yesterday = previousUtcDay(now);
  const missing = workerDays(missingDays(stored, now), now).filter((day) => day !== yesterday);
  return [...missing.slice(0, CPU_DAYS_PER_QUERY - 1), yesterday].sort();
}

const DAY_MS = 86_400_000;

interface Account {
  id: string;
  name: string;
  accountId: string;
}

export interface DailyTaskConfig {
  accounts: Account[];
  sites: SiteConfig[];
}

export interface DailyTaskSummary {
  day: string;
  discovery: "ok" | "failed";
  accountsStored: string[];
  accountsFailed: string[];
  /** Spec 004: CPU days stored per account id, e.g. `boraei:2026-11-24`. */
  cpuDaysStored: string[];
  cpuFailed: string[];
  siteDaysStored: string[];
  siteDaysFailed: string[];
  gapsLeft: number;
  ipsPurged: number | null;
}

const defaultConfig: DailyTaskConfig = { accounts: sitesJson.accounts, sites: sitesJson.sites as SiteConfig[] };

async function storeSiteDay(env: Env, site: SiteConfig, day: string, fetchFn: typeof fetch): Promise<void> {
  const token = env.CLOUDFLARE_ANALYTICS_TOKEN;
  const data = await graphql<SiteDayData>(token, siteDayQuery(!!site.host), siteDayVariables(site, day), fetchFn);
  const top = topIpsOf(data);
  // The hours query is skipped when there are no IPs to look up.
  const hours =
    top.traffic.length || top.security.length
      ? await graphql<SiteDayHoursData>(token, siteDayHoursQuery(!!site.host), hoursVariables(site, day, top), fetchFn)
      : null;
  await saveSiteDay(env.STATS_DB, parseSiteDay(site, day, data, hours));
}

export async function runDailyTask(
  env: Env,
  now: Date,
  fetchFn: typeof fetch = fetch,
  config: DailyTaskConfig = defaultConfig,
): Promise<DailyTaskSummary> {
  const token = env.CLOUDFLARE_ANALYTICS_TOKEN;
  const db = env.STATS_DB;
  const yesterday = previousUtcDay(now);
  const windowStart = utcDay(new Date(Date.parse(`${utcDay(now)}T00:00:00Z`) - BACKFILL_DAYS * DAY_MS));
  const summary: DailyTaskSummary = {
    day: yesterday,
    discovery: "ok",
    accountsStored: [],
    accountsFailed: [],
    cpuDaysStored: [],
    cpuFailed: [],
    siteDaysStored: [],
    siteDaysFailed: [],
    gapsLeft: 0,
    ipsPurged: null,
  };

  // R41: dataset availability (1 query + 1 D1 batch).
  try {
    const accountIds = config.accounts.map((a) => a.accountId);
    const zoneTags = config.sites.map((s) => s.zoneTag);
    const settings = await graphql<SettingsData>(
      token,
      settingsQuery(accountIds.length, zoneTags.length),
      settingsVariables(accountIds, zoneTags),
      fetchFn,
    );
    await saveDatasetAvailability(db, parseSettings(settings, accountIds, zoneTags), now);
  } catch (error) {
    summary.discovery = "failed";
    console.error("discovery failed", describeError(error));
  }

  const stored = await storedDays(db, windowStart);
  const cpuStored = await storedCpuDays(db, windowStart);

  // R28, R31: each account in one query (up to 31 days) and one D1 batch; a failure does not stop the rest (R33).
  for (const account of config.accounts) {
    const id = account.accountId;
    const gaps = gapDays(stored.accounts.days[id] ?? [], stored.accounts.first[id] ?? null, now);
    const days = [...new Set([...gaps, yesterday])].sort();
    try {
      const query = accountUsageQuery(workerDays(days, now));
      const data = await graphql<AccountUsageData>(token, query, { tag: id, from: days[0], to: yesterday }, fetchFn);
      const parsed = parseAccountUsage(data, days);
      await saveAccountDays(db, id, parsed.days, now);
      summary.accountsStored.push(account.id);
    } catch (error) {
      summary.accountsFailed.push(account.id);
      console.error("account usage failed", { account: account.id, error: describeError(error) });
    }
    // Spec 004 R3, R6: CPU in its own query, so a failure never touches the usage (R33 of spec 001).
    try {
      const cpuDays = cpuDaysToRead(cpuStored[id] ?? [], now);
      const data = await graphql<AccountCpuData>(token, accountCpuQuery(cpuDays), { tag: id }, fetchFn);
      const cpu = parseCpu(data, cpuDays);
      await saveCpuDays(db, id, cpu, now);
      summary.cpuDaysStored.push(...Object.keys(cpu).map((day) => `${account.id}:${day}`));
    } catch (error) {
      summary.cpuFailed.push(account.id);
      console.error("workers cpu failed", { account: account.id, error: describeError(error) });
    }
  }

  // R28: yesterday for every site; then R31: older gaps, oldest first, up to the cap.
  const work: { site: SiteConfig; day: string }[] = config.sites.map((site) => ({ site, day: yesterday }));
  const gaps = config.sites
    .flatMap((site) =>
      gapDays(stored.sites.days[site.id] ?? [], stored.sites.first[site.id] ?? null, now)
        .filter((day) => day !== yesterday)
        .map((day) => ({ site, day })),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.site.id.localeCompare(b.site.id));
  work.push(...gaps.slice(0, GAP_SITE_DAYS_PER_RUN));
  summary.gapsLeft = Math.max(0, gaps.length - GAP_SITE_DAYS_PER_RUN);

  for (const { site, day } of work) {
    try {
      await storeSiteDay(env, site, day, fetchFn);
      summary.siteDaysStored.push(`${site.id}:${day}`);
    } catch (error) {
      summary.siteDaysFailed.push(`${site.id}:${day}`);
      console.error("site traffic failed", { site: site.id, day, error: describeError(error) });
    }
  }

  // R32: IPs older than 13 months.
  try {
    summary.ipsPurged = await purgeIpsBefore(db, ipCutoffDay(now));
  } catch (error) {
    console.error("IP purge failed", describeError(error));
  }

  console.log("daily task", summary);
  return summary;
}
