import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("worker", () => {
  it("protects /api/ping: without an Access JWT it answers 403", async () => {
    const res = await exports.default.fetch("https://monitor-cbt.example.workers.dev/api/ping");
    expect(res.status).toBe(403);
  });
});
