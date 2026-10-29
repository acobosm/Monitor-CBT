// Analytics token state from `GET /client/v4/user/tokens/verify`. Pure: "now" is always passed in.

const DAY_MS = 86_400_000;

/** Amber notice from this many days left (R9). */
export const AMBER_DAYS = 30;
/** Red notice from this many days left (R10). */
export const RED_DAYS = 7;

export type TokenCheck =
  | { kind: "missing" }
  | { kind: "unreachable" }
  | { kind: "response"; success: boolean; status?: string; notBefore?: string | null; expiresOn?: string | null };

export type TokenState = "valid" | "expiring" | "urgent" | "invalid" | "unverified";
export type NoticeLevel = "normal" | "amber" | "red";

export interface TokenNotice {
  state: TokenState;
  level: NoticeLevel;
  daysLeft: number | null;
  text: string;
  label: string | null;
  /** R13: no expiration date, or more than 1 year away. */
  policyText: string | null;
}

export const TEXT_INVALID = "No pudimos leer los datos de Cloudflare: el token no es válido o venció.";
export const TEXT_UNVERIFIED = "No pudimos verificar el token.";
export const TEXT_POLICY = "El token no cumple la regla de caducidad (máximo 1 año).";
export const TEXT_NO_EXPIRY = "El token no tiene fecha de vencimiento.";
export const LABEL_EXPIRING = "Por vencer";
export const LABEL_URGENT = "Renuévalo ya";

function daysText(days: number): string {
  return `Token vence en ${days} ${days === 1 ? "día" : "días"}`;
}

function oneYearAfter(now: Date): number {
  const limit = new Date(now.getTime());
  limit.setUTCFullYear(limit.getUTCFullYear() + 1);
  return limit.getTime();
}

const invalid: TokenNotice = { state: "invalid", level: "red", daysLeft: null, text: TEXT_INVALID, label: null, policyText: null };

export function evaluateToken(check: TokenCheck, now: Date): TokenNotice {
  if (check.kind === "missing") return invalid;
  if (check.kind === "unreachable") {
    return { state: "unverified", level: "amber", daysLeft: null, text: TEXT_UNVERIFIED, label: null, policyText: null };
  }
  if (!check.success || check.status !== "active") return invalid;

  const nowMs = now.getTime();
  if (check.notBefore) {
    const notBefore = Date.parse(check.notBefore);
    // tokens/verify answers "active" even before not_before, but GraphQL rejects the token until then.
    if (Number.isNaN(notBefore) || notBefore > nowMs) return invalid;
  }

  if (!check.expiresOn) {
    return { state: "valid", level: "red", daysLeft: null, text: TEXT_NO_EXPIRY, label: null, policyText: TEXT_POLICY };
  }
  const expires = Date.parse(check.expiresOn);
  if (Number.isNaN(expires) || expires <= nowMs) return invalid;

  const daysLeft = Math.ceil((expires - nowMs) / DAY_MS);
  const policyText = expires > oneYearAfter(now) ? TEXT_POLICY : null;
  const base = { daysLeft, text: daysText(daysLeft), policyText };
  if (daysLeft <= RED_DAYS) return { ...base, state: "urgent", level: "red", label: LABEL_URGENT };
  if (daysLeft <= AMBER_DAYS) return { ...base, state: "expiring", level: "amber", label: LABEL_EXPIRING };
  return { ...base, state: "valid", level: policyText ? "red" : "normal", label: null };
}
