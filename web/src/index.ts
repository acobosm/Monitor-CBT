import { Hono } from "hono";
import { accessMiddleware, remoteAccessKeys, type AccessVariables, type KeyResolver } from "./access";

export function createApp(resolveKeys: KeyResolver = remoteAccessKeys) {
  const app = new Hono<{ Bindings: Env; Variables: AccessVariables }>();

  app.use("/api/*", accessMiddleware(resolveKeys));

  app.get("/api/ping", (c) => c.json({ ok: true }));

  return app;
}

export default createApp();
