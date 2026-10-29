// Second barrier behind Cloudflare Access: validates the Access JWT and the email allowlist on /api/* (R1–R4).
import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const TEXT_EMAIL_DENIED = "Tu correo no tiene acceso a este panel.";
/** Identity used in local development when the bypass applies. */
export const LOCAL_EMAIL = "local@localhost";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type AccessVariables = { email: string };
export type KeyResolver = (teamDomain: string) => JWTVerifyGetKey;

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

/** Access public keys, fetched from the team domain and cached per isolate. */
export function remoteAccessKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = remoteKeySets.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain));
    remoteKeySets.set(teamDomain, keys);
  }
  return keys;
}

/** Comma-separated emails, compared without case. */
export function parseAllowedEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function accessMiddleware(
  resolveKeys: KeyResolver = remoteAccessKeys,
): MiddlewareHandler<{ Bindings: Env; Variables: AccessVariables }> {
  return async (c, next) => {
    const forbidden = (error = "forbidden") => c.json({ error }, 403);
    const env = c.env;

    // R4: the flag only counts for requests to localhost; any other host goes through Access.
    if (env.LOCAL_ACCESS_BYPASS === "true" && LOCAL_HOSTS.has(new URL(c.req.url).hostname)) {
      c.set("email", LOCAL_EMAIL);
      return next();
    }

    // R3: fail closed when the configuration is incomplete.
    const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, "");
    const audience = env.ACCESS_AUD?.trim();
    const allowed = parseAllowedEmails(env.ALLOWED_EMAILS);
    if (!teamDomain || !audience || allowed.size === 0) return forbidden();

    // R1: signature, issuer, audience and expiry.
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    if (!token) return forbidden();
    let email: unknown;
    try {
      const { payload } = await jwtVerify(token, resolveKeys(teamDomain), {
        issuer: teamDomain,
        audience,
        algorithms: ["RS256"],
      });
      email = payload.email;
    } catch {
      return forbidden();
    }

    // R2: the email must also be in the Worker's own allowlist.
    if (typeof email !== "string" || !allowed.has(email.toLowerCase())) return forbidden(TEXT_EMAIL_DENIED);
    c.set("email", email.toLowerCase());
    return next();
  };
}
