// GraphQL queries (sources confirmed by the T3 discovery, docs/DATA_MODEL.md "GraphQL sources").

const DAY_MS = 86_400_000;

/** Days written into a query are always `YYYY-MM-DD` built by the app; anything else is refused. */
function checkedDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid day: ${day}`);
  return day;
}

/** Name of the part of a query that reads one day, e.g. `w20261031` for Worker requests. */
export function dayAlias(prefix: "w" | "v", day: string): string {
  return `${prefix}${checkedDay(day).replaceAll("-", "")}`;
}

/**
 * Plan usage of one account for a range of UTC days (at most 32 days per query). One subrequest per
 * account covers the whole window plus today. Worker requests are read one day per part of the query:
 * a range reaching a day about 30 days old is sampled coarsely as a whole, a single day is not (P11, R43).
 */
export function accountUsageQuery(workerDays: string[]): string {
  const workers = workerDays
    .map((day) => `${dayAlias("w", day)}: workersInvocationsAdaptive(limit: 1, filter: { date_geq: "${day}", date_leq: "${day}" }) { sum { requests } }`)
    .join("\n      ");
  return `query AccountUsage($tag: string!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $tag }) {
      ${workers}
      d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { rowsRead rowsWritten }
        dimensions { date }
      }
      d1Storage: d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        max { databaseSizeBytes }
        dimensions { date databaseId }
      }
      r2Ops: r2OperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date actionType }
      }
      r2Storage: r2StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        max { payloadSize metadataSize }
        dimensions { date bucketName }
      }
    }
  }
}`;
}

export interface AccountUsageData {
  viewer: {
    accounts: ({
      d1: { sum: { rowsRead: number; rowsWritten: number }; dimensions: { date: string } }[];
      d1Storage: { max: { databaseSizeBytes: number }; dimensions: { date: string; databaseId: string } }[];
      r2Ops: { sum: { requests: number }; dimensions: { date: string; actionType: string } }[];
      r2Storage: { max: { payloadSize: number; metadataSize: number }; dimensions: { date: string; bucketName: string } }[];
    } & { [alias: `w${number}`]: { sum: { requests: number } }[] | undefined })[];
  };
}

/** Base filter of every traffic query: real visitors only, and the site's hostname when it has one. */
function trafficFilter(withHost: boolean, extra = ""): string {
  return `{ datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball"${withHost ? ", clientRequestHTTPHost: $host" : ""}${extra} }`;
}

/**
 * Traffic of one site for one UTC day: totals, page views (whole zone), countries, top IPs by traffic
 * and security groups by IP and action. `withHost` adds the hostname filter (MOHAMED-BORAEI).
 */
export function siteDayQuery(withHost: boolean): string {
  const filter = trafficFilter(withHost);
  return `query SiteDay($tag: string!, $day: Date!, $start: Time!, $end: Time!${withHost ? ", $host: string!" : ""}) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      totals: httpRequestsAdaptiveGroups(limit: 1, filter: ${filter}) {
        count
        sum { visits edgeResponseBytes }
      }
      pages: httpRequests1dGroups(limit: 1, filter: { date: $day }) {
        sum { pageViews }
      }
      countries: httpRequestsAdaptiveGroups(limit: 300, filter: ${filter}, orderBy: [count_DESC]) {
        count
        dimensions { clientCountryName }
      }
      topIps: httpRequestsAdaptiveGroups(limit: 20, filter: ${filter}, orderBy: [count_DESC]) {
        count
        dimensions { clientIP clientCountryName }
      }
      security: httpRequestsAdaptiveGroups(limit: 200, filter: ${trafficFilter(withHost, ', securityAction_neq: "unknown"')}, orderBy: [count_DESC]) {
        count
        dimensions { clientIP clientCountryName securityAction }
      }
    }
  }
}`;
}

/**
 * Visits of one site, one part of the query per UTC day: a single range of many days is sampled coarsely
 * (measured 2026-11-02), one day per part gives the same figures as one query per day (R35).
 */
export function siteVisitsQuery(days: string[], withHost: boolean): string {
  const parts = days.map((day) => {
    const end = new Date(Date.parse(`${checkedDay(day)}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
    const filter = `{ datetime_geq: "${day}T00:00:00Z", datetime_lt: "${end}T00:00:00Z", requestSource: "eyeball"${withHost ? ", clientRequestHTTPHost: $host" : ""} }`;
    return `${dayAlias("v", day)}: httpRequestsAdaptiveGroups(limit: 1, filter: ${filter}) { sum { visits } }`;
  });
  return `query SiteVisits($tag: string!${withHost ? ", $host: string!" : ""}) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      ${parts.join("\n      ")}
    }
  }
}`;
}

export interface SiteVisitsData {
  viewer: { zones: { [alias: `v${number}`]: { sum: { visits: number } }[] | undefined }[] };
}

/** Hours in which the top IPs were seen that day, to show the last one (P5). */
export function siteDayHoursQuery(withHost: boolean): string {
  return `query SiteDayHours($tag: string!, $start: Time!, $end: Time!, $trafficIps: [string!]!, $securityIps: [string!]!${withHost ? ", $host: string!" : ""}) {
  viewer {
    zones(filter: { zoneTag: $tag }) {
      trafficHours: httpRequestsAdaptiveGroups(limit: 1000, filter: ${trafficFilter(withHost, ", clientIP_in: $trafficIps")}) {
        dimensions { clientIP datetimeHour }
      }
      securityHours: httpRequestsAdaptiveGroups(limit: 1000, filter: ${trafficFilter(withHost, ', securityAction_neq: "unknown", clientIP_in: $securityIps')}) {
        dimensions { clientIP datetimeHour }
      }
    }
  }
}`;
}

export interface SiteDayData {
  viewer: {
    zones: {
      totals: { count: number; sum: { visits: number; edgeResponseBytes: number } }[];
      pages: { sum: { pageViews: number } }[];
      countries: { count: number; dimensions: { clientCountryName: string } }[];
      topIps: { count: number; dimensions: { clientIP: string; clientCountryName: string } }[];
      security: { count: number; dimensions: { clientIP: string; clientCountryName: string; securityAction: string } }[];
    }[];
  };
}

export interface SiteDayHoursData {
  viewer: {
    zones: {
      trafficHours: { dimensions: { clientIP: string; datetimeHour: string } }[];
      securityHours: { dimensions: { clientIP: string; datetimeHour: string } }[];
    }[];
  };
}

const SETTINGS_FIELDS = "enabled notOlderThan maxDuration";
export const ACCOUNT_DATASETS = [
  "workersInvocationsAdaptive",
  "d1AnalyticsAdaptiveGroups",
  "d1StorageAdaptiveGroups",
  "r2OperationsAdaptiveGroups",
  "r2StorageAdaptiveGroups",
] as const;
export const ZONE_DATASETS = ["httpRequestsAdaptiveGroups", "httpRequests1dGroups"] as const;

/** Availability of the datasets for every account (a0, a1…) and zone (z0, z1…) in one subrequest (R41). */
export function settingsQuery(accountCount: number, zoneCount: number): string {
  const vars = [
    ...Array.from({ length: accountCount }, (_, i) => `$a${i}: string!`),
    ...Array.from({ length: zoneCount }, (_, i) => `$z${i}: string!`),
  ];
  const accountBlock = ACCOUNT_DATASETS.map((d) => `${d} { ${SETTINGS_FIELDS} }`).join(" ");
  const zoneBlock = ZONE_DATASETS.map((d) => `${d} { ${SETTINGS_FIELDS} }`).join(" ");
  return `query Settings(${vars.join(", ")}) {
  viewer {
    ${Array.from({ length: accountCount }, (_, i) => `a${i}: accounts(filter: { accountTag: $a${i} }) { settings { ${accountBlock} } }`).join("\n    ")}
    ${Array.from({ length: zoneCount }, (_, i) => `z${i}: zones(filter: { zoneTag: $z${i} }) { settings { ${zoneBlock} } }`).join("\n    ")}
  }
}`;
}

export type DatasetSettings = { enabled: boolean; notOlderThan: number | null; maxDuration: number | null };
export interface SettingsData {
  viewer: Record<string, { settings: Record<string, DatasetSettings | null> }[]>;
}
