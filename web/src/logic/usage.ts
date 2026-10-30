// Plan usage: parse GraphQL account data into daily metrics and evaluate them against the Free limits.
// Pure: "now" is always passed in; the UI only displays what this returns (R14–R20).
import type { Product, UsageMetric } from "../db/statistics";
import type { AccountUsageData } from "../cloudflare/queries";
import { utcDay } from "./days";

const DAY_MS = 86_400_000;

export type Period = "daily" | "monthly" | "total";

export interface LimitConfig {
  product: Product;
  metric: string;
  period: Period;
  limit: number | null;
}

export interface LimitsConfig {
  checkedOn: string;
  thresholds: { amber: number; red: number; exceeded: number };
  metrics: LimitConfig[];
}

/** Every metric stored for an account and day, even when it is 0 (R31). */
export const ACCOUNT_METRICS: readonly { product: Product; metric: string }[] = [
  { product: "workers", metric: "requests" },
  { product: "d1", metric: "rows_read" },
  { product: "d1", metric: "rows_written" },
  { product: "d1", metric: "storage_bytes" },
  /** Free limits each database to 500 MB, besides the 5 GB of the account (P8). */
  { product: "d1", metric: "largest_db_bytes" },
  { product: "d1", metric: "database_count" },
  { product: "r2", metric: "class_a_ops" },
  { product: "r2", metric: "class_b_ops" },
  { product: "r2", metric: "storage_bytes" },
];

// R20: official R2 pricing page, checked on 2026-10-29 (https://developers.cloudflare.com/r2/pricing/).
const R2_CLASS_A = new Set([
  "ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject", "CompleteMultipartUpload",
  "CreateMultipartUpload", "LifecycleStorageTierTransition", "ListMultipartUploads", "UploadPart",
  "UploadPartCopy", "ListParts", "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration",
]);
const R2_CLASS_B = new Set([
  "HeadBucket", "HeadObject", "GetObject", "UsageSummary", "GetBucketEncryption", "GetBucketLocation",
  "GetBucketCors", "GetBucketLifecycleConfiguration",
]);
const R2_FREE = new Set(["DeleteObject", "DeleteBucket", "AbortMultipartUpload"]);

export type R2Class = "A" | "B" | "free" | "unclassified";

export function r2Class(actionType: string): R2Class {
  if (R2_CLASS_A.has(actionType)) return "A";
  if (R2_CLASS_B.has(actionType)) return "B";
  if (R2_FREE.has(actionType)) return "free";
  return "unclassified";
}

export interface ParsedAccountUsage {
  days: Record<string, UsageMetric[]>;
  /** R2 operations not on the pricing page; counted as Class A (P7). */
  unclassifiedR2: string[];
  /** ID of the largest D1 database of each day (the token cannot read database names). */
  largestD1: Record<string, string | null>;
}

/** Turns one AccountUsage response into the full set of metrics for each requested day. */
export function parseAccountUsage(data: AccountUsageData, days: string[]): ParsedAccountUsage {
  const account = data.viewer.accounts[0];
  const totals = new Map<string, Map<string, number>>(
    days.map((day) => [day, new Map(ACCOUNT_METRICS.map((m) => [`${m.product}:${m.metric}`, 0]))]),
  );
  const add = (day: string, key: string, value: number | null | undefined) => {
    const metrics = totals.get(day);
    if (metrics && value) metrics.set(key, (metrics.get(key) ?? 0) + value);
  };
  const unclassified = new Set<string>();

  for (const row of account?.workers ?? []) add(row.dimensions.date, "workers:requests", row.sum.requests);
  for (const row of account?.d1 ?? []) {
    add(row.dimensions.date, "d1:rows_read", row.sum.rowsRead);
    add(row.dimensions.date, "d1:rows_written", row.sum.rowsWritten);
  }
  // Storage: the day's peak of each database or bucket, summed over the account.
  const databases = new Map<string, Map<string, number>>();
  for (const row of account?.d1Storage ?? []) {
    add(row.dimensions.date, "d1:storage_bytes", row.max.databaseSizeBytes);
    const perDb = databases.get(row.dimensions.date) ?? new Map<string, number>();
    perDb.set(row.dimensions.databaseId, Math.max(perDb.get(row.dimensions.databaseId) ?? 0, row.max.databaseSizeBytes ?? 0));
    databases.set(row.dimensions.date, perDb);
  }
  const largestD1: Record<string, string | null> = {};
  for (const day of days) {
    const perDb = [...(databases.get(day) ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    totals.get(day)?.set("d1:largest_db_bytes", perDb[0]?.[1] ?? 0);
    totals.get(day)?.set("d1:database_count", perDb.length);
    largestD1[day] = perDb[0]?.[0] ?? null;
  }
  for (const row of account?.r2Storage ?? []) {
    add(row.dimensions.date, "r2:storage_bytes", (row.max.payloadSize ?? 0) + (row.max.metadataSize ?? 0));
  }
  for (const row of account?.r2Ops ?? []) {
    const kind = r2Class(row.dimensions.actionType);
    if (kind === "free") continue;
    if (kind === "unclassified") unclassified.add(row.dimensions.actionType);
    add(row.dimensions.date, kind === "B" ? "r2:class_b_ops" : "r2:class_a_ops", row.sum.requests);
  }

  return {
    days: Object.fromEntries(
      [...totals].map(([day, metrics]) => [
        day,
        ACCOUNT_METRICS.map((m) => ({ ...m, value: metrics.get(`${m.product}:${m.metric}`) ?? 0 })),
      ]),
    ),
    unclassifiedR2: [...unclassified].sort(),
    largestD1,
  };
}

/**
 * Metrics of a day still in progress. Storage and database counts may not be reported yet early in the
 * day: a 0 there means "unknown", so it is dropped and the latest known value is shown instead (R18).
 */
export function partialDayMetrics(metrics: UsageMetric[]): UsageMetric[] {
  return metrics.filter((m) => m.value > 0 || !(m.metric.endsWith("_bytes") || m.metric === "database_count"));
}

export type UsageState = "ok" | "near" | "critical" | "exceeded" | "unconfigured";

export interface UsageRow {
  product: Product;
  productLabel: string;
  metric: string;
  label: string;
  period: Period;
  periodLabel: string;
  usage: number;
  limit: number | null;
  /** Percentage truncated to one decimal; null without a limit (R19). */
  percent: number | null;
  state: UsageState;
  stateText: string;
  level: "normal" | "amber" | "red";
  /** Daily metrics: highest value of the last 7 days, today included (R17). */
  peak7: number | null;
  note: string | null;
  /** Monthly and storage metrics (R18). */
  projection: string | null;
}

export interface UsageTable {
  rows: UsageRow[];
  limitsCheckedText: string;
  unclassifiedText: string | null;
}

const PRODUCT_LABELS: Record<Product, string> = { workers: "Workers", d1: "D1", r2: "R2" };
const METRIC_LABELS: Record<string, string> = {
  "workers:requests": "Peticiones",
  "d1:rows_read": "Filas leídas",
  "d1:rows_written": "Filas escritas",
  "d1:storage_bytes": "Almacenamiento",
  "d1:largest_db_bytes": "Base más grande",
  "d1:database_count": "Cantidad de bases",
  "r2:class_a_ops": "Operaciones Clase A",
  "r2:class_b_ops": "Operaciones Clase B",
  "r2:storage_bytes": "Almacenamiento",
};
const PERIOD_LABELS: Record<Period, string> = { daily: "Diario", monthly: "Mensual", total: "Total" };

export const TEXT_RESET = "Se reinicia a las 19:00 ECT";
export const TEXT_NO_RISK = "Sin riesgo este mes";
export const TEXT_NO_LIMIT = "Límite no configurado";

function daysWord(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`;
}

function projectionText(daysToLimit: number): string {
  return `Al ritmo actual llegas al límite en ${daysWord(Math.max(1, Math.ceil(daysToLimit)))}`;
}

function valueOn(history: Record<string, UsageMetric[]>, day: string, product: Product, metric: string): number | null {
  const found = history[day]?.find((m) => m.product === product && m.metric === metric);
  return found ? found.value : null;
}

function shiftDay(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

function state(percent: number | null, t: LimitsConfig["thresholds"]): Pick<UsageRow, "state" | "stateText" | "level"> {
  if (percent === null) return { state: "unconfigured", stateText: TEXT_NO_LIMIT, level: "normal" };
  if (percent >= t.exceeded) return { state: "exceeded", stateText: "Límite superado", level: "red" };
  if (percent >= t.red) return { state: "critical", stateText: "Límite crítico", level: "red" };
  if (percent >= t.amber) return { state: "near", stateText: "Cerca del límite", level: "amber" };
  return { state: "ok", stateText: "Normal", level: "normal" };
}

/** Builds the usage table of one account. `history` holds stored days plus today's partial data. */
export function evaluateUsage(
  history: Record<string, UsageMetric[]>,
  limits: LimitsConfig,
  now: Date,
  extras: { unclassifiedR2?: string[]; largestD1Id?: string | null } = {},
): UsageTable {
  const unclassifiedR2 = extras.unclassifiedR2 ?? [];
  const today = utcDay(now);
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsedDays = Math.max((now.getTime() - monthStart) / DAY_MS, 1 / 24);
  const remainingDays = (monthEnd - now.getTime()) / DAY_MS;

  const rows = ACCOUNT_METRICS.map(({ product, metric }): UsageRow => {
    const config = limits.metrics.find((m) => m.product === product && m.metric === metric);
    const period: Period = config?.period ?? (metric.endsWith("_bytes") ? "total" : "daily");
    const limit = config?.limit ?? null;
    // Storage and totals (database count) use the latest value, not a sum over a period.
    const latest = period === "total" || metric.endsWith("_bytes");
    let usage: number;
    let peak7: number | null = null;
    let note: string | null = null;
    let projection: string | null = null;

    if (latest) {
      // Latest known value; projection from the average growth of the last 7 days (R18).
      const latestDay = Object.keys(history).filter((d) => d <= today && valueOn(history, d, product, metric) !== null).sort().at(-1);
      usage = latestDay ? (valueOn(history, latestDay, product, metric) ?? 0) : 0;
      const weekAgo = latestDay ? valueOn(history, shiftDay(latestDay, -7), product, metric) : null;
      const growth = weekAgo === null ? 0 : (usage - weekAgo) / 7;
      if (limit !== null && usage < limit) {
        projection = growth > 0 && (limit - usage) / growth <= remainingDays ? projectionText((limit - usage) / growth) : TEXT_NO_RISK;
      }
      if (metric === "largest_db_bytes" && extras.largestD1Id) note = `Base: ${extras.largestD1Id}`;
    } else if (period === "monthly") {
      usage = 0;
      for (let day = utcDay(new Date(monthStart)); day <= today; day = shiftDay(day, 1)) {
        usage += valueOn(history, day, product, metric) ?? 0;
      }
      if (limit !== null && usage < limit) {
        const rate = usage / elapsedDays;
        projection = rate > 0 && (limit - usage) / rate <= remainingDays ? projectionText((limit - usage) / rate) : TEXT_NO_RISK;
      }
    } else {
      usage = valueOn(history, today, product, metric) ?? 0;
      peak7 = Math.max(...Array.from({ length: 7 }, (_, i) => valueOn(history, shiftDay(today, -i), product, metric) ?? 0));
      note = TEXT_RESET;
    }

    // The state uses the exact ratio; the displayed percentage is truncated to one decimal, so it never
    // shows a threshold that has not been reached (69.999 % shows as 69.9 %, state "Normal").
    const exactPercent = limit ? (usage / limit) * 100 : null;
    const percent = exactPercent === null ? null : Math.floor(exactPercent * 10) / 10;
    return {
      product,
      productLabel: PRODUCT_LABELS[product],
      metric,
      label: METRIC_LABELS[`${product}:${metric}`] ?? metric,
      period,
      periodLabel: PERIOD_LABELS[period],
      usage,
      limit,
      percent,
      ...state(exactPercent, limits.thresholds),
      peak7,
      note,
      projection,
    };
  });

  const checked = new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${limits.checkedOn}T00:00:00Z`),
  );
  return {
    rows,
    limitsCheckedText: `Límites verificados el ${checked}`,
    unclassifiedText: unclassifiedR2.length
      ? `Operaciones de R2 sin clasificar (contadas como Clase A): ${unclassifiedR2.join(", ")}`
      : null,
  };
}

