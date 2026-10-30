// Notice shown when the live Cloudflare read fails; the stored history is still returned (R11, R35, R42).
import { TEXT_INVALID } from "./token";

export const TEXT_NO_RECENT = "No pudimos leer los datos recientes de Cloudflare.";
export const TEXT_NO_HISTORY = `${TEXT_NO_RECENT} Aún no hay historial guardado.`;

const longDate = new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "UTC" });

/** `tokenRejected`: Cloudflare refused the token, or there is none. `lastDay`: last stored day, if any. */
export function liveReadNotice(tokenRejected: boolean, lastDay: string | null): string {
  if (tokenRejected) return TEXT_INVALID;
  if (!lastDay) return TEXT_NO_HISTORY;
  return `${TEXT_NO_RECENT} Se muestra el historial guardado hasta el ${longDate.format(new Date(`${lastDay}T00:00:00Z`))}.`;
}
