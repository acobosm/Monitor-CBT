// Daily series for the charts and the general panel (R13–R16, R26–R35).
// Pure: "now" is always passed in; a missing figure stays null, never 0 (R16, R33).
import type { Product, UsageMetric } from "../db/statistics";
import { chartDays, isPartialDay, previousUtcDay } from "./days";
import { ACCOUNT_METRICS, isLatestValue, metricLabel, type LimitsConfig, type Period } from "./usage";

export interface DayPoint {
  day: string;
  value: number | null;
  /** The day in progress, labeled "Hoy (parcial)" (R27). */
  partial: boolean;
}

/** One point per chart day; days without a figure are gaps (R33). */
export function dayPoints(values: Record<string, number | null | undefined>, now: Date): DayPoint[] {
  return chartDays(now).map((day) => ({ day, value: values[day] ?? null, partial: isPartialDay(day, now) }));
}

/** Stored days completed with the live read: per metric, the live figure wins. */
export function mergeHistory(
  stored: Record<string, UsageMetric[]>,
  live: Record<string, UsageMetric[]>,
): Record<string, UsageMetric[]> {
  const merged: Record<string, UsageMetric[]> = {};
  for (const day of new Set([...Object.keys(stored), ...Object.keys(live)])) {
    const byKey = new Map<string, UsageMetric>();
    for (const m of [...(stored[day] ?? []), ...(live[day] ?? [])]) byKey.set(`${m.product}:${m.metric}`, m);
    merged[day] = [...byKey.values()];
  }
  return merged;
}

export interface UsageChart {
  product: Product;
  metric: string;
  label: string;
  period: Period;
  limit: number;
  points: DayPoint[];
}

/**
 * One chart per metric with a limit (R28). Daily and storage metrics show each day's figure (R29, R31);
 * monthly operations show the month's running total, which starts again on the 1st (R30).
 */
export function usageCharts(history: Record<string, UsageMetric[]>, limits: LimitsConfig, now: Date): UsageChart[] {
  const value = (day: string, product: Product, metric: string) =>
    history[day]?.find((m) => m.product === product && m.metric === metric)?.value ?? null;

  return ACCOUNT_METRICS.flatMap(({ product, metric }): UsageChart[] => {
    const config = limits.metrics.find((m) => m.product === product && m.metric === metric);
    if (!config || config.limit === null) return [];
    const running = config.period === "monthly" && !isLatestValue(config.period, metric);
    let total = 0;
    const values: Record<string, number | null> = {};
    for (const day of chartDays(now)) {
      if (day.endsWith("-01")) total = 0;
      const v = value(day, product, metric);
      if (v !== null) total += v;
      values[day] = v === null ? null : running ? total : v;
    }
    return [{ product, metric, label: metricLabel(product, metric), period: config.period, limit: config.limit, points: dayPoints(values, now) }];
  });
}

export interface SiteSummary {
  /** Visits of the last complete day (R13, R14). */
  yesterday: number | null;
  /** Average of the complete days with a figure. */
  dailyAverage: number | null;
  /** Yesterday against the average, in whole percent. */
  changePercent: number | null;
  /** Visits of the 30 chart days, today's partial figure included. */
  total: number | null;
}

export function siteSummary(points: DayPoint[], now: Date): SiteSummary {
  const yesterday = points.find((p) => p.day === previousUtcDay(now))?.value ?? null;
  const complete = points.filter((p) => !p.partial && p.value !== null).map((p) => p.value as number);
  const dailyAverage = complete.length ? complete.reduce((a, b) => a + b, 0) / complete.length : null;
  const known = points.filter((p) => p.value !== null).map((p) => p.value as number);
  return {
    yesterday,
    dailyAverage,
    changePercent: yesterday !== null && dailyAverage ? Math.round(((yesterday - dailyAverage) / dailyAverage) * 100) : null,
    total: known.length ? known.reduce((a, b) => a + b, 0) : null,
  };
}

export interface PanelSummary {
  /** Sum of yesterday's visits; null if any site lacks it, so a partial sum never looks complete (R16). */
  visitsYesterday: number | null;
  sites: number;
  nearLimit: number;
}

export function panelSummary(cards: { summary: SiteSummary; nearLimit: boolean }[]): PanelSummary {
  const yesterdays = cards.map((c) => c.summary.yesterday);
  return {
    visitsYesterday: yesterdays.some((v) => v === null) ? null : yesterdays.reduce<number>((a, b) => a + (b ?? 0), 0),
    sites: cards.length,
    nearLimit: cards.filter((c) => c.nearLimit).length,
  };
}
