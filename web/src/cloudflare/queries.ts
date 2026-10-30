// GraphQL queries (sources confirmed by the T3 discovery, docs/DATA_MODEL.md "GraphQL sources").

/**
 * Plan usage of one account for a range of UTC days (at most 32 days per query). One subrequest per
 * account covers the whole backfill window plus today.
 */
export const ACCOUNT_USAGE_QUERY = `query AccountUsage($tag: string!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $tag }) {
      workers: workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date }
      }
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

export interface AccountUsageData {
  viewer: {
    accounts: {
      workers: { sum: { requests: number }; dimensions: { date: string } }[];
      d1: { sum: { rowsRead: number; rowsWritten: number }; dimensions: { date: string } }[];
      d1Storage: { max: { databaseSizeBytes: number }; dimensions: { date: string; databaseId: string } }[];
      r2Ops: { sum: { requests: number }; dimensions: { date: string; actionType: string } }[];
      r2Storage: { max: { payloadSize: number; metadataSize: number }; dimensions: { date: string; bucketName: string } }[];
    }[];
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
