// Cache of live Cloudflare reads, in the Worker's memory and per isolate: the Cache API is not available
// for Workers fronted by Access. Losing an entry only costs one more query. Failures are never cached.

/** How long a current-day read is reused (300 GraphQL queries per 5 minutes). */
export const LIVE_TTL_MS = 60_000;
/** How long a read of complete past days is reused: they barely change, and charts read many of them. */
export const PAST_TTL_MS = 3_600_000;

export class TtlCache {
  private entries = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(private readonly ttlMs = LIVE_TTL_MS) {}

  /** Returns the live value for `key`, or loads it; concurrent readers share one load. */
  get<T>(key: string, nowMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > nowMs) return hit.value as Promise<T>;
    for (const [k, entry] of this.entries) if (entry.expires <= nowMs) this.entries.delete(k);

    const value = load();
    this.entries.set(key, { expires: nowMs + this.ttlMs, value });
    value.catch(() => this.entries.delete(key));
    return value;
  }
}
