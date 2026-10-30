// Daily discovery (R41): which datasets the token can read per account and zone, and how far back.
import { ACCOUNT_DATASETS, ZONE_DATASETS, type SettingsData } from "../cloudflare/queries";
import type { DatasetAvailability } from "../db/statistics";

/** Variables of `settingsQuery`: a0… for account IDs, z0… for zone IDs, in config order. */
export function settingsVariables(accountIds: string[], zoneTags: string[]): Record<string, string> {
  return Object.fromEntries([
    ...accountIds.map((tag, i) => [`a${i}`, tag]),
    ...zoneTags.map((tag, i) => [`z${i}`, tag]),
  ]);
}

/** Rows for `dataset_availability`. A dataset missing from the answer counts as disabled. */
export function parseSettings(data: SettingsData, accountIds: string[], zoneTags: string[]): DatasetAvailability[] {
  const rows = (scope: "account" | "zone", prefix: string, tags: string[], datasets: readonly string[]) =>
    tags.flatMap((tag, i) =>
      datasets.map((dataset): DatasetAvailability => {
        const s = data.viewer[`${prefix}${i}`]?.[0]?.settings[dataset];
        return { scope, tag, dataset, enabled: s?.enabled === true, notOlderThanS: s?.notOlderThan ?? null, maxDurationS: s?.maxDuration ?? null };
      }),
    );
  return [...rows("account", "a", accountIds, ACCOUNT_DATASETS), ...rows("zone", "z", zoneTags, ZONE_DATASETS)];
}
