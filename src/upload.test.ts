import { beforeEach, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { app } from "./app";
import { migrate, sql, truncateAll } from "./db";

await migrate();
beforeEach(truncateAll);

async function pdfBytes(pages = 4): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([600, 800]);
  return new Uint8Array(await doc.save());
}

type FormOverrides = {
  title?: string | null;
  requesterEmail?: string | null;
  signers?: string | null;
  file?: File | null;
};

async function upload(o: FormOverrides = {}) {
  const form = new FormData();
  const put = (k: string, v: string | null | undefined, fallback: string) => {
    if (v === null) return; // explicit null means "omit this field"
    form.set(k, v ?? fallback);
  };
  put("title", o.title, "Mutual NDA");
  put("requesterEmail", o.requesterEmail, "ops@inksign.app");
  put("signers", o.signers, JSON.stringify([{ email: "ada@acme.com" }, { email: "grace@acme.com" }]));
  if (o.file !== null) {
    form.set("file", o.file ?? new File([await pdfBytes()], "nda.pdf", { type: "application/pdf" }));
  }
  const res = await app.handle(
    new Request("http://localhost/api/documents", { method: "POST", body: form }),
  );
  return { res, body: await res.json() };
}

const counts = async () => ({
  documents: (await sql`SELECT 1 FROM documents`).length,
  files: (await sql`SELECT 1 FROM document_files`).length,
  signers: (await sql`SELECT 1 FROM signers`).length,
});

test("a valid upload is stored and returns links for every signer", async () => {
  const { res, body } = await upload();
  expect(res.status).toBe(201);
  expect(body.pageCount).toBe(4);
  expect(body.requesterUrl).toBe(`/d/${body.requesterToken}`);
  expect(body.signers).toHaveLength(2);
  expect(body.signers[0].orderIdx).toBe(0);
  expect(body.signers[1].email).toBe("grace@acme.com");

  // URLs are relative so the frontend can prefix location.origin.
  for (const s of body.signers) expect(s.signUrl).toStartWith("/s/");
  expect(await counts()).toEqual({ documents: 1, files: 1, signers: 2 });
});

test("the original PDF is stored intact as version 0", async () => {
  const { body } = await upload();
  const [row] = await sql`SELECT pdf FROM document_files WHERE doc_id = ${body.id} AND version_no = 0`;
  const stored = new Uint8Array(row.pdf);
  expect((await PDFDocument.load(stored)).getPageCount()).toBe(4);
});

test("tokens are unguessable and distinct per signer", async () => {
  const { body } = await upload();
  const tokens = [body.requesterToken, ...body.signers.map((s: { signUrl: string }) => s.signUrl.slice(3))];
  expect(new Set(tokens).size).toBe(3);
  for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{64}$/);
});

test("signing order follows the array order given", async () => {
  const { body } = await upload({
    signers: JSON.stringify([{ email: "c@x.com" }, { email: "a@x.com" }, { email: "b@x.com" }]),
  });
  const rows = await sql`SELECT email, order_idx FROM signers WHERE doc_id = ${body.id} ORDER BY order_idx`;
  expect(rows.map((r: { email: string }) => r.email)).toEqual(["c@x.com", "a@x.com", "b@x.com"]);
});

test("every signer starts pending and the document starts pending", async () => {
  const { body } = await upload();
  const [doc] = await sql`SELECT status, latest_version FROM documents WHERE id = ${body.id}`;
  expect(doc.status).toBe("pending");
  expect(doc.latest_version).toBe(0);
  const rows = await sql`SELECT status FROM signers WHERE doc_id = ${body.id}`;
  expect(rows.every((r: { status: string }) => r.status === "pending")).toBe(true);
});

test.each([
  ["a non-PDF file", { file: new File(["just text"], "notes.txt", { type: "text/plain" }) }, "invalid_file"],
  ["a PDF extension with the wrong bytes", { file: new File(["<svg/>"], "x.pdf", { type: "application/pdf" }) }, "invalid_file"],
  ["no file at all", { file: null }, "missing_field"],
  ["no title", { title: null }, "missing_field"],
  ["a blank title", { title: "   " }, "missing_field"],
  ["a malformed requester email", { requesterEmail: "not-an-email" }, "invalid_email"],
  ["a malformed signer email", { signers: JSON.stringify([{ email: "nope" }]) }, "invalid_email"],
  ["an empty signer list", { signers: "[]" }, "invalid_signers"],
  ["more than five signers", { signers: JSON.stringify(Array(6).fill({ email: "a@x.com" })) }, "invalid_signers"],
  ["unparseable signer JSON", { signers: "{oops" }, "invalid_signers"], 
])("rejects %s and stores nothing", async (_label, overrides, code) => {
  const { res, body } = await upload(overrides as FormOverrides);
  expect(res.status).toBe(400);
  expect(body.error).toBe(code);
  expect(body.message).toBeString();
  expect(await counts()).toEqual({ documents: 0, files: 0, signers: 0 });
});

test("an oversized file is rejected by size before it is read", async () => {
  const oversized = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
  const { res, body } = await upload({ file: oversized });
  expect(res.status).toBe(400);
  expect(body.error).toBe("file_too_large");
  expect(body.message).toContain("11.0 MB"); // states the actual size, per the design
  expect(await counts()).toEqual({ documents: 0, files: 0, signers: 0 });
});

test("a filename with path separators can't escape into a path", async () => {
  const file = new File([await pdfBytes(1)], "../../etc/passwd.pdf", { type: "application/pdf" });
  const { body } = await upload({ file });
  const [row] = await sql`SELECT filename FROM documents WHERE id = ${body.id}`;
  expect(row.filename).toBe("passwd.pdf");
});

test("unknown API routes return the same opaque 404 as bad tokens", async () => {
  const res = await app.handle(new Request("http://localhost/api/nope", { method: "POST" }));
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found", message: "Not found." });
});
