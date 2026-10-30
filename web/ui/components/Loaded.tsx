import type { ReactNode } from "react";
import type { ApiState } from "../api";
import { Notice } from "./Notice";

export const TEXT_LOADING = "Cargando…";
export const TEXT_API_FAILED = "No pudimos cargar los datos. Vuelve a intentarlo en unos minutos.";

/** Loading, denied and failed states shared by the pages (R2). */
export function Loaded<T>({ state, children }: { state: ApiState<T>; children: (data: T) => ReactNode }) {
  if (state.kind === "loading") return <p>{TEXT_LOADING}</p>;
  if (state.kind === "denied") return <Notice level="red">{state.message}</Notice>;
  if (state.kind === "error") return <Notice level="red">{TEXT_API_FAILED}</Notice>;
  return <>{children(state.data)}</>;
}
