// Site traffic: GraphQL zone data → SiteDay for D1, and tables ready to display (R21–R27, R29).
// Pure: "now" is always passed in; the UI only displays what this returns.
import type { SiteDayData, SiteDayHoursData } from "../cloudflare/queries";
import { TOP_IPS, type CountryCount, type IpCount, type SiteDay, type TrafficTotals } from "../db/statistics";
import { ectHourRange, isPartialDay, utcDay } from "./days";

const DAY_MS = 86_400_000;

export interface SiteConfig {
  id: string;
  name: string;
  accountId: string;
  zone: string;
  zoneTag: string;
  /** Count only this hostname (e.g. www.mohamedboraei.com, whose apex only redirects). */
  host?: string;
}

export const TEXT_DAY_NOTE = "Cada día va de 19:00 a 19:00 ECT.";
export const TEXT_PARTIAL = "Hoy (parcial)";
export const TEXT_NOT_ON_FREE = "Cloudflare no entrega este dato en el plan gratuito.";
const ACTION_TEXT = { block: "Bloqueada", challenge: "Desafiada" } as const;

type SecurityKind = keyof typeof ACTION_TEXT;

/** Maps Cloudflare's securityAction to the two kinds shown (R26); log, skip, allow… are not events. */
export function securityKind(action: string): SecurityKind | null {
  if (action === "block") return "block";
  if (/challenge/i.test(action)) return "challenge";
  return null;
}

/** Variables shared by both site queries for one UTC day. */
export function siteDayVariables(site: SiteConfig, day: string): Record<string, string> {
  const start = `${day}T00:00:00Z`;
  const end = new Date(Date.parse(start) + DAY_MS).toISOString().replace(".000Z", "Z");
  return { tag: site.zoneTag, day, start, end, ...(site.host ? { host: site.host } : {}) };
}

interface TopIps {
  traffic: { ip: string; country: string | null; requests: number }[];
  security: { ip: string; country: string | null; requests: number; action: SecurityKind }[];
}

const byRequests = (a: { ip: string; requests: number }, b: { ip: string; requests: number }) =>
  b.requests - a.requests || a.ip.localeCompare(b.ip);

/** Top 20 IPs by traffic and by security events, before their hours are known. */
export function topIpsOf(data: SiteDayData): TopIps {
  const zone = data.viewer.zones[0];
  const traffic = (zone?.topIps ?? [])
    .map((g) => ({ ip: g.dimensions.clientIP, country: g.dimensions.clientCountryName || null, requests: g.count }))
    .sort(byRequests)
    .slice(0, TOP_IPS);

  // One IP can be blocked and challenged the same day: events are added, the most frequent action is shown.
  const perIp = new Map<string, { country: string | null; events: Record<SecurityKind, number> }>();
  for (const g of zone?.security ?? []) {
    const kind = securityKind(g.dimensions.securityAction);
    if (!kind) continue;
    const entry = perIp.get(g.dimensions.clientIP) ?? { country: g.dimensions.clientCountryName || null, events: { block: 0, challenge: 0 } };
    entry.events[kind] += g.count;
    perIp.set(g.dimensions.clientIP, entry);
  }
  const security = [...perIp]
    .map(([ip, { country, events }]) => ({
      ip,
      country,
      requests: events.block + events.challenge,
      action: (events.block >= events.challenge ? "block" : "challenge") as SecurityKind,
    }))
    .sort(byRequests)
    .slice(0, TOP_IPS);

  return { traffic, security };
}

/** Variables of the hours query for the top IPs found by `topIpsOf`. */
export function hoursVariables(site: SiteConfig, day: string, top: TopIps): Record<string, unknown> {
  return { ...siteDayVariables(site, day), trafficIps: top.traffic.map((t) => t.ip), securityIps: top.security.map((s) => s.ip) };
}

function lastHours(rows: { dimensions: { clientIP: string; datetimeHour: string } }[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const { dimensions: d } of rows) {
    const seen = last.get(d.clientIP);
    if (!seen || Date.parse(d.datetimeHour) > Date.parse(seen)) last.set(d.clientIP, d.datetimeHour);
  }
  return last;
}

/** Builds the SiteDay stored in D1 from both responses (R21, R24–R26, R29). */
export function parseSiteDay(site: SiteConfig, day: string, data: SiteDayData, hours: SiteDayHoursData | null): SiteDay {
  const zone = data.viewer.zones[0];
  const totals = zone?.totals[0];
  const traffic: TrafficTotals = {
    requests: totals?.count ?? 0,
    visits: totals?.sum.visits ?? 0,
    pageViews: zone?.pages[0]?.sum.pageViews ?? null,
    bytes: totals?.sum.edgeResponseBytes ?? 0,
  };

  const countryTotals = new Map<string, number>();
  for (const g of zone?.countries ?? []) {
    const country = g.dimensions.clientCountryName || "XX";
    countryTotals.set(country, (countryTotals.get(country) ?? 0) + g.count);
  }
  const countries: CountryCount[] = [...countryTotals].map(([country, requests]) => ({ country, requests }));

  const top = topIpsOf(data);
  const hoursZone = hours?.viewer.zones[0];
  const trafficLast = lastHours(hoursZone?.trafficHours ?? []);
  const securityLast = lastHours(hoursZone?.securityHours ?? []);
  const ips: IpCount[] = [
    ...top.traffic.map((t): IpCount => ({ kind: "traffic", ...t, lastSeenHour: trafficLast.get(t.ip) ?? null })),
    ...top.security.map((s): IpCount => ({ kind: "security", ...s, lastSeenHour: securityLast.get(s.ip) ?? null })),
  ];

  return { day, siteId: site.id, traffic, countries, ips };
}

export interface CountryShare extends CountryCount {
  /** Share of the day's requests, one decimal. */
  percent: number;
}

/** Countries of a day with their share of the total, largest first (R24). */
export function countryShares(countries: CountryCount[]): CountryShare[] {
  const total = countries.reduce((sum, c) => sum + c.requests, 0);
  return [...countries]
    .sort((a, b) => b.requests - a.requests || a.country.localeCompare(b.country))
    .map((c) => ({ ...c, percent: total ? Math.round((c.requests / total) * 1000) / 10 : 0 }));
}

export interface TrafficRow {
  day: string;
  label: string;
  partial: boolean;
  /** null when the day is not stored (still to be filled in by the daily task). */
  totals: TrafficTotals | null;
}

export interface TrafficTable {
  note: string;
  rows: TrafficRow[];
}

const dayFormat = new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** The last 30 days, newest first; today is labeled "Hoy (parcial)" (R21–R23). */
export function trafficTable(days: Record<string, TrafficTotals>, now: Date, length = 30): TrafficTable {
  const today = utcDay(now);
  const rows = Array.from({ length }, (_, back): TrafficRow => {
    const day = utcDay(new Date(Date.parse(`${today}T00:00:00Z`) - back * DAY_MS));
    const partial = isPartialDay(day, now);
    return {
      day,
      label: partial ? TEXT_PARTIAL : dayFormat.format(new Date(`${day}T00:00:00Z`)),
      partial,
      totals: days[day] ?? null,
    };
  });
  return { note: TEXT_DAY_NOTE, rows };
}

export interface IpRow {
  ip: string;
  country: string | null;
  requests: number;
  actionText: string | null;
  lastSeen: string | null;
}

/** IP rows ready to display for one kind, largest first (R25, R26). */
export function ipRows(ips: IpCount[], kind: IpCount["kind"]): IpRow[] {
  return ips
    .filter((ip) => ip.kind === kind)
    .sort(byRequests)
    .map((ip) => ({
      ip: ip.ip,
      country: ip.country,
      requests: ip.requests,
      actionText: ip.kind === "security" ? ACTION_TEXT[ip.action] : null,
      lastSeen: ip.lastSeenHour ? ectHourRange(ip.lastSeenHour) : null,
    }));
}

/** R27: the notice shown instead of a table when the discovery says the dataset is disabled. */
export function datasetNotice(enabled: boolean | undefined): string | null {
  // Unknown (no discovery stored yet) is treated as available: the query itself reports errors.
  return enabled === false ? TEXT_NOT_ON_FREE : null;
}
