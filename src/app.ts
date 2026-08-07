import { Elysia } from "elysia";
import { PDFDocument } from "pdf-lib";
import { sql, token } from "./db";
import {
  Invalid,
  parsePdf,
  parseRequesterEmail,
  parseSigners,
  parseTitle,
  safeFilename,
} from "./validate";

const PUBLIC_DIR = new URL("../public/", import.meta.url).pathname;

/** Paths the SPA owns. Anything else that isn't a real file is a genuine 404. */
const SPA_ROUTES = [/^\/$/, /^\/d\/[^/]+$/, /^\/s\/[^/]+$/];

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
