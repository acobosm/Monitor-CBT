import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("worker", () => {
  it("answers /api/ping", async () => {
    const res = await exports.default.fetch("http://localhost/api/ping");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
