import { Hono } from "hono";
import { accessMiddleware, remoteAccessKeys, type AccessVariables, type KeyResolver } from "./access";
import { runDailyTask } from "./cron";
import { apiRoutes, type ApiDeps } from "./routes/api";

export function createApp(resolveKeys: KeyResolver = remoteAccessKeys, deps: ApiDeps = {}) {
  const app = new Hono<{ Bindings: Env; Variables: AccessVariables }>();

  app.use("/api/*", accessMiddleware(resolveKeys));

  app.get("/api/ping", (c) => c.json({ ok: true }));
  app.route("/api", apiRoutes(deps));

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  // Daily task at 01:00 UTC (R28): the previous UTC day is already closed.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runDailyTask(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
