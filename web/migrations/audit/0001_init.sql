-- Audit log of data views and exports (docs/DATA_MODEL.md, R6).
CREATE TABLE audit_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'export')),
  target TEXT NOT NULL,
  format TEXT CHECK (format IN ('xlsx', 'pdf')),
  CHECK ((action = 'export') = (format IS NOT NULL))
);

CREATE INDEX audit_event_at ON audit_event (at);
