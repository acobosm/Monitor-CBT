// Daily task (01:00 UTC): discovery, plan usage of every account, traffic of every site for the previous
// UTC day, recovery of days that failed after the first stored day, and IP purge (R28–R33, R41).
// Budget: Workers Free allows 50 subrequests per invocation (fetch and D1 counted together here).
// A normal run uses about 20; the worst case with the full recovery cap stays below 50.
import sitesJson from "../config/sites.json";
import { describeError, graphql } from "./cloudflare/graphql";
import {
  ACCOUNT_USAGE_QUERY,
  settingsQuery,
  siteDayHoursQuery,
  siteDayQuery,
  type AccountUsageData,
  type SettingsData,
  type SiteDayData,
  type SiteDayHoursData,
} from "./cloudflare/queries";
import { purgeIpsBefore, saveAccountDays, saveDatasetAvailability, saveSiteDay, storedDays } from "./db/statistics";
import { BACKFILL_DAYS, gapDays, ipCutoffDay, previousUtcDay, utcDay } from "./logic/days";
import { parseSettings, settingsVariables } from "./logic/discovery";
import { hoursVariables, parseSiteDay, siteDayVariables, topIpsOf, type SiteConfig } from "./logic/traffic";
import { parseAccountUsage } from "./logic/usage";

/** Site-days recovered per run besides yesterday: 3 subrequests each (2 queries + 1 D1 batch). */
export const GAP_SITE_DAYS_PER_RUN = 8;

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

  // R28, R31: each account in one query (up to 31 days) and one D1 batch; a failure does not stop the rest (R33).
  for (const account of config.accounts) {
    const id = account.accountId;
    const gaps = gapDays(stored.accounts.days[id] ?? [], stored.accounts.first[id] ?? null, now);
    const days = [...new Set([...gaps, yesterday])].sort();
    try {
      const data = await graphql<AccountUsageData>(token, ACCOUNT_USAGE_QUERY, { tag: id, from: days[0], to: yesterday }, fetchFn);
      const parsed = parseAccountUsage(data, days);
      await saveAccountDays(db, id, parsed.days, now);
      summary.accountsStored.push(account.id);
    } catch (error) {
      summary.accountsFailed.push(account.id);
      console.error("account usage failed", { account: account.id, error: describeError(error) });
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
