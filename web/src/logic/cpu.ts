// Workers CPU per request (spec 004): parse the `c<day>` and `x<day>` parts of the account query into one
// figure per script and day. Pure: the daily task and the routes only store or show what this returns.
import { dayAlias, type AccountUsageData, type CpuPartRow, type StatusPartRow } from "../cloudflare/queries";
import type { ScriptCpu } from "../db/statistics";

/** Status of the invocations Cloudflare cut for exceeding resources (discovery of 2026-11-24). */
export const EXCEEDED_STATUS = "exceededResources";
/** Script name Cloudflare gives to invocations it did not attribute to a script. */
export const UNKNOWN_SCRIPT = "__unknown__";

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
export function parseCpu(data: AccountUsageData, days: string[]): Record<string, ScriptCpu[]> {
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
