declare namespace Cloudflare {
  interface Env {
    TEST_AUDIT_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
