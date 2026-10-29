-- Daily statistics (docs/DATA_MODEL.md). Every `day` is Cloudflare's UTC day, YYYY-MM-DD.

CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  account_id TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('workers', 'd1', 'r2')),
  metric TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (day, account_id, product, metric)
);

CREATE TABLE traffic_daily (
  day TEXT NOT NULL,
  site_id TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK (requests >= 0),
  visits INTEGER NOT NULL CHECK (visits >= 0),
  page_views INTEGER CHECK (page_views >= 0),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (day, site_id)
);

CREATE TABLE country_daily (
  day TEXT NOT NULL,
  site_id TEXT NOT NULL,
  country TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK (requests >= 0),
  PRIMARY KEY (day, site_id, country)
);

-- Visitor IPs are personal data: top 20 per site, day and kind (R29), deleted after 13 months (R32).
CREATE TABLE ip_daily (
  day TEXT NOT NULL,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('traffic', 'security')),
  ip TEXT NOT NULL,
  country TEXT,
  action TEXT,
  requests INTEGER NOT NULL CHECK (requests >= 0),
  last_seen_hour TEXT,
  PRIMARY KEY (day, site_id, kind, ip),
  CHECK ((kind = 'security' AND action IN ('block', 'challenge')) OR (kind = 'traffic' AND action IS NULL))
);

CREATE TABLE dataset_availability (
  scope TEXT NOT NULL CHECK (scope IN ('zone', 'account')),
  tag TEXT NOT NULL,
  dataset TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  not_older_than_s INTEGER,
  max_duration_s INTEGER,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (scope, tag, dataset)
);
