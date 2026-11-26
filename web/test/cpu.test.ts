import { describe, expect, it } from "vitest";
import { accountCpuQuery, accountUsageQuery, CPU_DAYS_PER_QUERY, dayAlias, type AccountCpuData } from "../src/cloudflare/queries";
import type { ScriptCpu } from "../src/db/statistics";
import { EXCEEDED_STATUS, parseCpu, scriptLabel, siteCpuDay, UNKNOWN_SCRIPT, usToMs } from "../src/logic/cpu";
import type { SiteConfig } from "../src/logic/traffic";
import sitesJson from "../config/sites.json";
import fixture from "./fixtures/account-cpu.json";

// Dummy figures shaped like the discovery of 2026-11-24 (BORAEI account); the API is never called.
const data = fixture as unknown as AccountCpuData;

describe("spec 004 R1–R3 CPU query of an account", () => {
  const query = accountCpuQuery(["2026-11-23", "2026-11-24"]);

  it("adds one CPU part and one status part per CPU day", () => {
    for (const day of ["2026-11-23", "2026-11-24"]) {
      expect(query).toContain(`${dayAlias("c", day)}: workersInvocationsAdaptive(limit: 1000, filter: { date_geq: "${day}", date_leq: "${day}" })`);
      expect(query).toContain(`${dayAlias("x", day)}: workersInvocationsAdaptive(limit: 1000, filter: { date_geq: "${day}", date_leq: "${day}" })`);
    }
  });

  it("asks for the fields confirmed by the discovery", () => {
    expect(query).toContain("sum { requests errors } quantiles { cpuTimeP50 cpuTimeP99 cpuTimeP999 wallTimeP50 wallTimeP99 } avg { sampleInterval } dimensions { scriptName }");
    expect(query).toContain("sum { requests } dimensions { scriptName status }");
  });

  it("is a query of its own: the plan usage query has no CPU part and keeps its Worker request parts", () => {
    expect(query).toMatch(/^query AccountCpu\(\$tag: string!\)/);
    const usage = accountUsageQuery(["2026-11-23"]);
    expect(usage).toContain(`${dayAlias("w", "2026-11-23")}: workersInvocationsAdaptive(limit: 1, filter: { date_geq: "2026-11-23", date_leq: "2026-11-23" }) { sum { requests } }`);
    expect(usage).not.toContain("quantiles");
    expect(usage).not.toMatch(/\b[cx]20261123:/);
  });

  it("asks for at most 14 days (28 parts), below the size Cloudflare refused", () => {
    const days = Array.from({ length: CPU_DAYS_PER_QUERY }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    expect(accountCpuQuery(days).match(/workersInvocationsAdaptive/g)).toHaveLength(28);
    expect(() => accountCpuQuery([...days, "2026-11-15"])).toThrow("At most 14 CPU days per query");
  });

  it("refuses a day that is not YYYY-MM-DD", () => {
    expect(() => accountCpuQuery(['2026-11-23" } } evil'])).toThrow("Invalid day");
  });
});

describe("spec 004 R4 microseconds to milliseconds", () => {
  it("divides by 1,000 and keeps the decimals", () => {
    expect(usToMs(69244)).toBe(69.244);
    expect(usToMs(827)).toBe(0.827);
    expect(usToMs(0)).toBe(0);
  });

  it("keeps a missing figure as null, never 0", () => {
    expect(usToMs(null)).toBeNull();
    expect(usToMs(undefined)).toBeNull();
    expect(usToMs(Number.NaN)).toBeNull();
  });
});

describe("spec 004 R1, R2, R5 parsing the CPU parts", () => {
  const parsed = parseCpu(data, ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);

  it("gives each script its requests, errors and times in ms", () => {
    expect(parsed["2026-11-23"]?.find((s) => s.script === "mohamed-boraei")).toEqual({
      script: "mohamed-boraei",
      requests: 18383,
      errors: 0,
      exceededResources: 0,
      cpuP50Ms: 1.167,
      cpuP99Ms: 69.244,
      cpuP999Ms: 123.157,
      wallP50Ms: 2.159,
      wallP99Ms: 91.87,
      sampleInterval: 1.7,
    });
  });

  it(`counts only the invocations with status ${EXCEEDED_STATUS} as cut`, () => {
    const unknown = parsed["2026-11-23"]?.find((s) => s.script === UNKNOWN_SCRIPT);
    expect(unknown).toMatchObject({ requests: 1205, errors: 103, exceededResources: 103, cpuP99Ms: 29.255 });
    expect(parsed["2026-11-23"]?.map((s) => s.script)).toEqual([UNKNOWN_SCRIPT, "mohamed-boraei"]);
  });

  it("keeps a script seen only among the cut invocations, with no quantiles, and names an empty script __unknown__", () => {
    expect(parsed["2026-11-24"]).toEqual([
      {
        script: UNKNOWN_SCRIPT,
        requests: 7,
        errors: 0,
        exceededResources: 7,
        cpuP50Ms: null,
        cpuP99Ms: null,
        cpuP999Ms: null,
        wallP50Ms: null,
        wallP99Ms: null,
        sampleInterval: null,
      },
    ]);
  });

  it("returns a day without invocations as empty, so it is stored as processed", () => {
    expect(parsed["2026-11-25"]).toEqual([]);
  });

  it("leaves out a day whose parts did not both come back, so it is read again later", () => {
    expect(parsed).not.toHaveProperty("2026-11-26");
    expect(parsed).not.toHaveProperty("2026-11-27");
  });

  it("returns nothing for an account Cloudflare did not return", () => {
    expect(parseCpu({ viewer: { accounts: [] } } as unknown as AccountCpuData, ["2026-11-23"])).toEqual({});
  });
});

describe("spec 004 R8 scripts of each site", () => {
  const scriptsOf = (id: string) => (sitesJson.sites as SiteConfig[]).find((s) => s.id === id)!.scripts;

  it("lists soma-web for SOMA, none for BORAEI, and mohamed-boraei with __unknown__ for MOHAMED-BORAEI", () => {
    expect(scriptsOf("soma")).toEqual(["soma-web"]);
    expect(scriptsOf("boraei")).toEqual([]);
    expect(scriptsOf("mohamed-boraei")).toEqual(["mohamed-boraei", UNKNOWN_SCRIPT]);
  });

  it("never lists a staging script", () => {
    expect((sitesJson.sites as SiteConfig[]).flatMap((s) => s.scripts).some((s) => s.includes("staging"))).toBe(false);
  });
});

describe("spec 004 R12 script label", () => {
  it("reads __unknown__ as Sin script and keeps every other name", () => {
    expect(scriptLabel(UNKNOWN_SCRIPT)).toBe("Sin script");
    expect(scriptLabel("soma-web")).toBe("soma-web");
  });
});

describe("spec 004 R9 R15 R21 CPU of a site for one day", () => {
  const row = (script: string, p50: number | null, p99: number | null, cut: number): ScriptCpu => ({
    script,
    requests: 100,
    errors: 0,
    exceededResources: cut,
    cpuP50Ms: p50,
    cpuP99Ms: p99,
    cpuP999Ms: null,
    wallP50Ms: null,
    wallP99Ms: null,
    sampleInterval: 1,
  });
  const days: Record<string, ScriptCpu[]> = {
    "2026-11-24": [row("dummy-site", 2.5, 40.2, 1), row("dummy-site-staging", 50, 900, 30), row(UNKNOWN_SCRIPT, 8.1, 29, 103)],
    "2026-11-23": [row("dummy-site-staging", 3, 9, 0)],
    "2026-11-22": [row(UNKNOWN_SCRIPT, null, null, 4)],
  };
  const site = { scripts: ["dummy-site", UNKNOWN_SCRIPT] };

  it("takes the highest p50 and p99 of the site's scripts and sums their requests cut", () => {
    expect(siteCpuDay(site, days, "2026-11-24")).toEqual({ cpuP50Ms: 8.1, cpuP99Ms: 40.2, exceededResources: 104 });
  });

  it("never counts a script not listed for the site, such as staging", () => {
    expect(siteCpuDay({ scripts: ["dummy-site"] }, days, "2026-11-24")).toEqual({ cpuP50Ms: 2.5, cpuP99Ms: 40.2, exceededResources: 1 });
  });

  it("gives no quantiles and 0 cut on a processed day where the site ran nothing", () => {
    expect(siteCpuDay(site, days, "2026-11-23")).toEqual({ cpuP50Ms: null, cpuP99Ms: null, exceededResources: 0 });
  });

  it("keeps the cut of a script with no quantiles", () => {
    expect(siteCpuDay(site, days, "2026-11-22")).toEqual({ cpuP50Ms: null, cpuP99Ms: null, exceededResources: 4 });
  });

  it("gives null for a day never processed, so it shows Sin dato and never a 0", () => {
    expect(siteCpuDay(site, days, "2026-11-21")).toBeNull();
  });

  it("gives nothing of the account to a site without scripts", () => {
    expect(siteCpuDay({ scripts: [] }, days, "2026-11-24")).toEqual({ cpuP50Ms: null, cpuP99Ms: null, exceededResources: 0 });
  });
});
