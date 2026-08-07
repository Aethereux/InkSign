import { beforeEach, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { app } from "./app";
import { migrate, sql, truncateAll } from "./db";

await migrate();
beforeEach(truncateAll);

const SIG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAL0lEQVR4nO3OsREAIAADoey/tE7hvQUFPdt2PpcHBAXrgKBgHRAUrAOCgnVA8KkLH3QdDiWNv94AAAAASUVORK5CYII=";

async function createRequest(emails = ["ada@acme.com", "grace@acme.com"]) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 4; i++) doc.addPage([600, 800]);
  const form = new FormData();
  form.set("title", "Mutual NDA");
  form.set("requesterEmail", "ops@inksign.app");
  form.set("signers", JSON.stringify(emails.map((email) => ({ email }))));
  form.set("file", new File([new Uint8Array(await doc.save())], "nda.pdf", { type: "application/pdf" }));
  const created = await app
    .handle(new Request("http://localhost/api/documents", { method: "POST", body: form }))
    .then((r) => r.json());
  return {
    ...created,
    tokens: created.signers.map((s: { signUrl: string }) => s.signUrl.slice(3)) as string[],
  };
}

const get = (path: string) => app.handle(new Request(`http://localhost${path}`));

const sign = (token: string, over: Record<string, unknown> = {}) =>
  app.handle(
    new Request(`http://localhost/api/sign/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ada Lovelace",
        signaturePng: SIG,
        printedName: "under",
        placement: { page: 3, x: 0.2, y: 0.6, w: 0.25 },
        ...over,
      }),
    }),
  );

test("signer 1 sees it is their turn; signer 2 sees who they're waiting on", async () => {
  const { tokens } = await createRequest();

  const first = await get(`/api/sign/${tokens[0]}`).then((r) => r.json());
  expect(first).toMatchObject({
    docTitle: "Mutual NDA",
    pageCount: 4,
    yourTurn: true,
    yourStatus: "pending",
    docStatus: "pending",
    waitingOn: null,
    remainingSigners: 2,
  });
  expect(first.position).toEqual({ index: 0, total: 2 });

  const second = await get(`/api/sign/${tokens[1]}`).then((r) => r.json());
  expect(second).toMatchObject({ yourTurn: false, waitingOn: "ada@acme.com" });
});

test("the signer view never leaks another signer's token or the requester's", async () => {
  const created = await createRequest();
  const raw = await get(`/api/sign/${created.tokens[0]}`).then((r) => r.text());
  expect(raw).not.toContain(created.tokens[1]);
  expect(raw).not.toContain(created.requesterToken);
});

test("signing out of turn is refused", async () => {
  const { tokens } = await createRequest();
  const res = await sign(tokens[1]!);
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe("not_your_turn");
});

test("the full two-signer flow completes and accumulates both signatures", async () => {
  const created = await createRequest();
  const [t1, t2] = created.tokens;

  const first = await sign(t1!, { name: "Ada Lovelace" }).then((r) => r.json());
  expect(first).toMatchObject({ status: "signed", docStatus: "pending" });

  // Signer 2's link unlocks only once signer 1 is done.
  const view = await get(`/api/sign/${t2}`).then((r) => r.json());
  expect(view).toMatchObject({ yourTurn: true, remainingSigners: 1 });

  const second = await sign(t2!, { name: "Grace Hopper" }).then((r) => r.json());
  expect(second).toMatchObject({ status: "signed", docStatus: "completed" });

  const dash = await get(`/api/docs/${created.requesterToken}`).then((r) => r.json());
  expect(dash.status).toBe("completed");
  expect(dash.latestVersion).toBe(2); // one version per signature
  expect(dash.hasSignedVersion).toBe(true);
  expect(dash.completedAt).toBeString();
  expect(dash.signers.map((s: { name: string }) => s.name)).toEqual(["Ada Lovelace", "Grace Hopper"]);

  const file = await get(`/api/docs/${created.requesterToken}/file`);
  expect(file.headers.get("content-disposition")).toContain("mutual-nda-signed.pdf");
  const pdf = new Uint8Array(await file.arrayBuffer());
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4);
});

test("signing twice with the same link is refused", async () => {
  const { tokens } = await createRequest(["solo@acme.com"]);
  expect((await sign(tokens[0]!)).status).toBe(200);
  const again = await sign(tokens[0]!);
  expect(again.status).toBe(409);
  expect((await again.json()).error).toBe("already_signed");
});

test("a signed signer sees their own signing time and nothing left to do", async () => {
  const { tokens } = await createRequest(["solo@acme.com"]);
  await sign(tokens[0]!);
  const view = await get(`/api/sign/${tokens[0]}`).then((r) => r.json());
  expect(view).toMatchObject({ yourStatus: "signed", yourTurn: false, docStatus: "completed", remainingSigners: 0 });
  expect(view.signedAt).toBeString();
});

test("the signer file route serves the working PDF and follows the version forward", async () => {
  const { tokens } = await createRequest();
  const before = await get(`/api/sign/${tokens[0]}/file`);
  expect(before.headers.get("content-type")).toBe("application/pdf");
  const beforeBytes = await before.arrayBuffer();

  await sign(tokens[0]!);

  // Signer 2 must receive the copy that already carries signer 1's mark.
  const after = await get(`/api/sign/${tokens[1]}/file`).then((r) => r.arrayBuffer());
  expect(after.byteLength).not.toBe(beforeBytes.byteLength);
});

test.each([
  ["a missing name", { name: "" }, 400, "invalid_name"],
  ["an over-long name", { name: "x".repeat(101) }, 400, "invalid_name"],
  ["a non-PNG signature", { signaturePng: "data:image/jpeg;base64,/9j/4AAQ" }, 400, "invalid_signature"],
  ["a missing signature", { signaturePng: undefined }, 400, "invalid_signature"],
  ["a missing placement", { placement: undefined }, 400, "invalid_placement"],
  ["a non-numeric placement", { placement: { page: "x", y: 1, w: 1 } }, 400, "invalid_placement"],
])("rejects %s", async (_label, over, status, code) => {
  const { tokens } = await createRequest(["solo@acme.com"]);
  const res = await sign(tokens[0]!, over);
  expect(res.status).toBe(status);
  expect((await res.json()).error).toBe(code);
  // A rejected signature must leave the signer untouched.
  const [row] = await sql`SELECT status FROM signers WHERE token = ${tokens[0]}`;
  expect(row.status).toBe("pending");
});

test("an unknown signer token is the same opaque 404 on every route", async () => {
  const bad = "f".repeat(64);
  expect((await get(`/api/sign/${bad}`)).status).toBe(404);
  expect((await get(`/api/sign/${bad}/file`)).status).toBe(404);
  const posted = await sign(bad);
  expect(posted.status).toBe(404);
  expect(await posted.json()).toEqual({ error: "not_found", message: "Not found." });
});

test("a requester token cannot be used to sign", async () => {
  const created = await createRequest();
  expect((await get(`/api/sign/${created.requesterToken}`)).status).toBe(404);
  expect((await sign(created.requesterToken)).status).toBe(404);
});

test("concurrent signatures on the same link produce exactly one", async () => {
  const { tokens } = await createRequest(["solo@acme.com"]);
  const results = await Promise.all([sign(tokens[0]!), sign(tokens[0]!), sign(tokens[0]!)]);
  const codes = results.map((r) => r.status).sort();
  expect(codes.filter((c) => c === 200)).toHaveLength(1);
  expect(codes.filter((c) => c === 409)).toHaveLength(2);

  // And exactly one signed version was written — no lost update.
  const [doc] = await sql`SELECT latest_version FROM documents`;
  expect(doc.latest_version).toBe(1);
});
