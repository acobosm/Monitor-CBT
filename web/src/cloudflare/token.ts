// `GET /user/tokens/verify`: reads the token's status and dates. Never returns the token or the raw response (R5).
import type { TokenCheck } from "../logic/token";

export const TOKEN_VERIFY_ENDPOINT = "https://api.cloudflare.com/client/v4/user/tokens/verify";

interface VerifyBody {
  success?: boolean;
  result?: { status?: string; not_before?: string | null; expires_on?: string | null } | null;
}

export async function verifyToken(token: string | undefined, fetchFn: typeof fetch = fetch): Promise<TokenCheck> {
  if (!token) return { kind: "missing" };
  try {
    const res = await fetchFn(TOKEN_VERIFY_ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
    // A server error says nothing about the token: only an answer about the token itself can invalidate it.
    if (res.status >= 500) return { kind: "unreachable" };
    const body: VerifyBody = await res.json();
    return {
      kind: "response",
      success: body.success === true,
      status: body.result?.status,
      notBefore: body.result?.not_before,
      expiresOn: body.result?.expires_on,
    };
  } catch {
    return { kind: "unreachable" };
  }
}
