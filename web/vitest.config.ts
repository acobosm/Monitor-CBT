import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const auditMigrations = await readD1Migrations("./migrations/audit");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Dummy values: tests never use the real token or emails from .dev.vars.
          bindings: {
            TEST_AUDIT_MIGRATIONS: auditMigrations,
            CLOUDFLARE_ANALYTICS_TOKEN: "test-token",
            ALLOWED_EMAILS: "owner@example.com",
            LOCAL_ACCESS_BYPASS: "false",
            ACCESS_TEAM_DOMAIN: "https://test-team.cloudflareaccess.com",
            ACCESS_AUD: "test-aud",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
    },
  };
});
