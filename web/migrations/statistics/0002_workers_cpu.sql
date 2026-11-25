-- Workers CPU per request (spec 004, docs/DATA_MODEL.md). Every `day` is Cloudflare's UTC day, YYYY-MM-DD.
-- Times come from Cloudflare in microseconds and are stored in milliseconds (R4).

CREATE TABLE workers_cpu_daily (
  day TEXT NOT NULL,
  account_id TEXT NOT NULL,
  -- scriptName; '__unknown__' when Cloudflare gives none.
  script TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK (requests >= 0),
  errors INTEGER NOT NULL CHECK (errors >= 0),
  exceeded_resources INTEGER NOT NULL CHECK (exceeded_resources >= 0),
  cpu_p50_ms REAL CHECK (cpu_p50_ms >= 0),
  cpu_p99_ms REAL CHECK (cpu_p99_ms >= 0),
  cpu_p999_ms REAL CHECK (cpu_p999_ms >= 0),
  wall_p50_ms REAL CHECK (wall_p50_ms >= 0),
  wall_p99_ms REAL CHECK (wall_p99_ms >= 0),
  -- 1 = exact; above 1 = estimated from a sample.
  sample_interval REAL CHECK (sample_interval >= 1),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (day, account_id, script)
);

-- A processed day of an account, even with no invocations, so it is not read again every day.
CREATE TABLE workers_cpu_checked (
  day TEXT NOT NULL,
  account_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (day, account_id)
);
