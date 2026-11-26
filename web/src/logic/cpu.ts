// Workers CPU per request (spec 004): parse the `c<day>` and `x<day>` parts of the account CPU query into one
// figure per script and day. Pure: the daily task and the routes only store or show what this returns.
import { dayAlias, type AccountCpuData, type CpuPartRow, type StatusPartRow } from "../cloudflare/queries";
import type { ScriptCpu } from "../db/statistics";
import { chartDays } from "./days";
import { dayPoints, type DayPoint } from "./series";
import type { SiteConfig } from "./traffic";

/** Status of the invocations Cloudflare cut for exceeding resources (discovery of 2026-11-24). */
export const EXCEEDED_STATUS = "exceededResources";
/** Script name Cloudflare gives to invocations it did not attribute to a script. */
export const UNKNOWN_SCRIPT = "__unknown__";
export const TEXT_UNKNOWN_SCRIPT = "Sin script";

/** Figures of a site for one day (R15): the highest p50 and p99 among its scripts and the sum of requests cut. */
export interface SiteCpuDay {
  cpuP50Ms: number | null;
  cpuP99Ms: number | null;
  exceededResources: number;
}

/** Name shown for a script: `__unknown__` reads "Sin script" (R12). */
export function scriptLabel(script: string): string {
  return script === UNKNOWN_SCRIPT ? TEXT_UNKNOWN_SCRIPT : script;
}

const highest = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? Math.max(...known) : null;
};

/**
 * CPU of a site for one day, from its account's days (R9, R15, R21). Only the scripts listed for the site count,
 * so staging scripts and other sites' scripts never reach its page. A day never processed is null ("Sin dato");
 * a processed day where the site's scripts ran nothing has no quantiles and 0 requests cut.
 */
export function siteCpuDay(site: Pick<SiteConfig, "scripts">, accountDays: Record<string, ScriptCpu[]>, day: string): SiteCpuDay | null {
  const scripts = accountDays[day];
  if (!scripts) return null;
  const own = scripts.filter((s) => site.scripts.includes(s.script));
  return {
    cpuP50Ms: highest(own.map((s) => s.cpuP50Ms)),
    cpuP99Ms: highest(own.map((s) => s.cpuP99Ms)),
    exceededResources: own.reduce((sum, s) => sum + s.exceededResources, 0),
  };
}

/** Microseconds from Cloudflare to milliseconds, keeping the decimals; no figure stays null (R4). */
export function usToMs(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value / 1000 : null;
}

const scriptOf = (name: string | null | undefined) => name || UNKNOWN_SCRIPT;

/**
 * CPU of every script for each requested day (R1–R5). A day is returned only when both of its parts came back,
 * so a day Cloudflare did not answer is never stored as processed. A script seen only among the cut
 * invocations (as `__unknown__`) gets its counts and no quantiles.
 */
export function parseCpu(data: AccountCpuData, days: string[]): Record<string, ScriptCpu[]> {
  const account = (data.viewer.accounts[0] ?? {}) as Record<string, unknown>;
  const out: Record<string, ScriptCpu[]> = {};

  for (const day of days) {
    const cpuRows = account[dayAlias("c", day)] as CpuPartRow[] | undefined | null;
    const statusRows = account[dayAlias("x", day)] as StatusPartRow[] | undefined | null;
    if (!Array.isArray(cpuRows) || !Array.isArray(statusRows)) continue;

    const scripts = new Map<string, ScriptCpu>();
    const empty = (script: string): ScriptCpu => ({
      script,
      requests: 0,
      errors: 0,
      exceededResources: 0,
      cpuP50Ms: null,
      cpuP99Ms: null,
      cpuP999Ms: null,
      wallP50Ms: null,
      wallP99Ms: null,
      sampleInterval: null,
    });

    for (const row of cpuRows) {
      const script = scriptOf(row.dimensions?.scriptName);
      const q = row.quantiles ?? ({} as CpuPartRow["quantiles"]);
      scripts.set(script, {
        ...empty(script),
        requests: row.sum?.requests ?? 0,
        errors: row.sum?.errors ?? 0,
        cpuP50Ms: usToMs(q.cpuTimeP50),
        cpuP99Ms: usToMs(q.cpuTimeP99),
        cpuP999Ms: usToMs(q.cpuTimeP999),
        wallP50Ms: usToMs(q.wallTimeP50),
        wallP99Ms: usToMs(q.wallTimeP99),
        sampleInterval: typeof row.avg?.sampleInterval === "number" ? row.avg.sampleInterval : null,
      });
    }

    for (const row of statusRows) {
      if (row.dimensions?.status !== EXCEEDED_STATUS) continue;
      const script = scriptOf(row.dimensions.scriptName);
      const entry = scripts.get(script) ?? empty(script);
      entry.exceededResources += row.sum?.requests ?? 0;
      // A script missing from the CPU part still counts its cut invocations as requests.
      if (!scripts.has(script)) entry.requests = entry.exceededResources;
      scripts.set(script, entry);
    }

    out[day] = [...scripts.values()].sort((a, b) => a.script.localeCompare(b.script));
  }
  return out;
}

/** Daily series of one script of an account, for the "Consumo de planes" cards (R10–R12). */
export interface ScriptCpuSeries {
  script: string;
  label: string;
  p50: DayPoint[];
  p99: DayPoint[];
  cut: DayPoint[];
}

/**
 * One series per script of an account over the chart days, staging and `__unknown__` included (R10–R12, R21).
 * A day never processed is a gap in every series; a processed day where the script ran nothing has no quantiles
 * and 0 requests cut.
 */
export function accountCpuSeries(accountDays: Record<string, ScriptCpu[]>, now: Date): ScriptCpuSeries[] {
  const days = chartDays(now).filter((day) => accountDays[day]);
  const names = [...new Set(days.flatMap((day) => accountDays[day]!.map((s) => s.script)))].sort((a, b) => a.localeCompare(b));
  return names.map((script) => {
    const values = (pick: (s: ScriptCpu | undefined) => number | null) =>
      Object.fromEntries(days.map((day) => [day, pick(accountDays[day]!.find((s) => s.script === script))]));
    return {
      script,
      label: scriptLabel(script),
      p50: dayPoints(values((s) => s?.cpuP50Ms ?? null), now),
      p99: dayPoints(values((s) => s?.cpuP99Ms ?? null), now),
      cut: dayPoints(values((s) => s?.exceededResources ?? 0), now),
    };
  });
}

/** A site's CPU for every chart day, keyed by day (R9, R15, R21). */
export function siteCpuDays(site: Pick<SiteConfig, "scripts">, accountDays: Record<string, ScriptCpu[]>, now: Date): Record<string, SiteCpuDay | null> {
  return Object.fromEntries(chartDays(now).map((day) => [day, siteCpuDay(site, accountDays, day)]));
}
