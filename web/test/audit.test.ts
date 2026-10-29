import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { recordAudit } from "../src/db/audit";

describe("R6 audit record", () => {
  it("stores email, date and time, and the screen requested", async () => {
    const at = new Date("2026-10-29T17:00:00Z");
    expect(await recordAudit(env.AUDIT_DB, { email: "owner@example.com", action: "view", target: "usage" }, at)).toBe(true);

    const row = await env.AUDIT_DB.prepare("SELECT at, email, action, target, format FROM audit_event").first();
    expect(row).toEqual({ at: "2026-10-29T17:00:00.000Z", email: "owner@example.com", action: "view", target: "usage", format: null });
  });

  it("stores the format of an export", async () => {
    await recordAudit(env.AUDIT_DB, { email: "owner@example.com", action: "export", target: "soma", format: "xlsx" });
    const row = await env.AUDIT_DB.prepare("SELECT action, target, format FROM audit_event ORDER BY id DESC").first();
    expect(row).toEqual({ action: "export", target: "soma", format: "xlsx" });
  });
});

describe("R7 audit failure does not block", () => {
  it("returns false and logs the error without the email", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    } as unknown as D1Database;

    await expect(recordAudit(broken, { email: "owner@example.com", action: "view", target: "usage" })).resolves.toBe(false);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain("owner@example.com");
    log.mockRestore();
  });
});
