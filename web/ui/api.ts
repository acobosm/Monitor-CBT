// Reads the Worker's API. Types mirror the JSON of src/routes/api.ts: the UI only displays what comes ready (R14–R27).
import { useEffect, useState } from "react";

export type Level = "normal" | "amber" | "red";

export interface TokenNoticeData {
  state: string;
  level: Level;
  daysLeft: number | null;
  text: string;
  label: string | null;
  policyText: string | null;
}

export interface UsageRow {
  product: string;
  productLabel: string;
  metric: string;
  label: string;
  period: string;
  periodLabel: string;
  usage: number;
  limit: number | null;
  percent: number | null;
  state: string;
  stateText: string;
  level: Level;
  peak7: number | null;
  note: string | null;
  projection: string | null;
}

export interface AccountUsage {
  id: string;
  name: string;
  live: boolean;
  rows: UsageRow[];
  limitsCheckedText: string;
  unclassifiedText: string | null;
}

export interface UsageData {
  accounts: AccountUsage[];
  notice: string | null;
}

export interface TrafficTotals {
  requests: number;
  visits: number;
  pageViews: number | null;
  bytes: number;
}

export interface IpRow {
  ip: string;
  country: string | null;
  requests: number;
  actionText: string | null;
  lastSeen: string | null;
}

export interface SiteData {
  id: string;
  name: string;
  notice: string | null;
  traffic: {
    note: string;
    rows: { day: string; label: string; partial: boolean; totals: TrafficTotals | null }[];
  };
  pageViewsNotice: string | null;
  days: string[];
  selectedDay: string | null;
  unavailableText: string | null;
  countries: { country: string; requests: number; percent: number }[];
  topTrafficIps: IpRow[];
  topSecurityIps: IpRow[];
}

export type ApiState<T> =
  | { kind: "loading" }
  | { kind: "ok"; data: T }
  | { kind: "denied"; message: string }
  | { kind: "error" };

const TEXT_DENIED = "No tienes acceso a este panel.";

export async function readApi<T>(path: string, signal?: AbortSignal): Promise<Exclude<ApiState<T>, { kind: "loading" }>> {
  try {
    const res = await fetch(path, { signal });
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      // R2: the API sends its text when the email is not allowed; "forbidden" carries no text to show.
      return { kind: "denied", message: body?.error && body.error !== "forbidden" ? body.error : TEXT_DENIED };
    }
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", data: (await res.json()) as T };
  } catch {
    return { kind: "error" };
  }
}

/** Reads `path` when it changes; a newer read cancels the previous one. */
export function useApi<T>(path: string): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    void readApi<T>(path, controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => controller.abort();
  }, [path]);
  return state;
}
