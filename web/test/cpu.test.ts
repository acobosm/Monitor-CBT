import { describe, expect, it } from "vitest";
import { accountUsageQuery, dayAlias, type AccountUsageData } from "../src/cloudflare/queries";
import { EXCEEDED_STATUS, parseCpu, UNKNOWN_SCRIPT, usToMs } from "../src/logic/cpu";
import fixture from "./fixtures/account-cpu.json";

// Dummy figures shaped like the discovery of 2026-11-24 (BORAEI account); the API is never called.
const data = fixture as unknown as AccountUsageData;

describe("spec 004 R1–R3 CPU parts of the account query", () => {
  const query = accountUsageQuery(["2026-11-23"], ["2026-11-23", "2026-11-24"]);

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

  it("keeps the Worker request parts as they were, and adds no CPU part without CPU days", () => {
    expect(query).toContain(`${dayAlias("w", "2026-11-23")}: workersInvocationsAdaptive(limit: 1, filter: { date_geq: "2026-11-23", date_leq: "2026-11-23" }) { sum { requests } }`);
    const withoutCpu = accountUsageQuery(["2026-11-23"]);
    expect(withoutCpu).not.toContain("quantiles");
    expect(withoutCpu).not.toMatch(/\b[cx]20261123:/);
  });

  it("refuses a day that is not YYYY-MM-DD", () => {
    expect(() => accountUsageQuery([], ['2026-11-23" } } evil'])).toThrow("Invalid day");
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
    expect(parseCpu({ viewer: { accounts: [] } } as unknown as AccountUsageData, ["2026-11-23"])).toEqual({});
  });
});
