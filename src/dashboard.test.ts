import { beforeEach, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { app } from "./app";
import { migrate, sql, truncateAll } from "./db";

await migrate();
beforeEach(truncateAll);

async function createRequest(signerEmails = ["ada@acme.com", "grace@acme.com"]) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 4; i++) doc.addPage([600, 800]);
  const form = new FormData();
  form.set("title", "Mutual NDA — Acme × InkSign");
  form.set("requesterEmail", "ops@inksign.app");
  form.set("signers", JSON.stringify(signerEmails.map((email) => ({ email }))));
  form.set(
    "file",
    new File([new Uint8Array(await doc.save())], "nda.pdf", { type: "application/pdf" }),
  );
  const res = await app.handle(
    new Request("http://localhost/api/documents", { method: "POST", body: form }),
  );
  return res.json();
}

const get = (path: string) => app.handle(new Request(`http://localhost${path}`));

test("the dashboard reports everything the screen needs", async () => {
  const created = await createRequest();
  const res = await get(`/api/docs/${created.requesterToken}`);
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.title).toBe("Mutual NDA — Acme × InkSign");
  expect(body.filename).toBe("nda.pdf");
  expect(body.requesterEmail).toBe("ops@inksign.app");
  expect(body.status).toBe("pending");
  expect(body.pageCount).toBe(4);
  expect(body.hasSignedVersion).toBe(false);
  expect(body.latestVersion).toBe(0);
  expect(body.completedAt).toBeNull();
  expect(body.createdAt).toBeString();

  expect(body.signers).toHaveLength(2);
  expect(body.signers[0]).toMatchObject({ email: "ada@acme.com", orderIdx: 0, status: "pending" });
  expect(body.signers[0].signedAt).toBeNull();
  expect(body.signers[0].signUrl).toStartWith("/s/");
});

test("there is no events array — the audit trail is deliberately absent", async () => {
  const created = await createRequest();
  const body = await get(`/api/docs/${created.requesterToken}`).then((r) => r.json());
  expect(body.events).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("userAgent");
  expect(JSON.stringify(body)).not.toContain('"ip"');
});

test("signers come back in signing order regardless of insertion", async () => {
  const created = await createRequest(["c@x.com", "a@x.com", "b@x.com"]);
  const body = await get(`/api/docs/${created.requesterToken}`).then((r) => r.json());
  expect(body.signers.map((s: { email: string }) => s.email)).toEqual([
    "c@x.com",
    "a@x.com",
    "b@x.com",
  ]);
  expect(body.signers.map((s: { orderIdx: number }) => s.orderIdx)).toEqual([0, 1, 2]);
});

test("the download serves the working PDF as an attachment", async () => {
  const created = await createRequest();
  const res = await get(`/api/docs/${created.requesterToken}/file`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  // Nothing signed yet, so the name reflects the version rather than claiming "signed".
  expect(res.headers.get("content-disposition")).toBe(
    'attachment; filename="mutual-nda-acme-inksign-v0.pdf"',
  );
  const pdf = new Uint8Array(await res.arrayBuffer());
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4);
});

test("an unknown requester token is the same opaque 404 everywhere", async () => {
  const bad = "0".repeat(64);
  for (const path of [`/api/docs/${bad}`, `/api/docs/${bad}/file`]) {
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", message: "Not found." });
  }
});

test("a signer token can't be used to reach the dashboard", async () => {
  const created = await createRequest();
  const signerToken = created.signers[0].signUrl.slice(3);
  const res = await get(`/api/docs/${signerToken}`);
  expect(res.status).toBe(404);
});
