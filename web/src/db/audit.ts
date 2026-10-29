// Writes to monitor-cbt-audit-db (R6). A failed write never blocks the response (R7).

export type AuditEvent =
  | { email: string; action: "view"; target: string }
  | { email: string; action: "export"; target: string; format: "xlsx" | "pdf" };

/** Records who saw or exported what. Returns false, after logging, if the write failed. */
export async function recordAudit(db: D1Database, event: AuditEvent, now = new Date()): Promise<boolean> {
  try {
    await db
      .prepare("INSERT INTO audit_event (at, email, action, target, format) VALUES (?, ?, ?, ?, ?)")
      .bind(now.toISOString(), event.email, event.action, event.target, event.action === "export" ? event.format : null)
      .run();
    return true;
  } catch (error) {
    // The email is personal data: it is not written to the logs.
    console.error("audit write failed", { action: event.action, target: event.target, error: String(error) });
    return false;
  }
}
