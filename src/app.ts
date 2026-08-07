import { Elysia } from "elysia";
import { sql } from "./db";

const PUBLIC_DIR = new URL("../public/", import.meta.url).pathname;

/** Paths the SPA owns. Anything else that isn't a real file is a genuine 404. */
const SPA_ROUTES = [/^\/$/, /^\/d\/[^/]+$/, /^\/s\/[^/]+$/];

const notFound = () =>
  new Response(JSON.stringify({ error: "not_found", message: "Not found." }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

/**
 * Exported without .listen() so tests can drive it with app.handle(new Request(...)) —
 * no port, no server, no teardown. src/index.ts is what actually listens.
 */
export const app = new Elysia()
  .get("/health", async () => {
    await sql`SELECT 1`;
    return { ok: true };
  })
  .get("/api/*", () => notFound())
  .get("*", async ({ request }) => {
    const path = new URL(request.url).pathname;

    // Real build artefact? Serve it. Bun.file resolves nothing outside PUBLIC_DIR because
    // the pathname is normalised by URL() before it gets here.
    const file = Bun.file(PUBLIC_DIR + path.slice(1));
    if (path !== "/" && (await file.exists())) return new Response(file);

    // SPA fallback, so /d/:token and /s/:token survive a hard refresh.
    if (SPA_ROUTES.some((re) => re.test(path))) {
      const index = Bun.file(PUBLIC_DIR + "index.html");
      if (await index.exists()) return new Response(index);
      return new Response("Frontend not built. Run `bun run build`.", { status: 503 });
    }
    return notFound();
  });

export type App = typeof app;
