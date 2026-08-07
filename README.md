# InkSign

Upload a PDF, send it out for signature, get the signed copy back.

[![CI](https://github.com/Aethereux/InkSign/actions/workflows/ci.yml/badge.svg)](https://github.com/Aethereux/InkSign/actions/workflows/ci.yml)

**Live URL:** _(pending deploy — see [Deployment](#deployment))_

---

## What it does

A requester uploads a PDF and names one or more signers in a signing order. They get back
one unguessable link per signer, plus a dashboard link of their own. Signers open their
link, click where their signature belongs, draw it, and submit. The signed PDF is on the
requester's dashboard the moment the first signature lands.

There are no accounts. The links are the access control.

| | |
|---|---|
| **Create a request** | ![Create a request](docs/screenshots/create.png) |
| **Sign it** — click to place, draw, submit | ![Signing](docs/screenshots/signer.png) |
| **Collect it** — live status and the signed PDF | ![Dashboard](docs/screenshots/dashboard.png) |

Beyond the core flow it does **sequential multi-signer** (signer 2's link stays inert until
signer 1 has signed), **click-to-place signature positioning**, and **live status tracking**.

---

## Run it locally

Bun is the only prerequisite — no Node, no npm. Postgres runs in Docker.

```bash
git clone https://github.com/Aethereux/InkSign.git
cd InkSign
bun install

# Postgres on :5432
docker run -d --name inksign-pg -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16

cp .env.example .env          # defaults already match the container above
bun run dev                   # API + built frontend on http://localhost:3000
```

Open <http://localhost:3000> and create a request. The schema is created on boot; there is
no migration step.

For frontend work, run Vite alongside it for hot reload:

```bash
bun run dev:web               # http://localhost:5173, proxies /api to :3000
```

**Versions used:** Bun 1.3.14, Postgres 16.

## Run the tests

```bash
bun run test        # builds the frontend first, then runs the suite
bun run typecheck
```

63 tests. They cover the signature placement maths, the upload trust boundary (eleven
rejection cases, each asserting nothing was written), the full two-signer flow, out-of-turn
and double-signing refusals, opaque 404s on every token route, and a concurrency test that
fires three simultaneous signatures at one link and asserts exactly one succeeds.

Tests run against real Postgres rather than a stub — the schema and the signing transaction
are exactly what a stub would fail to catch. They truncate every table, so they redirect
themselves to a scratch `<name>_test` database (see `src/test-setup.ts`); your dev data is
safe.

CI runs the same commands on every push, with a `postgres:16` service container.

---

## Architecture

One Bun process serves the JSON API *and* the built frontend — one container, one port, one
URL, no CORS. Elysia handles routing; the frontend is Vite + React + TypeScript.

```
src/
  app.ts        Elysia routes, exported without .listen() so tests drive it via app.handle()
  index.ts      reads PORT + DATABASE_URL, migrates, listens
  db.ts         Bun.sql connection, schema bootstrap, token generation
  geometry.ts   placement maths — shared by the PDF stamp and the browser preview
  sign.ts       pdf-lib stamping
  validate.ts   the upload trust boundary
web/
  screens/      Create (S1/S2), Dashboard (S3), Signer (S4)
  components/   PdfPage, SignaturePad, shared chrome
```

Three decisions worth defending:

**Tokenised links instead of accounts.** Each document mints a 256-bit requester token and
one per signer. Unknown, wrong-type, and non-existent tokens all return an identical opaque
404, so the token space can't be probed. A signer's payload never contains another signer's
token — there's a test for it.

**Incremental multi-signer with no merge step.** Each signature stamps the current working
PDF and stores the result as the next version. The final artifact is simply the last
version, which collapses the hardest part of multi-signer into one already-tested function
and gives version history for free. The read-check-write runs in one transaction with
`SELECT … FOR UPDATE` on both rows; without it two concurrent signers would read the same
version and one signature would overwrite the other.

**One geometry module for both the preview and the stamp.** `src/geometry.ts` has no
dependencies precisely so the browser can import it without bundling a PDF writer. The
preview scales its constants by `renderedWidthPx / pageWidthPt`; the box-height *fraction*
needs no scale at all because it cancels. Had the two sides kept separate copies of these
numbers, signatures would have landed correctly on desktop and visibly wrong on mobile,
where the render scale is roughly 0.6.

PDFs are stored in Postgres as `bytea` rather than on disk, because every free host has an
ephemeral filesystem and a document uploaded on Monday has to still be there on Tuesday.

---

## How this was built

Built with AI tooling, as the brief encourages.

The work went in three passes. First a planning pass that produced
[`docs/DESIGN-HANDOFF.md`](docs/DESIGN-HANDOFF.md) — the data model, API contract, security
model, and test plan, written before any code. That document was then handed to Claude
Design, which produced the visual design and interaction spec in
[`docs/DESIGN-BUNDLE.md`](docs/DESIGN-BUNDLE.md) plus the HTML prototypes in
`docs/design/`. Implementation was done with Claude Code against both documents, committed
feature by feature.

Where the two documents disagreed, the design bundle won, and each disagreement is recorded
in its Deviations section rather than silently resolved. The most significant one: the
audit trail specced upstream was cut during the design pass because it recorded signer IP
addresses and user agents, and that trade is documented rather than quietly dropped.

Every file has been read and reviewed by hand. A few things the review caught and changed:
the signer's PDF fetch was swallowing failures and leaving a blank frame with no
explanation; the placement geometry lived in two places and would have drifted; and the
test suite was truncating the development database on every run.

## Deployment

Render (Docker web service, free tier) + Neon (free Postgres). Both are permanent free
tiers and neither needs a credit card.

1. Create a Neon project and copy the pooled connection string.
2. On Render: New → Web Service → this repo → runtime **Docker** → instance type **Free**.
3. Set `DATABASE_URL` to the Neon string. `PORT` is supplied by Render.

The free instance sleeps after 15 minutes idle, so the first request after a quiet spell
can take up to a minute. A `GET /health` endpoint exists for an uptime pinger to keep it warm.

---

## Deliberately not built

Naming the trade-offs, since each was a decision rather than an oversight.

| Not built | Why |
|---|---|
| Email notifications | Needs an API key and a verified sender domain. Tokenised links and the dashboard already satisfy the "return the signed document" requirement, and there is nothing to expire mid-review |
| Accounts and login | Days of work for a demo that an unguessable link already secures |
| Audit trail | Cut in the design pass: the specced version logged signer IPs and user agents, and the privacy cost wasn't worth the feature. `signers.signed_at` is what the dashboard shows |
| Webhooks | No consumer exists |
| Document expiry | A column and a scheduled job for a demo nobody will leave running |
| Parallel (non-sequential) signing | Sequential is the common real-world case and half the state machine |
| Rate limiting | Single-tenant demo. A real deployment would want it |

## Known limitations

- **This is a visual signature with a timestamp, not cryptographic e-signature PKI.** The
  PDF is not digitally signed and carries no certificate. It records who typed what name
  and when; it does not prove identity. Real e-signature law is a project, not a feature.
- No rate limiting, so the upload endpoint is open to abuse by anyone with the URL.
- Each signature stores a full copy of the PDF. At the 10 MB upload cap and five signers
  that's ~60 MB per document, which fits Neon's free 0.5 GB for a demo but would need
  pruning in earnest.
- Page rotation is handled for 90° multiples only; arbitrary rotations would skew placement.
- The free hosting tier sleeps, so the first request after idle is slow.
