// Reads and writes for monitor-cbt-statistics-db. Each day of an account or a site is written in one
// batch: D1 runs it as a transaction and counts it as a single query (50 per invocation on Free).

/** IPs kept per site, per day and per kind (R29). */
export const TOP_IPS = 20;

export type Product = "workers" | "d1" | "r2";

export interface UsageMetric {
  product: Product;
  metric: string;
  value: number;
}

export interface TrafficTotals {
  requests: number;
  visits: number;
  /** Whole zone, from httpRequests1dGroups; null if not available. */
  pageViews: number | null;
  bytes: number;
}

export interface CountryCount {
  country: string;
  requests: number;
}

export type IpCount =
  | { kind: "traffic"; ip: string; country: string | null; requests: number; lastSeenHour: string | null }
  | { kind: "security"; ip: string; country: string | null; requests: number; action: "block" | "challenge"; lastSeenHour: string | null };

export interface SiteDay {
  day: string;
  siteId: string;
  traffic: TrafficTotals;
  countries: CountryCount[];
  ips: IpCount[];
}

export interface DatasetAvailability {
  scope: "zone" | "account";
  tag: string;
  dataset: string;
  enabled: boolean;
  notOlderThanS: number | null;
  maxDurationS: number | null;
}

/** Top IPs per kind by requests; ties ordered by IP so the result is stable (R29). */
export function topIps(ips: IpCount[], limit = TOP_IPS): IpCount[] {
  const byRequests = (a: IpCount, b: IpCount) => b.requests - a.requests || a.ip.localeCompare(b.ip);
  return (["traffic", "security"] as const).flatMap((kind) =>
    ips.filter((ip) => ip.kind === kind).sort(byRequests).slice(0, limit),
  );
}

/** Replaces all usage metrics of one account and day (R30). */
export function saveAccountDay(
  db: D1Database,
  day: string,
  accountId: string,
  metrics: UsageMetric[],
  fetchedAt = new Date(),
): Promise<void> {
  return saveAccountDays(db, accountId, { [day]: metrics }, fetchedAt);
}

/** Replaces the traffic, countries and top IPs of one site and day (R29, R30). */
export async function saveSiteDay(db: D1Database, site: SiteDay, fetchedAt = new Date()): Promise<void> {
  const { day, siteId, traffic } = site;
  const insertCountry = db.prepare("INSERT INTO country_daily (day, site_id, country, requests) VALUES (?, ?, ?, ?)");
  const insertIp = db.prepare(
    "INSERT INTO ip_daily (day, site_id, kind, ip, country, action, requests, last_seen_hour) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  await db.batch([
    db
      .prepare(
        `INSERT INTO traffic_daily (day, site_id, requests, visits, page_views, bytes, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, site_id) DO UPDATE SET requests = excluded.requests, visits = excluded.visits,
           page_views = excluded.page_views, bytes = excluded.bytes, fetched_at = excluded.fetched_at`,
      )
      .bind(day, siteId, traffic.requests, traffic.visits, traffic.pageViews, traffic.bytes, fetchedAt.toISOString()),
    db.prepare("DELETE FROM country_daily WHERE day = ? AND site_id = ?").bind(day, siteId),
    ...site.countries.map((c) => insertCountry.bind(day, siteId, c.country, c.requests)),
    db.prepare("DELETE FROM ip_daily WHERE day = ? AND site_id = ?").bind(day, siteId),
    ...topIps(site.ips).map((ip) =>
      insertIp.bind(day, siteId, ip.kind, ip.ip, ip.country, ip.kind === "security" ? ip.action : null, ip.requests, ip.lastSeenHour),
    ),
  ]);
}

/** Deletes the IPs of days before the cutoff (R32). Returns the number of rows deleted. */
export async function purgeIpsBefore(db: D1Database, cutoffDay: string): Promise<number> {
  const result = await db.prepare("DELETE FROM ip_daily WHERE day < ?").bind(cutoffDay).run();
  return result.meta.changes;
}

export interface StoredDays {
  /** Stored days from `fromDay` on, per site or account id. */
  days: Record<string, string[]>;
  /** First day ever stored, per site or account id (history starts there, P9). */
  first: Record<string, string>;
}

function group(rows: { id: string; day: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { id, day } of rows) (out[id] ??= []).push(day);
  return out;
}

/** Stored days of every site and account, and their first stored day, in one batch (R31). */
export async function storedDays(db: D1Database, fromDay: string): Promise<{ sites: StoredDays; accounts: StoredDays }> {
  const [siteDays, siteFirst, accountDays, accountFirst] = await db.batch<{ id: string; day: string }>([
    db.prepare("SELECT site_id AS id, day FROM traffic_daily WHERE day >= ? ORDER BY day").bind(fromDay),
    db.prepare("SELECT site_id AS id, MIN(day) AS day FROM traffic_daily GROUP BY site_id"),
    db.prepare("SELECT DISTINCT account_id AS id, day FROM usage_daily WHERE day >= ? ORDER BY day").bind(fromDay),
    db.prepare("SELECT account_id AS id, MIN(day) AS day FROM usage_daily GROUP BY account_id"),
  ]);
  const first = (rows: { id: string; day: string }[]) => Object.fromEntries(rows.map((r) => [r.id, r.day]));
  return {
    sites: { days: group(siteDays?.results ?? []), first: first(siteFirst?.results ?? []) },
    accounts: { days: group(accountDays?.results ?? []), first: first(accountFirst?.results ?? []) },
  };
}

/** Replaces several days of one account in one batch (R30). */
export async function saveAccountDays(
  db: D1Database,
  accountId: string,
  days: Record<string, UsageMetric[]>,
  fetchedAt = new Date(),
): Promise<void> {
  const at = fetchedAt.toISOString();
  const insert = db.prepare(
    "INSERT INTO usage_daily (day, account_id, product, metric, value, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const statements = Object.entries(days).flatMap(([day, metrics]) => [
    db.prepare("DELETE FROM usage_daily WHERE day = ? AND account_id = ?").bind(day, accountId),
    ...metrics.map((m) => insert.bind(day, accountId, m.product, m.metric, m.value, at)),
  ]);
  if (statements.length) await db.batch(statements);
}

/** Records which datasets the token can read and how far back (R41). */
export async function saveDatasetAvailability(db: D1Database, rows: DatasetAvailability[], checkedAt = new Date()): Promise<void> {
  if (rows.length === 0) return;
  const upsert = db.prepare(
    `INSERT INTO dataset_availability (scope, tag, dataset, enabled, not_older_than_s, max_duration_s, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (scope, tag, dataset) DO UPDATE SET enabled = excluded.enabled, not_older_than_s = excluded.not_older_than_s,
       max_duration_s = excluded.max_duration_s, checked_at = excluded.checked_at`,
  );
  const at = checkedAt.toISOString();
  await db.batch(rows.map((r) => upsert.bind(r.scope, r.tag, r.dataset, r.enabled ? 1 : 0, r.notOlderThanS, r.maxDurationS, at)));
}
