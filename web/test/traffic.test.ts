import { describe, expect, it } from "vitest";
import sitesJson from "../config/sites.json";
import { siteDayHoursQuery, siteDayQuery, type SiteDayData, type SiteDayHoursData } from "../src/cloudflare/queries";
import type { IpCount } from "../src/db/statistics";
import {
  countryShares,
  datasetNotice,
  hoursVariables,
  ipRows,
  parseSiteDay,
  securityKind,
  siteDayVariables,
  TEXT_DAY_NOTE,
  TEXT_NOT_ON_FREE,
  TEXT_PARTIAL,
  topIpsOf,
  trafficTable,
  type SiteConfig,
} from "../src/logic/traffic";
import dayFixture from "./fixtures/site-day.json";
import hoursFixture from "./fixtures/site-day-hours.json";

const sites = sitesJson.sites as SiteConfig[];
const soma = sites.find((s) => s.id === "soma")!;
const mohamed = sites.find((s) => s.id === "mohamed-boraei")!;
const data = dayFixture as SiteDayData;
const hours = hoursFixture as SiteDayHoursData;
const DAY = "2026-10-28";

describe("config/sites.json", () => {
  it("has the 3 sites with a zone ID, and only MOHAMED-BORAEI filters by host", () => {
    expect(sites.map((s) => s.id)).toEqual(["soma", "boraei", "mohamed-boraei"]);
    expect(sites.every((s) => /^[0-9a-f]{32}$/.test(s.zoneTag))).toBe(true);
    expect(sites.filter((s) => s.host).map((s) => s.host)).toEqual(["www.mohamedboraei.com"]);
  });

  it("has the 3 accounts, COBTEC included", () => {
    expect(sitesJson.accounts.map((a) => a.id)).toEqual(["cobtec", "soma", "boraei"]);
  });
});

describe("site queries", () => {
  it("filter by real visitors and add the host filter only when the site has one", () => {
    expect(siteDayQuery(false)).toContain('requestSource: "eyeball"');
    expect(siteDayQuery(false)).not.toContain("clientRequestHTTPHost");
    expect(siteDayQuery(true)).toContain("clientRequestHTTPHost: $host");
    expect(siteDayHoursQuery(true)).toContain("clientRequestHTTPHost: $host");
  });

  it("cover exactly one UTC day", () => {
    expect(siteDayVariables(soma, DAY)).toEqual({ tag: soma.zoneTag, day: DAY, start: "2026-10-28T00:00:00Z", end: "2026-10-29T00:00:00Z" });
    expect(siteDayVariables(mohamed, DAY).host).toBe("www.mohamedboraei.com");
  });

  it("ask the hours only for the top IPs", () => {
    const vars = hoursVariables(soma, DAY, topIpsOf(data));
    expect(vars.trafficIps).toEqual(["192.0.2.10", "192.0.2.11", "192.0.2.20"]);
    expect(vars.securityIps).toEqual(["198.51.100.1", "198.51.100.2"]);
  });
});

describe("R21 R24 R25 R26 parseSiteDay", () => {
  const site = parseSiteDay(soma, DAY, data, hours);

  it("takes requests, visits and bytes of real visitors, and page views of the zone", () => {
    expect(site.traffic).toEqual({ requests: 1561, visits: 105, pageViews: 127, bytes: 6012356 });
  });

  it("keeps countries, with an unknown country as XX", () => {
    expect(site.countries).toContainEqual({ country: "XX", requests: 1 });
    expect(site.countries).toHaveLength(4);
  });

  it("R25 top traffic IPs with the last hour seen", () => {
    const traffic = site.ips.filter((ip) => ip.kind === "traffic");
    expect(traffic.map((ip) => [ip.ip, ip.requests, ip.lastSeenHour])).toEqual([
      ["192.0.2.10", 400, "2026-10-28T19:00:00Z"],
      ["192.0.2.11", 250, null],
      ["192.0.2.20", 250, "2026-10-28T23:00:00Z"],
    ]);
  });

  it("R26 adds the events of an IP with several actions and shows the most frequent", () => {
    const security = site.ips.filter((ip) => ip.kind === "security");
    expect(security).toEqual([
      { kind: "security", ip: "198.51.100.1", country: "HK", requests: 9, action: "block", lastSeenHour: "2026-10-28T04:00:00Z" },
      { kind: "security", ip: "198.51.100.2", country: "US", requests: 7, action: "challenge", lastSeenHour: "2026-10-28T05:00:00Z" },
    ]);
  });

  it("R26 does not count log or skip as security events", () => {
    expect(site.ips.some((ip) => ip.ip === "198.51.100.3")).toBe(false);
    expect(securityKind("log")).toBeNull();
    expect(securityKind("jschallenge")).toBe("challenge");
  });

  it("works for a day without traffic", () => {
    const empty = { viewer: { zones: [{ totals: [], pages: [], countries: [], topIps: [], security: [] }] } };
    expect(parseSiteDay(soma, DAY, empty, null)).toEqual({
      day: DAY,
      siteId: "soma",
      traffic: { requests: 0, visits: 0, pageViews: null, bytes: 0 },
      countries: [],
      ips: [],
    });
  });

  it("R29 keeps at most 20 IPs per kind", () => {
    const many = structuredClone(data);
    const zone = many.viewer.zones[0]!;
    zone.topIps = Array.from({ length: 25 }, (_, i) => ({ count: i + 1, dimensions: { clientIP: `192.0.2.${i + 1}`, clientCountryName: "EC" } }));
    zone.security = Array.from({ length: 25 }, (_, i) => ({
      count: i + 1,
      dimensions: { clientIP: `198.51.100.${i + 1}`, clientCountryName: "EC", securityAction: "block" },
    }));
    const top = topIpsOf(many);
    expect(top.traffic).toHaveLength(20);
    expect(top.security).toHaveLength(20);
  });
});

describe("R24 country shares", () => {
  it("orders countries and computes the share of the day", () => {
    const shares = countryShares(parseSiteDay(soma, DAY, data, hours).countries);
    expect(shares.map((s) => [s.country, s.percent])).toEqual([
      ["US", 75],
      ["EC", 19.2],
      ["SG", 5.8],
      ["XX", 0.1],
    ]);
    expect(Math.abs(shares.reduce((sum, s) => sum + s.percent, 0) - 100)).toBeLessThan(0.5);
  });

  it("returns 0 % when there is no traffic", () => {
    expect(countryShares([{ country: "EC", requests: 0 }])).toEqual([{ country: "EC", requests: 0, percent: 0 }]);
  });
});

describe("R21 R22 R23 daily table", () => {
  const now = new Date("2026-10-29T17:00:00Z");
  const table = trafficTable({ "2026-10-28": { requests: 1561, visits: 105, pageViews: 127, bytes: 6012356 } }, now);

  it("has the last 30 days, newest first, with the day note", () => {
    expect(table.note).toBe(TEXT_DAY_NOTE);
    expect(table.rows).toHaveLength(30);
    expect(table.rows[0]?.day).toBe("2026-10-29");
    expect(table.rows[29]?.day).toBe("2026-09-30");
  });

  it("labels today 'Hoy (parcial)' and other days in es-EC format", () => {
    expect(table.rows[0]).toMatchObject({ label: TEXT_PARTIAL, partial: true });
    expect(table.rows[1]).toMatchObject({ day: "2026-10-28", label: "28/10/2026", partial: false, totals: { requests: 1561 } });
  });

  it("leaves days not stored yet empty", () => {
    expect(table.rows[2]?.totals).toBeNull();
  });
});

describe("R25 R26 IP rows", () => {
  const ips: IpCount[] = [
    { kind: "traffic", ip: "192.0.2.10", country: "US", requests: 400, lastSeenHour: "2026-10-28T19:00:00Z" },
    { kind: "security", ip: "198.51.100.1", country: "HK", requests: 9, action: "block", lastSeenHour: "2026-10-29T04:00:00Z" },
    { kind: "security", ip: "198.51.100.2", country: "US", requests: 7, action: "challenge", lastSeenHour: null },
  ];

  it("shows traffic IPs with the ECT hour", () => {
    expect(ipRows(ips, "traffic")).toEqual([{ ip: "192.0.2.10", country: "US", requests: 400, actionText: null, lastSeen: "14:00–15:00" }]);
  });

  it("shows security IPs with 'Bloqueada' or 'Desafiada'", () => {
    expect(ipRows(ips, "security").map((r) => [r.actionText, r.lastSeen])).toEqual([
      ["Bloqueada", "23:00–00:00"],
      ["Desafiada", null],
    ]);
  });
});

describe("R27 data not offered on Free", () => {
  it("shows the notice only when the dataset is disabled", () => {
    expect(datasetNotice(false)).toBe(TEXT_NOT_ON_FREE);
    expect(datasetNotice(true)).toBeNull();
    expect(datasetNotice(undefined)).toBeNull();
  });
});
