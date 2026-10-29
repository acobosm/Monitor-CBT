// GraphQL queries (sources confirmed by the T3 discovery, docs/DATA_MODEL.md "GraphQL sources").

/**
 * Plan usage of one account for a range of UTC days (at most 32 days per query). One subrequest per
 * account covers the whole backfill window plus today.
 */
export const ACCOUNT_USAGE_QUERY = `query AccountUsage($tag: string!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $tag }) {
      workers: workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { rowsRead rowsWritten }
        dimensions { date }
      }
      d1Storage: d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        max { databaseSizeBytes }
        dimensions { date databaseId }
      }
      r2Ops: r2OperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date actionType }
      }
      r2Storage: r2StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) {
        max { payloadSize metadataSize }
        dimensions { date bucketName }
      }
    }
  }
}`;

export interface AccountUsageData {
  viewer: {
    accounts: {
      workers: { sum: { requests: number }; dimensions: { date: string } }[];
      d1: { sum: { rowsRead: number; rowsWritten: number }; dimensions: { date: string } }[];
      d1Storage: { max: { databaseSizeBytes: number }; dimensions: { date: string; databaseId: string } }[];
      r2Ops: { sum: { requests: number }; dimensions: { date: string; actionType: string } }[];
      r2Storage: { max: { payloadSize: number; metadataSize: number }; dimensions: { date: string; bucketName: string } }[];
    }[];
  };
}
