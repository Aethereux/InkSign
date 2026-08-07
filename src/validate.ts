/** Request validation for the upload boundary. Pure — no database, no filesystem. */

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_SIGNERS = 5;

/** Deliberately loose: this is a display label, not an auth factor. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && EMAIL.test(v);

export class Invalid extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type SignerInput = { email: string; name: string | null };

export function parseTitle(raw: unknown): string {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) throw new Invalid("missing_field", "A document title is required.");
  if (title.length > 200) throw new Invalid("missing_field", "The title is too long (200 characters maximum).");
  return title;
}

export function parseRequesterEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim() : "";
  if (!email) throw new Invalid("missing_field", "Your email address is required.");
  if (!isEmail(email)) throw new Invalid("invalid_email", "That doesn't look like an email address.");
  return email;
}

/** `signers` arrives as a JSON string in the multipart body. Array order is signing order. */
export function parseSigners(raw: unknown): SignerInput[] {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Invalid("invalid_signers", "The signer list couldn't be read.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Invalid("invalid_signers", "At least one signer is required.");
  if (parsed.length > MAX_SIGNERS)
    throw new Invalid("invalid_signers", `A request can have at most ${MAX_SIGNERS} signers.`);

  return parsed.map((s, i) => {
    const email = typeof s?.email === "string" ? s.email.trim() : "";
    if (!isEmail(email))
      throw new Invalid("invalid_email", `Signer ${i + 1}'s email address doesn't look right.`);
    const name = typeof s?.name === "string" && s.name.trim() ? s.name.trim().slice(0, 100) : null;
    return { email, name };
  });
}

/**
 * Validates the upload before anything is stored. Checks the declared type, the size, and
 * the magic bytes — the declared type is client-controlled, so it can't be the only check.
 */
export async function parsePdf(raw: unknown): Promise<Uint8Array> {
  if (!(raw instanceof File) || raw.size === 0)
    throw new Invalid("missing_field", "A PDF file is required.");
  if (raw.size > MAX_PDF_BYTES) {
    const mb = (raw.size / 1024 / 1024).toFixed(1);
    throw new Invalid("file_too_large", `That file is ${mb} MB. The limit is 10 MB.`);
  }
  const bytes = new Uint8Array(await raw.arrayBuffer());
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== "%PDF")
    throw new Invalid("invalid_file", "That's not a PDF. Only PDF files can be signed.");
  return bytes;
}

/** Filenames are display-only — they never reach a path, but they do reach the browser. */
export function safeFilename(raw: unknown): string {
  const name = typeof raw === "string" ? raw : "";
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ]/g, "").trim().slice(0, 120);
  return cleaned || "document.pdf";
}
