// Dummy Access JWTs signed with a key generated for the tests; Cloudflare is never called.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import type { KeyResolver } from "../../src/access";

export const TEAM_DOMAIN = "https://test-team.cloudflareaccess.com";
export const AUDIENCE = "test-aud";

const accessKeys = await generateKeyPair("RS256");
const strangerKeys = await generateKeyPair("RS256");
const publicJwk = { ...(await exportJWK(accessKeys.publicKey)), kid: "test-key", alg: "RS256" };

/** Resolves only the test key, as Access would publish it. */
export const testKeys: KeyResolver = () => createLocalJWKSet({ keys: [publicJwk] });

interface Options {
  email?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  signedByStranger?: boolean;
  payload?: JWTPayload;
}

export async function accessJwt(options: Options = {}): Promise<string> {
  const { email = "owner@example.com", issuer = TEAM_DOMAIN, audience = AUDIENCE, expiresIn = "1h" } = options;
  return new SignJWT({ email, ...options.payload })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(options.signedByStranger ? strangerKeys.privateKey : accessKeys.privateKey);
}
