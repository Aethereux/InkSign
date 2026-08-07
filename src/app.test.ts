import { afterAll, beforeAll, expect, test } from "bun:test";
import { app } from "./app";
import { migrate, sql, truncateAll } from "./db";

beforeAll(async () => {
  await migrate();
  await truncateAll();
});
afterAll(async () => {
  await sql.close();
});

const get = (path: string) => app.handle(new Request(`http://localhost${path}`));

test("migrate is idempotent and creates the three tables", async () => {
  await migrate(); // second run must not throw
  const rows = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  expect(rows.map((r: { tablename: string }) => r.tablename)).toEqual([
    "document_files",
    "documents",
    "signers",
  ]);
});

test("there is no events table — the audit trail is deliberately absent", async () => {
  const rows = await sql`SELECT 1 FROM pg_tables WHERE tablename = 'events'`;
  expect(rows).toHaveLength(0);
});

test("/health reports ok and proves the database is reachable", async () => {
  const res = await get("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("SPA routes fall back to index.html so a hard refresh works", async () => {
  for (const path of ["/", "/d/abc123", "/s/def456"]) {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  }
});

test("unknown paths 404 rather than serving the SPA", async () => {
  for (const path of ["/nope", "/d/abc/extra", "/api/documents"]) {
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "Not found." });
  }
});

test("built assets are served", async () => {
  const index = await (await get("/")).text();
  const src = /src="(\/assets\/[^"]+)"/.exec(index)?.[1];
  expect(src).toBeString();
  const res = await get(src!);
  expect(res.status).toBe(200);
});
