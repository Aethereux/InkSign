import { SQL } from "bun";

/**
 * Tests truncate every table, so they must never run against the development database.
 *
 * Preloaded by bunfig.toml before any test file imports db.ts: this derives a sibling
 * `<name>_test` database from DATABASE_URL, creates it if it doesn't exist, and points
 * the rest of the run at it. Without this, `bun test` silently destroys whatever you were
 * looking at in the dev server.
 */
const base = process.env.DATABASE_URL ?? "postgres://postgres:dev@localhost:5432/postgres";
const url = new URL(base);
const name = url.pathname.replace(/^\//, "") || "postgres";

if (!name.endsWith("_test")) {
  const admin = new SQL(base);
  try {
    await admin.unsafe(`CREATE DATABASE "${name}_test"`);
  } catch {
    // Already exists — Postgres has no CREATE DATABASE IF NOT EXISTS.
  }
  await admin.close();
  url.pathname = `/${name}_test`;
  process.env.DATABASE_URL = url.toString();
}
