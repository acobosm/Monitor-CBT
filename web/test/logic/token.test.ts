import { describe, expect, it } from "vitest";
import {
  evaluateToken,
  LABEL_EXPIRING,
  LABEL_URGENT,
  TEXT_INVALID,
  TEXT_NO_EXPIRY,
  TEXT_POLICY,
  TEXT_UNVERIFIED,
  type TokenCheck,
} from "../../src/logic/token";

const now = new Date("2026-10-29T17:00:00Z");
const DAY_MS = 86_400_000;

function active(expiresOn: string | null, notBefore: string | null = "2026-10-29T05:00:00Z"): TokenCheck {
  return { kind: "response", success: true, status: "active", notBefore, expiresOn };
}

function inDays(days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

describe("R8 remaining days", () => {
  it("shows the remaining days of a valid token", () => {
    const notice = evaluateToken(active("2027-01-01T04:59:59Z"), now);
    expect(notice).toMatchObject({ state: "valid", level: "normal", daysLeft: 64, label: null, policyText: null });
    expect(notice.text).toBe("Token vence en 64 días");
  });

  it("rounds up, so a few hours left still count as 1 day", () => {
    const notice = evaluateToken(active(new Date(now.getTime() + 6 * 3_600_000).toISOString()), now);
    expect(notice.daysLeft).toBe(1);
    expect(notice.text).toBe("Token vence en 1 día");
  });
});

describe("R9 amber from 30 days", () => {
  it("is normal at 31 days", () => {
    expect(evaluateToken(active(inDays(31)), now)).toMatchObject({ state: "valid", level: "normal" });
  });

  it("is amber with 'Por vencer' from 30 down to 8 days", () => {
    for (const days of [30, 8]) {
      expect(evaluateToken(active(inDays(days)), now)).toMatchObject({ state: "expiring", level: "amber", daysLeft: days, label: LABEL_EXPIRING });
    }
  });
});

describe("R10 red from 7 days", () => {
  it("is red with 'Renuévalo ya' at 7 days and below", () => {
    for (const days of [7, 1]) {
      expect(evaluateToken(active(inDays(days)), now)).toMatchObject({ state: "urgent", level: "red", daysLeft: days, label: LABEL_URGENT });
    }
  });
});

describe("R11 invalid token", () => {
  const invalidCases: [string, TokenCheck][] = [
    ["missing", { kind: "missing" }],
    ["rejected", { kind: "response", success: false }],
    ["not active", { kind: "response", success: true, status: "disabled", expiresOn: inDays(60) }],
    ["expired", active(new Date(now.getTime() - 1000).toISOString())],
    ["not valid yet (verify still says active)", active(inDays(60), "2026-12-31T05:00:00Z")],
    ["unparsable dates", active("garbage")],
  ];

  for (const [name, check] of invalidCases) {
    it(`is invalid when ${name}`, () => {
      expect(evaluateToken(check, now)).toMatchObject({ state: "invalid", level: "red", daysLeft: null, text: TEXT_INVALID });
    });
  }

  it("accepts a token without not_before", () => {
    expect(evaluateToken(active(inDays(60), null), now).state).toBe("valid");
  });
});

describe("R12 verify unreachable", () => {
  it("shows that the token could not be verified", () => {
    expect(evaluateToken({ kind: "unreachable" }, now)).toMatchObject({ state: "unverified", text: TEXT_UNVERIFIED, daysLeft: null });
  });
});

describe("R13 expiration rule (1 year maximum)", () => {
  it("flags a token without expiration date", () => {
    expect(evaluateToken(active(null), now)).toMatchObject({ level: "red", daysLeft: null, text: TEXT_NO_EXPIRY, policyText: TEXT_POLICY });
  });

  it("accepts exactly 1 year", () => {
    expect(evaluateToken(active("2027-10-29T17:00:00Z"), now).policyText).toBeNull();
  });

  it("flags more than 1 year, in red", () => {
    expect(evaluateToken(active("2027-10-29T17:00:01Z"), now)).toMatchObject({ state: "valid", level: "red", policyText: TEXT_POLICY });
  });
});
