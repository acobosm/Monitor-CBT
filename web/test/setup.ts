import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.AUDIT_DB, env.TEST_AUDIT_MIGRATIONS);
