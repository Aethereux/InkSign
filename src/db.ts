import { SQL } from "bun";

const DEFAULT_URL = "postgres://postgres:dev@localhost:5432/postgres";

export const sql = new SQL(process.env.DATABASE_URL ?? DEFAULT_URL);

/**
 * Schema bootstrap. Runs on every boot; `IF NOT EXISTS` makes it idempotent.
 * There is deliberately no migration tool — the schema is small and never versioned.
 *
 * There is no `events` table: the audit trail was cut because it logged signer IPs and
 * user agents. Nothing in this app records either.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS documents (
     id              TEXT PRIMARY KEY,
     title           TEXT NOT NULL,
     filename        TEXT NOT NULL,
     requester_email TEXT NOT NULL,
     requester_token TEXT NOT NULL UNIQUE,
     status          TEXT NOT NULL DEFAULT 'pending',
     page_count      INTEGER NOT NULL,
     latest_version  INTEGER NOT NULL DEFAULT 0,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     completed_at    TIMESTAMPTZ
   )`,
  // version 0 is the original upload; version N is the PDF after N signatures.
  `CREATE TABLE IF NOT EXISTS document_files (
     doc_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     version_no INTEGER NOT NULL,
     pdf        BYTEA NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (doc_id, version_no)
   )`,
  `CREATE TABLE IF NOT EXISTS signers (
     id         TEXT PRIMARY KEY,
     doc_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     email      TEXT NOT NULL,
     name       TEXT,
     order_idx  INTEGER NOT NULL,
     token      TEXT NOT NULL UNIQUE,
     status     TEXT NOT NULL DEFAULT 'pending',
     signed_at  TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_signers_doc ON signers (doc_id, order_idx)`,
];

export async function migrate(): Promise<void> {
  for (const stmt of SCHEMA) await sql.unsafe(stmt);
}

/** Wipes every table. Tests only — never called from the app. */
export async function truncateAll(): Promise<void> {
  await sql.unsafe(`TRUNCATE documents, document_files, signers CASCADE`);
}

/** 256 bits of entropy, hex. This is the entire access-control model — never Math.random(). */
export function token(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
}
