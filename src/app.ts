import { Elysia } from "elysia";
import { PDFDocument } from "pdf-lib";
import { sql, token } from "./db";
import { applySignature, decodePngDataUrl } from "./sign";
import {
  Invalid,
  parsePdf,
  parsePlacement,
  parsePrintedName,
  parseSignerName,
  parseRequesterEmail,
  parseSigners,
  parseTitle,
  safeFilename,
} from "./validate";

const PUBLIC_DIR = new URL("../public/", import.meta.url).pathname;

/** Paths the SPA owns. Anything else that isn't a real file is a genuine 404. */
const SPA_ROUTES = [/^\/$/, /^\/new$/, /^\/d\/[^/]+$/, /^\/s\/[^/]+$/];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * One opaque 404 for unknown, wrong-type and non-existent tokens alike. Distinguishing them
 * would turn the token space into something enumerable.
 */
const notFound = () => json({ error: "not_found", message: "Not found." }, 404);

const fail = (e: unknown) =>
  e instanceof Invalid
    ? json({ error: e.code, message: e.message }, e.status)
    : json({ error: "server_error", message: "Something went wrong. Nothing was saved." }, 500);


/** Filename-safe slug for the download; never used as a path, only a Content-Disposition. */
const slug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document";

type DocRow = {
  id: string;
  title: string;
  filename: string;
  requester_email: string;
  status: string;
  page_count: number;
  latest_version: number;
  created_at: Date;
  completed_at: Date | null;
};

type SignerRow = {
  id: string;
  doc_id: string;
  email: string;
  name: string | null;
  order_idx: number;
  status: string;
  signed_at: Date | null;
};

const docByRequesterToken = async (token: string): Promise<DocRow | null> => {
  const [row] = await sql`SELECT * FROM documents WHERE requester_token = ${token}`;
  return (row as DocRow) ?? null;
};

/** The working PDF: the latest signed version, or the original if nobody has signed. */
const workingPdf = async (docId: string, version: number): Promise<Uint8Array<ArrayBuffer> | null> => {
  const [row] = await sql`
    SELECT pdf FROM document_files WHERE doc_id = ${docId} AND version_no = ${version}`;
  return row ? new Uint8Array(row.pdf) : null;
};


/**
 * The signer's own view. Returns only what this signer may know — never another signer's
 * token, and never the requester's.
 */
const signerView = async (token: string) => {
  const [row] = await sql`SELECT * FROM signers WHERE token = ${token}`;
  if (!row) return null;
  const s = row as SignerRow;

  const [doc] = await sql`SELECT * FROM documents WHERE id = ${s.doc_id}`;
  if (!doc) return null;
  const d = doc as DocRow;

  const all = await sql`
    SELECT email, order_idx, status FROM signers WHERE doc_id = ${s.doc_id} ORDER BY order_idx`;
  const ahead = all.filter(
    (o: { order_idx: number; status: string }) => o.order_idx < s.order_idx && o.status !== "signed",
  );

  return json({
    docTitle: d.title,
    filename: d.filename,
    pageCount: d.page_count,
    docStatus: d.status,
    yourStatus: s.status,
    yourTurn: s.status === "pending" && ahead.length === 0,
    waitingOn: ahead[0]?.email ?? null,
    position: { index: s.order_idx, total: all.length },
    remainingSigners: all.filter((o: { status: string }) => o.status !== "signed").length,
    signedAt: s.signed_at,
  });
};

/**
 * Exported without .listen() so tests can drive it with app.handle(new Request(...)) —
 * no port, no server, no teardown. src/index.ts is what actually listens.
 */
export const app = new Elysia()
  .get("/health", async () => {
    await sql`SELECT 1`;
    return { ok: true };
  })

  .post("/api/documents", async ({ body }) => {
    const form = (body ?? {}) as Record<string, unknown>;
    try {
      // Validate everything before touching the database, so a bad request stores nothing.
      const title = parseTitle(form.title);
      const requesterEmail = parseRequesterEmail(form.requesterEmail);
      const signers = parseSigners(form.signers);
      const pdf = await parsePdf(form.file);
      const filename = safeFilename(form.file instanceof File ? form.file.name : "");

      let pageCount: number;
      try {
        pageCount = (await PDFDocument.load(pdf)).getPageCount();
      } catch {
        throw new Invalid("invalid_file", "That PDF couldn't be read. It may be corrupt or password-protected.");
      }

      const id = crypto.randomUUID();
      const requesterToken = token();
      const rows = signers.map((s, i) => ({ ...s, id: crypto.randomUUID(), token: token(), orderIdx: i }));

      await sql.begin(async (tx) => {
        await tx`INSERT INTO documents ${tx({
          id,
          title,
          filename,
          requester_email: requesterEmail,
          requester_token: requesterToken,
          page_count: pageCount,
        })}`;
        await tx`INSERT INTO document_files ${tx({ doc_id: id, version_no: 0, pdf: Buffer.from(pdf) })}`;
        for (const r of rows) {
          await tx`INSERT INTO signers ${tx({
            id: r.id,
            doc_id: id,
            email: r.email,
            name: r.name,
            order_idx: r.orderIdx,
            token: r.token,
          })}`;
        }
      });

      // Relative URLs — the frontend prefixes location.origin, so this stays correct on
      // localhost, on onrender.com, and behind any future domain without an env var.
      return json(
        {
          id,
          title,
          pageCount,
          requesterToken,
          requesterUrl: `/d/${requesterToken}`,
          signers: rows.map((r) => ({ email: r.email, orderIdx: r.orderIdx, signUrl: `/s/${r.token}` })),
        },
        201,
      );
    } catch (e) {
      return fail(e);
    }
  })

  .get("/api/docs/:requesterToken", async ({ params }) => {
    const doc = await docByRequesterToken(params.requesterToken);
    if (!doc) return notFound();

    const signers = await sql`
      SELECT id, email, name, order_idx, token, status, signed_at
      FROM signers WHERE doc_id = ${doc.id} ORDER BY order_idx`;

    return json({
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      requesterEmail: doc.requester_email,
      status: doc.status,
      pageCount: doc.page_count,
      latestVersion: doc.latest_version,
      hasSignedVersion: doc.latest_version > 0,
      createdAt: doc.created_at,
      completedAt: doc.completed_at,
      // signUrl is returned here and nowhere else: the requester is the one who has to
      // distribute the links, and no signer route ever exposes another signer's token.
      signers: signers.map((s: Record<string, unknown>) => ({
        email: s.email,
        name: s.name,
        orderIdx: s.order_idx,
        status: s.status,
        signedAt: s.signed_at,
        signUrl: `/s/${s.token}`,
      })),
    });
  })

  .get("/api/docs/:requesterToken/file", async ({ params }) => {
    const doc = await docByRequesterToken(params.requesterToken);
    if (!doc) return notFound();

    const pdf = await workingPdf(doc.id, doc.latest_version);
    if (!pdf) return notFound();

    const suffix = doc.status === "completed" ? "signed" : `v${doc.latest_version}`;
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${slug(doc.title)}-${suffix}.pdf"`,
      },
    });
  })

  .get("/api/sign/:token", async ({ params }) => {
    const view = await signerView(params.token);
    return view ?? notFound();
  })

  .get("/api/sign/:token/file", async ({ params }) => {
    const [signer] = await sql`SELECT doc_id FROM signers WHERE token = ${params.token}`;
    if (!signer) return notFound();
    const [doc] = await sql`SELECT latest_version FROM documents WHERE id = ${signer.doc_id}`;
    const pdf = doc ? await workingPdf(signer.doc_id, doc.latest_version) : null;
    if (!pdf) return notFound();
    return new Response(pdf, {
      headers: { "content-type": "application/pdf", "content-disposition": "inline" },
    });
  })

  .post("/api/sign/:token", async ({ params, body }) => {
    try {
      const input = (body ?? {}) as Record<string, unknown>;
      // Validate before opening the transaction — no point holding a row lock to find out
      // the signature isn't a PNG.
      const name = parseSignerName(input.name);
      const printedName = parsePrintedName(input.printedName);
      const placement = parsePlacement(input.placement);
      let png: Uint8Array;
      try {
        png = decodePngDataUrl(String(input.signaturePng ?? ""));
      } catch (e) {
        throw new Invalid("invalid_signature", (e as Error).message);
      }

      const result = await sql.begin(async (tx) => {
        // FOR UPDATE on both rows: two signers racing the same document would otherwise
        // both read the same latest_version and one signature would overwrite the other.
        const [signer] = await tx`
          SELECT * FROM signers WHERE token = ${params.token} FOR UPDATE`;
        if (!signer) throw new Invalid("not_found", "Not found.", 404);
        const s = signer as SignerRow;

        if (s.status === "signed")
          throw new Invalid("already_signed", "You have already signed this document.", 409);

        const [{ waiting }] = await tx`
          SELECT COUNT(*)::int AS waiting FROM signers
          WHERE doc_id = ${s.doc_id} AND order_idx < ${s.order_idx} AND status <> 'signed'`;
        if (waiting > 0)
          throw new Invalid("not_your_turn", "It isn't your turn to sign yet.", 409);

        const [docRow] = await tx`SELECT * FROM documents WHERE id = ${s.doc_id} FOR UPDATE`;
        const doc = docRow as DocRow;
        const [file] = await tx`
          SELECT pdf FROM document_files
          WHERE doc_id = ${doc.id} AND version_no = ${doc.latest_version}`;
        if (!file) throw new Invalid("not_found", "Not found.", 404);

        // ponytail: stamping runs inside the transaction, so the row lock is held for the
        // duration. Fine at this scale; move it outside with an optimistic version check
        // if documents ever get big enough for that to matter.
        const stamped = await applySignature({
          pdf: new Uint8Array(file.pdf),
          signaturePng: png,
          placement,
          name,
          printedName,
        });

        const version = doc.latest_version + 1;
        await tx`INSERT INTO document_files ${tx({
          doc_id: doc.id,
          version_no: version,
          pdf: Buffer.from(stamped),
        })}`;

        const signedAt = new Date();
        await tx`
          UPDATE signers SET status = 'signed', name = ${name}, signed_at = ${signedAt}
          WHERE id = ${s.id}`;

        const [{ remaining }] = await tx`
          SELECT COUNT(*)::int AS remaining FROM signers
          WHERE doc_id = ${doc.id} AND status <> 'signed'`;
        const complete = remaining === 0;

        await tx`
          UPDATE documents
          SET latest_version = ${version},
              status = ${complete ? "completed" : "pending"},
              completed_at = ${complete ? signedAt : null}
          WHERE id = ${doc.id}`;

        return { status: "signed", docStatus: complete ? "completed" : "pending", signedAt };
      });

      return json(result);
    } catch (e) {
      return fail(e);
    }
  })

  .all("/api/*", () => notFound())

  .get("*", async ({ request }) => {
    const path = new URL(request.url).pathname;

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
