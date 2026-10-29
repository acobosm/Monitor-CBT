import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { TEXT_EMAIL_DENIED } from "../src/access";
import { createApp } from "../src/index";
import { accessJwt, testKeys } from "./helpers/access-jwt";

const app = createApp(testKeys);
const REMOTE = "https://monitor-cbt.example.workers.dev/api/ping";

function request(token?: string, overrides: Partial<Env> = {}, url = REMOTE) {
  const headers = token ? { "Cf-Access-Jwt-Assertion": token } : undefined;
  return app.request(url, { headers }, { ...env, ...overrides });
}

describe("test environment", () => {
  it("uses dummy values, never the real token from .dev.vars", () => {
    expect(env.CLOUDFLARE_ANALYTICS_TOKEN).toBe("test-token");
  });
});

describe("R1 valid Access JWT required", () => {
  it("accepts a valid JWT", async () => {
    const res = await request(await accessJwt());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  const cases: [string, () => Promise<string | undefined>][] = [
    ["no JWT", async () => undefined],
    ["a malformed JWT", async () => "not-a-jwt"],
    ["a JWT signed by another key", () => accessJwt({ signedByStranger: true })],
    ["a JWT for another application", () => accessJwt({ audience: "other-aud" })],
    ["a JWT from another team", () => accessJwt({ issuer: "https://evil.cloudflareaccess.com" })],
    ["an expired JWT", () => accessJwt({ expiresIn: "-1m" })],
  ];

  for (const [name, token] of cases) {
    it(`rejects ${name} with 403 and no data`, async () => {
      const res = await request(await token());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    });
  }
});

describe("R2 email allowlist", () => {
  it("rejects a valid JWT whose email is not allowed", async () => {
    const res = await request(await accessJwt({ email: "someone@example.com" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: TEXT_EMAIL_DENIED });
  });

  it("compares emails without case and ignores spaces in the list", async () => {
    const res = await request(await accessJwt({ email: "Owner@Example.com" }), { ALLOWED_EMAILS: " other@example.com , OWNER@example.com " });
    expect(res.status).toBe(200);
  });

  it("rejects a JWT without an email", async () => {
    const res = await request(await accessJwt({ payload: { email: undefined } }));
    expect(res.status).toBe(403);
  });
});

describe("R3 fail closed", () => {
  const missing: [string, Partial<Env>][] = [
    ["team domain", { ACCESS_TEAM_DOMAIN: "" }],
    ["AUD", { ACCESS_AUD: "" }],
    ["allowlist", { ALLOWED_EMAILS: " , " }],
  ];

  for (const [name, overrides] of missing) {
    it(`denies a valid JWT when the ${name} is missing`, async () => {
      const res = await request(await accessJwt(), overrides);
      expect(res.status).toBe(403);
    });
  }
});

describe("R4 local bypass", () => {
  it("accepts requests to localhost without a JWT when the flag is set", async () => {
    const res = await request(undefined, { LOCAL_ACCESS_BYPASS: "true" }, "http://localhost:5173/api/ping");
    expect(res.status).toBe(200);
  });

  it("ignores the flag for any other host", async () => {
    const res = await request(undefined, { LOCAL_ACCESS_BYPASS: "true" });
    expect(res.status).toBe(403);
  });

  it("does not bypass localhost without the flag", async () => {
    const res = await request(undefined, {}, "http://localhost:5173/api/ping");
    expect(res.status).toBe(403);
  });
});
