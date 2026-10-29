import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/ping", (c) => c.json({ ok: true }));

export default app;
