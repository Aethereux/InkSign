# InkSign — Design & Implementation Handoff

> ✅ **RESOLVED 2026-08-07 — read this first.** Two decisions override what follows:
> **(1) Hosting is Render free + Neon free Postgres, not Fly.io** — Fly killed its free
> tier. §2, §4, §12 and §15 below are already updated. **(2) The audit trail is cut**
> per the design pass — no `events` table, no `ip`/`user_agent` logging anywhere.
> Where this document and `DESIGN-BUNDLE.md` disagree, **the design bundle wins**.

> **Audience:** Claude Design, working interactively to design and implement this app.
> **Author:** upstream planning pass. **Status:** decisions locked, ready to build.
> **Return artifact:** see §14 — a pass-off file back to implementation/review.

---

## 1. Mission

Build **InkSign**, an e-signing web app, as a take-home for a Software Developer Intern
role. A requester uploads a PDF and sends it out for signature; one or more signers open
it, apply a signature, and submit; the signed document comes back to the requester.

### 1.1 Verbatim requirements from the assignment

| # | Requirement |
|---|---|
| R1 | **Upload & Request Signature** — a requester can upload a PDF and send it out for signing |
| R2 | **Sign the Document** — the signer can open the document, apply their signature, and submit it |
| R3 | **Return the Signed Document** — the app must deliver the signed document back to the original requester (email, shareable link, dashboard, or any creative mechanism) |
| R4 | **Backend** — must use Elysia JS running on Bun |
| R5 | **Frontend** — must use Vite (React/Vue/Svelte/…) or Next.js |
| R6 | **Testing** — must include unit tests configured to run in GitHub Actions |
| R7 | **Deployment** — required; a live URL must be shareable |
| R8 | Creativity encouraged: multi-signer, audit trails, verification, notifications, drag-and-drop placement, auth, expiration, status tracking, webhooks |

### 1.2 What is actually being graded

This is an intern take-home. The reviewer will spend maybe ten minutes. They are checking:
does the live URL work end to end on the first try; is the stack what was asked for; do the
tests actually run in CI; does the thing feel considered rather than scaffolded. A tight,
polished core flow beats a broad, half-working feature list. **Optimise for a flawless
happy path and honest handling of the sad paths.**

### 1.3 Submission guidelines (verbatim, and what they imply)

> Document your work and commit it to a new Git repository. We highly encourage you to
> leverage AI coding agents / harnesses such as Claude Code, Codex, OpenCode, Pi Agent, or
> any similar tool to build and complete this assessment — we want to see how effectively
> you can collaborate with modern AI tooling to ship working software. That said, please
> ensure that you thoroughly review, understand, and validate all output before submitting;
> you are fully accountable for the code you turn in. Each submission must include a README
> with clear instructions on how to run the project locally.

Four hard obligations fall out of this, and they are graded:

| G1 | **A new Git repo with a real commit history.** Not one `Initial commit` containing 40 files. Commit in logical units as the build progresses — schema, API, signing engine, signer UI, dashboard, tests, CI, deploy — with messages that say what changed and why. The history is a work sample; a single squashed blob reads as "an agent generated this and nobody looked." |
| G2 | **AI collaboration is expected, and showing it is a plus.** They explicitly want to see it. The README gets a short "How this was built" section naming the tools used and what the human directed vs. what was generated. Do not hide it, and do not overclaim it either. |
| G3 | **Accountability.** The submitter must be able to explain any line of this on a call. Anything the author can't defend should be deleted, not shipped. This is a real constraint on the design: it argues *against* clever abstractions and *for* the boring, readable version everywhere. It also means no dependency goes in that the author can't justify. |
| G4 | **A README with clear local-run instructions** that work from a cold `git clone`. See §17 — this is a deliverable, not documentation debt. |

G3 is the one with teeth. It reinforces every laziness call in this document: fewer files,
fewer dependencies, no speculative layers. **If a piece of this build can't be explained in
two sentences by the person submitting it, it is the wrong piece.** After implementation,
the author does a full read-through pass of every file and a manual end-to-end run before
the repo is shared.

---

## 2. Locked decisions

These are settled. Do not relitigate them; build against them.

| Decision | Choice | Why |
|---|---|---|
| Runtime / backend | Bun + Elysia | R4 |
| Frontend | Vite + React + TypeScript | R5; React because the reviewer pool knows it |
| Persistence | **Neon Postgres** via `Bun.sql` (built into Bun 1.3); PDF bytes stored as `bytea` | Every free host has an ephemeral disk, so files-on-disk lose data on restart. `Bun.sql` is in the runtime — zero new dependencies |
| Hosting | **Render free web service** (Docker, Bun), one process serving API + frontend | $0, no credit card, permanent tier. Fly.io's free tier no longer exists |
| Return mechanism (R3) | **Unguessable tokenised links + requester dashboard** | Explicitly permitted by R3; no email provider, no API keys, nothing to expire mid-review |
| Auth | **None.** Tokens are the entire access control model | Accounts are a big build for a demo that a link already secures |
| Extras being built | Multi-signer (sequential), click-to-place signature, live status tracking | Chosen from R8. **The audit trail was cut** in the design pass on privacy grounds — see `DESIGN-BUNDLE.md` Deviation #2 |
| Extras explicitly cut | Email sending, webhooks, document expiration, cryptographic verification, accounts, **audit trail** | See §13 |

**Serving model:** one Bun process serves both the JSON API and the built frontend. One
container, one port, one URL. No CORS, no separate frontend host.

---

## 3. Repo layout

```
InkSign/                     # the git repo root
├─ package.json              # scripts: dev, dev:web, build, start, test
├─ tsconfig.json
├─ vite.config.ts            # root: 'web', build.outDir: '../public', /api proxy → :3000
├─ src/
│  ├─ index.ts               # reads PORT + DATABASE_URL, starts the server
│  ├─ app.ts                 # the Elysia instance — exported unlistened, so tests can call app.handle()
│  ├─ db.ts                  # Bun.sql connection + schema bootstrap + query helpers
│  ├─ sign.ts                # PDF stamping (pure, no I/O) — draft exists, see §6
│  ├─ sign.test.ts           # unit tests for the stamping math
│  └─ flow.test.ts           # end-to-end API tests through app.handle()
├─ web/
│  ├─ index.html
│  ├─ main.tsx               # mount + the pathname switch
│  ├─ api.ts                 # thin typed fetch wrapper
│  ├─ screens/               # one file per screen in §9
│  ├─ components/            # SignaturePad, PdfCanvas, StatusPill, SignerTable, …
│  └─ styles.css             # design tokens + base styles (§10)
├─ public/                   # vite build output, gitignored, served by Elysia in prod
├─ .github/workflows/ci.yml
├─ Dockerfile
├─ .dockerignore
├─ render.yaml
├─ .gitignore
├─ README.md                 # the graded deliverable — see §17
└─ docs/                     # DESIGN-HANDOFF.md, DESIGN-BUNDLE.md, design/*.dc.html
```

**Critical detail:** `src/app.ts` must export the Elysia instance *without* calling
`.listen()`. `src/index.ts` imports it and listens. This is what lets `flow.test.ts` drive
the real routes via `app.handle(new Request(...))` with no port, no server, no teardown.

---

## 4. Data model

**Postgres on Neon**, reached through `Bun.sql` — the client built into Bun 1.3, so this
adds **no dependency**. Create the schema on boot with `CREATE TABLE IF NOT EXISTS`; there
is no migration tool and this app does not need one.

```sql
CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,       -- crypto.randomUUID()
  title           TEXT NOT NULL,
  filename        TEXT NOT NULL,          -- display only, never used in a path
  requester_email TEXT NOT NULL,
  requester_token TEXT NOT NULL UNIQUE,   -- 32 random bytes, hex
  status          TEXT NOT NULL,          -- 'pending' | 'completed'
  page_count      INTEGER NOT NULL,
  latest_version  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- version 0 is the original upload; version N is the PDF after N signatures.
CREATE TABLE IF NOT EXISTS document_files (
  doc_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  pdf        BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, version_no)
);

CREATE TABLE IF NOT EXISTS signers (
  id         TEXT PRIMARY KEY,
  doc_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  name       TEXT,                         -- null until they sign; typed at signing time
  order_idx  INTEGER NOT NULL,             -- 0-based signing order
  token      TEXT NOT NULL UNIQUE,         -- 32 random bytes, hex
  status     TEXT NOT NULL,                -- 'pending' | 'signed'
  signed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signers_doc ON signers(doc_id, order_idx);
```

**There is no `events` table.** The audit trail was cut in the design pass
(`DESIGN-BUNDLE.md` Deviation #2). Do not log `ip` or `user_agent` anywhere in this
application. `signers.signed_at` is the only timestamp the UI reads.

PDFs live in Postgres as `bytea` rather than on disk because every free host has an
ephemeral filesystem. Neon's free tier is 0.5 GB and each version is a full copy, so a
10 MB document with 5 signers costs ~60 MB.
`ponytail: full-copy versions, cap uploads at 10 MB and prune old versions if storage bites.`

### 4.1 The multi-signer rule

Signing is **sequential and incremental**.

- The **working PDF** is `document_files` at `documents.latest_version`.
- Signer `N`'s link is live only when every signer with `order_idx < N` has `status='signed'`.
- Each signature: load the working PDF → stamp it → insert it as `latest_version + 1` →
  bump `documents.latest_version`. Earlier versions stay (this is what the dashboard's
  "Current version · v1" label reads, and it means a failed stamp never destroys the
  previous good state).
- **Do all of that in one transaction**, and re-check inside it that the signer is still
  `pending` and still next in line. Two signers racing on the same link would otherwise
  both read `pending` and both stamp — the 409 path in §5 only holds if the check and the
  write are atomic.
- When the last signer signs, `documents.status` flips to `completed` and `completed_at` is set.

There is **no merge step at the end**. The final artifact is simply the last working PDF.
This is the whole reason to do it incrementally — it collapses the hardest part of
multi-signer into one already-tested function.

---

## 5. API contract

All responses are JSON except the two file endpoints. All errors use the shape
`{ "error": "<machine_code>", "message": "<human sentence>" }`.

### `POST /api/documents`

`multipart/form-data`.

| Field | Type | Rules |
|---|---|---|
| `file` | File | required, `application/pdf`, first 4 bytes must be `%PDF`, ≤ 10 MB |
| `title` | string | required, 1–200 chars, trimmed |
| `requesterEmail` | string | required, must match the email regex in §7 |
| `signers` | JSON string | required, array of `{ "email": string, "name"?: string }`, 1–5 entries, order in the array **is** the signing order |

**201**
```json
{
  "id": "9f1c…",
  "title": "NDA - Acme",
  "requesterToken": "3b7e…",
  "requesterUrl": "/d/3b7e…",
  "pageCount": 4,
  "signers": [
    { "email": "a@x.com", "orderIdx": 0, "signUrl": "/s/a1b2…" },
    { "email": "b@x.com", "orderIdx": 1, "signUrl": "/s/c3d4…" }
  ]
}
```

Errors: `400 invalid_file` (not a PDF / unparseable), `400 file_too_large`,
`400 invalid_signers`, `400 invalid_email`, `400 missing_field`.

> Return **relative** URLs. The frontend prefixes `location.origin` when it displays them.
> This keeps the server correct on localhost, on `*.onrender.com`, and behind any future domain
> without an env var.

---

### `GET /api/sign/:token`

The signer's view state. Read-only — it records nothing.

**200**
```json
{
  "docTitle": "NDA - Acme",
  "pageCount": 4,
  "yourTurn": true,
  "yourStatus": "pending",
  "docStatus": "pending",
  "position": { "index": 0, "total": 2 },
  "waitingOn": null,
  "signedAt": null
}
```

- `yourTurn: false` + `waitingOn: "a@x.com"` → the "not your turn yet" state (§9, S4-a).
- `yourStatus: "signed"` → the "already signed" state (§9, S4-e).

Errors: `404 not_found` for any unknown token. **Never** distinguish "no such token" from
"expired" or "wrong type of token" — one opaque 404 for all of them.

---

### `GET /api/sign/:token/file`

Returns the current working PDF. `Content-Type: application/pdf`,
`Content-Disposition: inline`. Errors: `404 not_found`.

---

### `POST /api/sign/:token`

`application/json`.

```json
{
  "name": "Ada Lovelace",
  "signaturePng": "data:image/png;base64,iVBORw0KGgo…",
  "placement": { "page": 2, "x": 0.31, "y": 0.68, "w": 0.25 }
}
```

**200** → `{ "status": "signed", "docStatus": "completed", "signedAt": "2026-08-07T…" }`

Errors:
- `404 not_found` — unknown token
- `409 not_your_turn` — an earlier signer hasn't signed
- `409 already_signed` — this signer already signed
- `400 invalid_signature` — not a base64 PNG data URL, bad magic bytes, or > 2 MB
- `400 invalid_name` — empty or > 100 chars
- `400 invalid_placement` — non-numeric fields

> Out-of-range placement numbers are **clamped, not rejected** — a signature 2 px off the
> page edge should land on the edge, not throw away the signer's work.

---

### `GET /api/docs/:requesterToken`

The dashboard payload.

**200**
```json
{
  "id": "9f1c…",
  "title": "NDA - Acme",
  "status": "pending",
  "createdAt": "2026-08-07T10:00:00.000Z",
  "completedAt": null,
  "pageCount": 4,
  "hasSignedVersion": true,
  "signers": [
    { "email": "a@x.com", "name": "Ada Lovelace", "orderIdx": 0, "status": "signed",
      "signedAt": "2026-08-07T10:12:00.000Z", "signUrl": "/s/a1b2…" },
    { "email": "b@x.com", "name": null, "orderIdx": 1, "status": "pending",
      "signedAt": null, "signUrl": "/s/c3d4…" }
  ],
  "latestVersion": 1
}
```

**No `events` array** — the audit trail was cut (`DESIGN-BUNDLE.md` Deviation #2).
Errors: `404 not_found`.

---

### `GET /api/docs/:requesterToken/file`

Downloads the working PDF, `Content-Disposition: attachment; filename="<slug>-signed.pdf"`.
Errors: `404 not_found`.

---

### `GET /*` (static)

Serve `public/`. **Any unmatched non-`/api` path falls back to `public/index.html`** so
`/d/:token` and `/s/:token` survive a hard refresh. Get this right — a reviewer refreshing
the signer page and getting a 404 is the single most likely way this demo dies.

---

## 6. The signing engine — `src/sign.ts`

Pure functions, no filesystem, no database. This is the most test-worthy code in the repo
and the only place with real math. **No code exists yet; this is the contract to build to.**

> ⚠️ `DESIGN-BUNDLE.md` Deviation #3 changes this: the `name — ISO8601 — doc <id>` caption
> in §6.1 is **not drawn**. Instead `POST /api/sign/:token` gains
> `printedName: 'under' | 'none'`, and the box reserves a fixed 14 px band for the printed
> name under a signature line, with the ink bottom-anchored so it overlaps. **Use the
> bundle's maths, not §6.1's.**

```ts
export type Placement = {
  page: number;  // 0-indexed
  x: number;     // 0..1, fraction of page width, from the LEFT edge
  y: number;     // 0..1, fraction of page height, from the TOP edge
  w: number;     // 0..1, signature box width as a fraction of page width
};

export async function applySignature(input: {
  pdf: Uint8Array;
  signaturePng: Uint8Array;
  placement: Placement;
  name: string;
  signedAt: Date;
  docId: string;
}): Promise<Uint8Array>;

/** Validates and decodes `data:image/png;base64,…`. Throws on anything else. */
export function decodePngDataUrl(dataUrl: string): Uint8Array;
```

### 6.1 The coordinate contract — read this twice

This is the one place where a silent mistake produces a signature in the wrong spot, and
it is the defect a reviewer is most likely to notice.

- **`(x, y)` is the TOP-LEFT corner of the signature box, in top-left origin space.**
  Both the browser preview and the PDF stamp must treat it that way. If the preview draws
  the box centred on the click but the backend anchors its corner there, every signature
  lands offset and it will look like a bug even though both halves "work".
- pdf-lib's origin is **bottom-left**. The conversion is:
  ```
  imgW = clamp01(w) * pageWidth
  imgH = imgW * (pngHeight / pngWidth)     // preserve aspect from the PNG itself
  pdfX = clamp01(x) * pageWidth
  pdfY = pageHeight - (clamp01(y) * pageHeight) - imgH
  ```
- `page` is clamped into `[0, pageCount-1]`.
- A caption is drawn below the image at 7 pt Helvetica, grey: `name — ISO8601 — doc <id>`.
  If it would fall below the page, it clamps to `y = 2`.
- Rotated pages: use pdf-lib's `page.getSize()`, which is rotation-aware for 90° multiples.
  Non-multiples of 90 are not handled — leave a `ponytail:` comment saying so rather than
  building for it.

### 6.2 `decodePngDataUrl` rules

Regex-match `^data:image/png;base64,` then base64-decode; verify the PNG magic number
`0x89504E47`; reject anything over 2 MB. Throw a plain `Error` — `app.ts` maps it to
`400 invalid_signature`.

---

## 7. Security & validation

There is no auth, so the token is the whole security model. Treat it like one.

- **Token generation:** `crypto.getRandomValues(new Uint8Array(32))` → hex. 256 bits.
  Never `Math.random()`, never a counter, never anything derived from the email or title.
- **Opaque 404s.** Unknown, wrong-type, and non-existent tokens all return an identical
  `404 not_found`. No enumeration signal.
- **Tokens never appear in logs.** If you log requests, redact the path segment.
- **Signer tokens must not leak sideways.** `GET /api/sign/:token` returns only that
  signer's view — never the other signers' tokens. Only the requester dashboard
  (`/api/docs/:requesterToken`) may return `signUrl`s, and only because the requester is
  the one who has to distribute them.
- **Upload validation** at the boundary, before touching disk: MIME check, `%PDF` magic
  bytes, 10 MB cap, and a successful `PDFDocument.load()` (which also yields `pageCount`).
  A file that fails any check is never written.
- **Path safety:** files are written to `data/<uuid>/…` using the server-generated UUID.
  The user-supplied filename is never used in a path — at most stored as a display string.
- **Email regex** (deliberately loose — this is a display/label field, not an auth factor):
  `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- **Body size:** cap JSON bodies at 4 MB so the signature endpoint can't be used to eat RAM.

Not doing: rate limiting, CSRF (no cookies, no ambient authority), virus scanning. Say so
in the README rather than pretending otherwise.

---

## 8. User flows

**Flow A — Requester creates a request.** Lands on `/` → fills title, their email, and one
or more signer emails in order → picks a PDF → submits → sees a success panel with the
signer links (copy buttons) and their own dashboard link → is told plainly to save the
dashboard link because there is no login.

**Flow B — Signer signs.** Opens `/s/:token` → sees the document title, their position in
the order, and the PDF → if it isn't their turn, sees who they're waiting on and nothing
else → if it is, clicks a spot on the page to place the signature → draws their signature
and types their name → confirms → sees a done state with a link to view the signed PDF.

**Flow C — Requester collects.** Opens `/d/:token` → sees per-signer status and a
download button → downloads the signed PDF. The page polls every 5 s while
`status === 'pending'` so it updates live during a demo without a websocket.

---

## 9. Screen specifications

Three routes, dispatched by a `switch` on `location.pathname` in `main.tsx`. **No router
dependency** — there are three routes and two of them are a prefix plus a token.

```
/            → S1 Create request  (→ S2 on success)
/d/:token    → S3 Requester dashboard
/s/:token    → S4 Signer
anything else→ S5 Not found
```

Every screen needs its loading, empty, error, and success states designed — not just the
happy one. The states below are the spec, not suggestions.

---

### S1 — Create request (`/`)

**Purpose:** get a PDF and a signer list in, with as little friction as possible.

**Contents**
- Product mark + one-line explainer.
- **Document title** — text, required, autofocused.
- **Your email** — the requester's, required. Helper text: "We'll label the request with this. No account needed."
- **File drop zone** — click or drag. Accepts `.pdf` only. On selection show filename, human
  file size, and page count once known. A "Replace" affordance.
- **Signers** — an ordered list, minimum one row. Each row: an order badge (1, 2, 3…), an
  email input, an optional name input, and a remove button (hidden when only one row remains).
  An "Add signer" button, capped at 5. Reordering is optional; if built, drag or up/down
  buttons both fine — **the array order is the signing order and must be visibly labelled
  as such** ("Signs first", "Signs second", …).
- Submit: **"Send for signature"**.

**States**
| State | Behaviour |
|---|---|
| Idle | Submit disabled until title, requester email, one valid signer email, and a file are present |
| Dragging | Drop zone shows an active border/fill |
| Wrong file type | Inline error under the zone: "That's not a PDF. Only PDF files can be signed." — do not clear the rest of the form |
| Too large | "That file is 14 MB. The limit is 10 MB." — state the actual size |
| Uploading | Submit becomes a spinner + "Sending…", the whole form disables |
| Server error | An error banner above the submit button with the server's `message`, form re-enabled, **nothing lost** |

**Do not** clear the form on any error. Re-entering five signer emails because the PDF was
too big is the kind of thing that makes a reviewer wince.

---

### S2 — Request created (success panel after S1)

Replaces the form in place. This screen is the product's whole delivery mechanism (R3), so
it has to be unmistakable.

- Confirmation heading: "Your request is out for signature."
- **Signer links** — one row per signer: order badge, email, the full absolute URL in a
  monospace field, a **Copy link** button with a "Copied" confirmation. A note that only
  signer 1's link works right now and the rest unlock in order.
- **Your dashboard link** — visually separated and emphasised. Copy button.
  Warning callout: **"Save this link. It's the only way back to this request — there are no
  accounts."** This is the single most important sentence in the UI; treat it as such.
- Primary action: **Open dashboard** → `/d/:requesterToken`.
- Secondary: "Create another request" → resets to S1.

---

### S3 — Requester dashboard (`/d/:requesterToken`)

**Purpose:** status tracking and collecting the signed file.

**Layout:** header (title, status pill, created date) → progress → signer list → download.

- **Status pill:** `Pending` (amber) / `Completed` (green). Same component as the signer rows.
- **Progress:** "1 of 2 signed" plus a segmented bar — one segment per signer, filled in
  signing order. At a glance, this is the screen's headline.
- **Signer rows:** order badge, email, typed name once signed, status pill, relative signed
  time (`2 minutes ago`) with the absolute ISO timestamp in a `title` attribute. Each row has
  a **Copy signing link** button. The row whose turn it currently is gets a subtle
  "Waiting on this signer" marker — exactly one row can have it.
- **Download:** primary button, **"Download signed PDF"**. Enabled whenever
  `hasSignedVersion` is true. While `status === 'pending'` label it **"Download current version"**
  with helper text "Not everyone has signed yet." Never disable it once a signature exists —
  seeing partial progress is a feature.
- **Polling:** re-fetch every 5 s while pending; stop on completed. On the transition to
  completed, do something small and celebratory — a state change the reviewer can watch
  happen live in another tab is worth more than any static polish.

**States:** loading skeleton; `404` → S5; network error → a non-destructive inline banner
("Couldn't refresh — retrying") that keeps the last good data on screen rather than blanking it.

---

### S4 — Signer (`/s/:signToken`)

The core screen. Five distinct states — design each one.

**S4-a · Not your turn.** `yourTurn: false`, `yourStatus: 'pending'`.
Document title, "You're signer 2 of 2", and a clear line: "Waiting on **a@x.com** to sign
first. We'll be ready for you right after." Show the document read-only. **No signature UI
at all** — not disabled-but-visible, absent. Poll every 10 s and transition to S4-b in place
when it becomes their turn.

**S4-b · Ready to place.** `yourTurn: true`.
- Header: document title, "You're signer 1 of 2", a **Download a copy** link.
- The PDF, rendered a page at a time to a `<canvas>` via pdf.js, with page navigation
  (prev/next + "Page 2 of 4") for multi-page documents.
- A persistent instruction bar: **"Click where your signature should go."**
- The cursor over the canvas is a crosshair. On hover, a translucent ghost of the signature
  box follows the pointer so the size is understood *before* committing.
- Clicking sets the placement → S4-c.

**S4-c · Placed, needs a signature.**
- A dashed box marks the placement on the page. It is draggable to adjust, and has a
  corner handle to resize (updates `w`). "Clear" removes it and returns to S4-b.
- A panel (side on desktop, sheet on mobile) opens with:
  - **Full name** — text input, required, ≤ 100 chars. Helper: "This appears under your signature."
  - **Signature pad** — see §11.
  - **Clear** and **Sign document** buttons. "Sign document" is disabled until both a name
    and a non-empty signature exist.
- Once ink exists, the placement box on the page renders the actual signature image at the
  actual size, so the preview matches the output exactly. **This is the trust-building
  moment of the whole app.** Get the alignment pixel-honest.

**S4-d · Submitting.** Everything disables, the button shows a spinner and "Signing…".
On `409` (turn changed underneath them), replace the panel with an explanation and re-fetch
state rather than showing a raw error.

**S4-e · Signed.** Also the state on load when `yourStatus === 'signed'`.
A confirmation: "Signed on 7 Aug 2026 at 10:12." A **View signed document** button. If
others still need to sign, say so: "1 more signer to go — the requester will get the final
copy." Never expose the requester's dashboard token here.

**Mobile:** the signature pad is the part that breaks on phones. It must work with touch —
`touchAction: none` on the pad, pointer events not mouse events. Below 768 px the placement
panel becomes a bottom sheet and the PDF canvas fits width.

---

### S5 — Invalid link

One centred card: "This link isn't valid. It may have been mistyped, or the request may
have been removed." A link home. **Never hint whether the token merely doesn't exist** —
same copy for every 404, per §7.

---

## 10. Design direction

The product asks people to put their name on a legal document. It should feel **calm,
precise, and trustworthy** — closer to a bank statement than a startup landing page. Plain
language, generous whitespace, no illustration, no gradients on anything functional.
Confidence comes from clarity, not decoration.

**Tokens** — define once in `web/styles.css` as CSS custom properties on `:root`, with a
`prefers-color-scheme: dark` block. Nothing hardcodes a hex outside this block.

| Role | Light | Notes |
|---|---|---|
| `--bg` | `#fbfbfa` | Warm off-white — paper, not screen |
| `--surface` | `#ffffff` | Cards, panels |
| `--border` | `#e6e4e0` | Hairlines, 1 px |
| `--text` | `#1a1a18` | Body |
| `--text-muted` | `#6b6862` | Secondary, timestamps, IPs |
| `--accent` | `#1b5e4a` | Deep green — primary actions, focus rings |
| `--accent-weak` | `#e8f2ee` | Accent surfaces |
| `--warn` | `#8a6100` / `#fdf3dd` | Pending status |
| `--ok` | `#1b5e4a` / `#e8f2ee` | Completed status |
| `--danger` | `#a02020` / `#fbeaea` | Errors |

One accent, used sparingly. If a screen has more than one green button, one of them is wrong.

- **Type:** system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
  Monospace (`ui-monospace, SFMono-Regular, Menlo, monospace`) for tokens, URLs, and IPs —
  it signals "machine value, copy this exactly". Scale: 12 / 14 / 16 / 20 / 28. Body 16 px,
  line-height 1.5. No font loaded over the network; a webfont is a render-blocking
  dependency this app has no use for.
- **Space:** 4 px base. Use 4/8/12/16/24/32/48. Cards `border-radius: 10px`, inputs `8px`,
  buttons `8px`.
- **Elevation:** one shadow, used rarely: `0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)`.
  Prefer borders to shadows. Flat and precise reads as more trustworthy than floaty.
- **Motion:** 120–180 ms, `ease-out`. Only for state changes the user caused. The one
  exception: the pending→completed transition on the dashboard may be a touch more
  expressive. Respect `prefers-reduced-motion` and drop to instant.
- **Buttons:** primary (accent fill), secondary (border, transparent), ghost (text only).
  All are ≥ 40 px tall, ≥ 44 px on touch.

### 10.1 Accessibility — non-negotiable

- Every input has a real `<label>`. Placeholders are never the only label.
- Visible focus ring on everything focusable: `2px solid var(--accent)` with a 2 px offset.
  Never `outline: none` without a replacement.
- Errors are tied to their field with `aria-describedby` and announced via `role="alert"`.
- Status changes (upload done, signed, copied) announce through a polite live region.
- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI boundaries. Status is never colour alone — the
  pills carry text.
- The whole flow is keyboard-operable **including placement**: when the canvas has focus,
  arrow keys move the placement box and Enter confirms. A canvas you can only click is a
  screen no keyboard user can finish. Ship this.
- The rendered PDF canvas gets an `aria-label` naming the document and page, and the
  **Download a copy** link is the accessible escape hatch for anyone who can't use it.

---

## 11. Signature capture — implementation notes

The part most likely to be subtly wrong.

- **Pointer events only** (`pointerdown`/`pointermove`/`pointerup`), never mouse events, so
  touch and stylus work for free. Set `touch-action: none` on the canvas or the page scrolls
  under the signer's finger mid-stroke.
- **HiDPI:** size the backing store to `rect.width * devicePixelRatio` and scale the context,
  or the signature is blurry on every modern screen.
- **Stroke:** `lineWidth` ~2.5 CSS px, `lineCap`/`lineJoin` round, `strokeStyle` `#111`.
  Interpolate between points with a quadratic midpoint curve — raw `lineTo` on a fast stroke
  is visibly polygonal.
- **Transparent background.** Do not fill white. A white box pasted over the document text
  looks broken.
- **Trim before export — required, not optional.** Read the pixels, find the ink bounding
  box, add ~4 px padding, and export only that region. Skipping this means a signer who
  signs small produces a mostly-empty PNG, which the backend scales to `w` and renders as a
  tiny mark in the middle of a huge invisible box. The placement will look wrong and the
  cause is non-obvious. Trim.
- **Empty detection:** if the trimmed bounding box is empty, the pad is empty — that's what
  gates the submit button. Don't track a boolean `hasDrawn`; measure the pixels.
- Export with `canvas.toDataURL('image/png')` and post the data URL as-is.
- **Undo** (one step, by keeping stroke arrays rather than only pixels) is a genuinely nice
  touch and cheap. Build it if the rest is solid; skip it otherwise.
- *Optional, only if everything else is done:* a "Type instead" tab that renders the typed
  name in a cursive-ish system font to a canvas and exports the same PNG. Same pipeline, so
  it costs almost nothing — but it is the first thing to cut.

**pdf.js in Vite:** import the worker as a URL and assign it, or you'll fight a fake-worker
warning and a silent production failure:

```ts
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
```

Render at `devicePixelRatio`-aware scale, fit to container width, one page at a time.
Normalise clicks against the canvas's **CSS** box (`getBoundingClientRect`), never its pixel
buffer — otherwise placement breaks on HiDPI and the bug only shows on a retina screen.

---

## 12. Testing & CI

`bun test`. No framework, no fixtures library, no mocking library. Bun's built-in runner
and `assert`-style expectations are enough.

**`src/sign.test.ts` — the math**
- Stamping a known PDF preserves page count and returns bytes that `PDFDocument.load()` accepts.
- The output differs from the input (the stamp actually landed).
- `placement.page` out of range clamps to a valid page instead of throwing.
- `x`/`y`/`w` outside `0..1` clamp rather than throw.
- Aspect ratio is preserved: a 2:1 PNG at `w=0.5` occupies half the page width and a
  quarter of it in height (assert against page dimensions, with a tolerance).
- `decodePngDataUrl` rejects: a JPEG data URL, a bare base64 string, a PNG-typed URL whose
  bytes aren't a PNG, and anything over 2 MB. Accepts a real minimal PNG.

**`src/flow.test.ts` — the API, through `app.handle()`**
- Full happy path: upload a 2-signer request → signer 1 signs → signer 2's link unlocks →
  signer 2 signs → `docStatus === 'completed'` → the requester download returns a loadable
  multi-stamped PDF.
- Signer 2 attempting to sign first → `409 not_your_turn`.
- Signing twice with the same token → `409 already_signed`.
- Unknown token on every token route → `404 not_found`, identical body each time.
- A non-PDF upload → `400 invalid_file`, and **assert nothing was written to disk**.
- A signer's payload never contains another signer's token (a string-contains assertion —
  cheap, and it guards the one leak that actually matters).

Point `DATABASE_URL` at a throwaway database and truncate every table in `afterEach`, so
tests never touch the dev data. Generate the fixture PDF in-process with pdf-lib rather than
committing a binary.

Locally that database is `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16`;
in CI it is a **service container**, which costs four lines of YAML and means the tests run
against real Postgres rather than a stub:

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_PASSWORD: dev }
    ports: ['5432:5432']
    options: >-
      --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
```

**`.github/workflows/ci.yml`** — on push and PR to `main`:
`oven-sh/setup-bun@v2` → `bun install --frozen-lockfile` → `bunx tsc --noEmit` →
`bun test` → `bun run build`. The typecheck and the build matter: they're what catch a
frontend that compiles in dev and dies in prod, which is exactly the failure mode that
would take the live URL down.

---

## 13. Explicit non-goals

State these in the README too. Naming what you deliberately didn't build reads as judgment;
staying silent reads as an oversight.

| Not built | Why |
|---|---|
| Email notifications | Needs an API key and a verified sender; links + dashboard already satisfy R3 |
| Accounts / login | Tokens secure the demo; accounts are days of work for no assignment credit |
| Webhooks | No consumer exists |
| Document expiry | One column and a cron's worth of complexity for a demo nobody will leave running |
| Cryptographic signature verification | Real e-signature PKI is a project, not a feature. This is a *visual* signature, and the README must say so plainly rather than implying legal weight |
| Audit trail | Cut in the design pass: the version that was specced logged signer IPs and user agents, and the privacy cost wasn't worth the feature. `signers.signed_at` is what the dashboard shows |
| Rate limiting | Single-tenant demo; noted in the README as a known gap |
| Parallel (non-sequential) signing | Sequential is the common real-world case and half the state machine |

---

## 14. Return artifact — the pass-off file back

When the design and implementation pass is done, produce
`/Users/eux/Documents/BLOKC/IMPLEMENTATION-HANDOFF.md` with:

1. **What was built** — screen by screen, with the final component names and file paths.
2. **Deviations from this document** — every place the design or contract changed, and why.
   This is the most important section; a silent deviation is a bug waiting for the next person.
3. **API contract diffs** — any route, field, or error code that differs from §5.
4. **Design tokens as shipped** — the final `styles.css` `:root` block, so it can be reviewed
   against §10 at a glance.
5. **Known gaps** — anything specced here and not built, or built and not polished.
6. **Test status** — what passes, what's missing, current coverage of §12's list.
7. **Deploy checklist status** — see §15; which steps are done and which still need the
   account owner.
8. **Manual verification log** — the actual end-to-end pass: upload → sign → download, with
   what was observed, on both desktop and mobile widths.

---

## 15. Deployment checklist

**Render free web service + Neon free Postgres.** $0, no credit card, both permanent tiers.
The account owner runs the authenticated steps — they can't be automated from here.

1. Push the repo to GitHub (CI needs it, and Render deploys from it).
2. **Neon** — sign up at neon.tech, create a project, copy the pooled connection string
   (`postgres://…?sslmode=require`). *User runs this.*
3. **Render** — New → Web Service → connect the repo → runtime **Docker** → instance type
   **Free**. Set env vars `DATABASE_URL` (the Neon string) and `PORT=3000`. *User runs this.*
4. Render builds the Dockerfile and gives you `https://<name>.onrender.com`.
5. **Keep it warm.** Free services spin down after 15 minutes idle and the next request takes
   30–60s. Add a `GET /health` route returning `200 {"ok":true}`, then point a free pinger
   (UptimeRobot, cron-job.org) at it every 10 minutes. Free tier allows 750 instance-hours a
   month, which just covers always-on. Also put a line in the README: *"Hosted on a free
   tier — the first request after a quiet spell can take up to a minute."*
6. Open the live URL and run the **whole flow on the real deployment** — upload, sign as
   both signers, download — before sending the link. Then put that URL at the top of the
   README.

**Dockerfile shape:** `FROM oven/bun:1` → copy manifests → `bun install --frozen-lockfile`
→ copy source → `bun run build` (produces `public/`) → `EXPOSE 3000` →
`CMD ["bun", "src/index.ts"]`. Single stage; the image is small and one stage is one less
thing to debug at deploy time.

`src/index.ts` reads `PORT` and `DATABASE_URL` from the environment (defaulting to `3000`
and a local Postgres URL), and `db.ts` runs the `CREATE TABLE IF NOT EXISTS` bootstrap on
boot — the Neon database starts empty.

**Two Neon free-tier limits worth knowing:** compute suspends after 5 minutes idle and takes
~500 ms to wake (harmless — the Render pinger keeps it warm anyway), and storage is capped at
0.5 GB, which is a hard cutoff rather than a throttle. The 10 MB upload cap keeps a demo far
below it.

---

## 16. Definition of done

**Product**
- [ ] The live URL loads and the full flow works *on it* — not just locally
- [ ] Upload → sign → download works end to end with 2 signers
- [ ] Signer 2's link is genuinely inert until signer 1 signs
- [ ] The signature lands where it was clicked, verified against a downloaded PDF
- [ ] Hard-refreshing `/d/:token` and `/s/:token` works (SPA fallback)
- [ ] Every screen's loading, error, and empty states exist
- [ ] Keyboard-only pass completes the whole signer flow, placement included
- [ ] Mobile width (375 px) is usable, signature pad included

**Submission (§1.3)**
- [ ] `bun test` green locally and in GitHub Actions, with the CI badge in the README
- [ ] New Git repo, pushed, with a readable commit history — not one squashed commit (G1)
- [ ] README complete per §17 and verified from a cold `git clone` in an empty directory (G4)
- [ ] "How this was built" section written — honest about AI tooling (G2)
- [ ] **Author has read every file and can explain it.** Anything indefensible is deleted,
      not shipped (G3)

---

## 17. README specification

The README is a graded deliverable (G4), and for most reviewers it is the *first* thing
opened and sometimes the only thing read. Write it for someone with ten minutes and no
context. In this order:

1. **Title + one-sentence description.** "InkSign — upload a PDF, send it for signature,
   get the signed copy back."
2. **Live URL**, on its own line, impossible to miss. CI badge next to it.
3. **A 60-second tour** — 3–4 sentences on the flow, ideally with two or three screenshots
   or a short GIF of the signer placing a signature. A reviewer who watches the flow without
   leaving the README will start the live demo already convinced.
4. **Run it locally** — the section that must actually work from a cold clone:
   ```bash
   git clone <repo> && cd inksign
   bun install
   cp .env.example .env      # DATABASE_URL, PORT, and anything else required
   bun run dev               # API on :3000
   bun run dev:web           # Vite on :5173, proxies /api → :3000
   ```
   State the Bun version, note that Bun is the only prerequisite, and say exactly what the
   database setup is. **Test this by cloning into a fresh directory and following your own
   instructions literally.** A README that assumes state already on your machine is the most
   common way a working project reads as broken.
5. **Run the tests** — `bun test`, plus what the tests cover in two lines.
6. **Architecture** — one paragraph plus the §3 tree. Name the three deliberate choices
   worth defending: one process serves API and frontend; tokenised links instead of accounts;
   incremental multi-signer stamping with no merge step.
7. **How this was built (G2)** — which AI tools, what they were pointed at, and what the
   author specified, reviewed, and corrected. A few honest sentences. This document itself
   is evidence of the process and is worth linking.
8. **What's deliberately not built** — the §13 table, verbatim. Naming your non-goals is the
   cheapest credibility in the whole submission.
9. **Known limitations** — the cold start on the free tier, no rate limiting, and the fact
   that this is a *visual* signature, **not** a legally-binding cryptographic e-signature. Say that plainly; implying otherwise is the one claim that
   would actually count against the submission.
