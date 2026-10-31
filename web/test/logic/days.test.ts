import { describe, expect, it } from "vitest";
import { ectHourRange, gapDays, ipCutoffDay, isPartialDay, missingDays, previousUtcDay, utcDay } from "../../src/logic/days";

describe("utcDay", () => {
  it("uses the UTC day, so 19:00 ECT already belongs to the next day", () => {
    expect(utcDay(new Date("2026-10-29T23:59:59Z"))).toBe("2026-10-29"); // 18:59 ECT
    expect(utcDay(new Date("2026-10-30T00:00:00Z"))).toBe("2026-10-30"); // 19:00 ECT on the 29th
  });
});

describe("R28 previousUtcDay", () => {
  it("returns yesterday in UTC when the task runs at 01:00 UTC", () => {
    expect(previousUtcDay(new Date("2026-10-30T01:00:00Z"))).toBe("2026-10-29");
  });

  it("crosses month and year boundaries", () => {
    expect(previousUtcDay(new Date("2026-03-01T01:00:00Z"))).toBe("2026-02-28");
    expect(previousUtcDay(new Date("2027-01-01T01:00:00Z"))).toBe("2026-12-31");
  });
});

describe("R22 R34 isPartialDay", () => {
  const now = new Date("2026-10-29T17:00:00Z");

  it("marks only the day in progress as partial", () => {
    expect(isPartialDay("2026-10-29", now)).toBe(true);
    expect(isPartialDay("2026-10-28", now)).toBe(false);
  });
});

describe("R31 missingDays", () => {
  const now = new Date("2026-10-30T01:00:00Z");

  it("returns the 29 complete days when nothing is stored, oldest first, today excluded", () => {
    const days = missingDays([], now);
    expect(days).toHaveLength(29);
    expect(days[0]).toBe("2026-10-01");
    expect(days[28]).toBe("2026-10-29");
    expect(days).not.toContain("2026-10-30");
  });

  it("returns only the gaps", () => {
    const stored = missingDays([], now).filter((d) => d !== "2026-10-05" && d !== "2026-10-20");
    expect(missingDays(stored, now)).toEqual(["2026-10-05", "2026-10-20"]);
  });

  it("ignores stored days outside the window", () => {
    const stored = [...missingDays([], now), "2026-09-01"];
    expect(missingDays(stored, now)).toEqual([]);
  });
});

describe("R32 ipCutoffDay", () => {
  it("keeps 13 calendar months", () => {
    expect(ipCutoffDay(new Date("2026-10-30T01:00:00Z"))).toBe("2025-09-30");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(ipCutoffDay(new Date("2027-03-31T01:00:00Z"))).toBe("2026-02-28");
    expect(ipCutoffDay(new Date("2029-03-31T01:00:00Z"))).toBe("2028-02-29");
  });

  it("crosses the year boundary", () => {
    expect(ipCutoffDay(new Date("2027-01-15T01:00:00Z"))).toBe("2025-12-15");
  });
});

describe("R25 R26 ectHourRange", () => {
  it("converts a UTC hour to an ECT hour range", () => {
    expect(ectHourRange("2026-10-28T19:00:00Z")).toBe("14:00–15:00");
  });

  it("handles the hours around midnight ECT", () => {
    expect(ectHourRange("2026-10-29T04:00:00Z")).toBe("23:00–00:00");
    expect(ectHourRange("2026-10-29T05:00:00Z")).toBe("00:00–01:00");
  });

  it("rejects an invalid hour", () => {
    expect(() => ectHourRange("not a date")).toThrow();
  });
});

describe("R31 P9 gapDays", () => {
  const now = new Date("2026-10-30T01:00:00Z");

  it("returns nothing before the first run: history starts there", () => {
    expect(gapDays([], null, now)).toEqual([]);
  });

  it("returns only missing days after the first stored day", () => {
    expect(gapDays(["2026-10-25", "2026-10-28"], "2026-10-25", now)).toEqual(["2026-10-26", "2026-10-27", "2026-10-29"]);
  });

  it("treats the whole window as recoverable when history started earlier", () => {
    expect(gapDays([], "2026-01-01", now)).toHaveLength(29);
  });
});
