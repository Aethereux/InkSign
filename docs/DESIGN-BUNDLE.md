# Handoff: InkSign — e-signing web app

## Overview

InkSign is an e-signing web app. A requester uploads a PDF, names one or more signers in a
signing order, and gets back a link per signer plus a dashboard link of their own. Signers
open their link, place a signature on the page, draw it, and submit. The signed PDF is
available on the requester's dashboard as soon as the first signature lands.

This bundle contains the **finished design** for that product: five screens, every state,
and the interaction detail that makes the signature land where the signer put it.

### The assignment being satisfied (verbatim)

> Build an e-signing application with the following core requirements:
>
> **Upload & Request Signature** — A requester can upload a PDF and send it out for signing.
>
> **Sign the Document** — The signer can open the document, apply their signature, and submit it.
>
> **Return the Signed Document** — At minimum, the application must deliver the signed document back to the original requester (e.g., via email, a shareable link, a dashboard, or any creative mechanism you design).
>
> **Tech Stack Requirements:**
>
> Backend: Must use Elysia JS running on Bun.
>
> Frontend (if applicable): Must use Vite (e.g., with React, Vue, Svelte, etc.) or Next.js.
>
> Testing: Must include Unit Tests configured to run in GitHub Actions.
>
> Deployment: Required — please share the live URL where we can access the application.
>
> Be creative! Beyond the core flow, feel free to add features that showcase your technical ability and product sense — e.g., multi-signer workflows, audit trails, signature verification, email notifications, drag-and-drop signature placement, authentication, document expiration, status tracking, webhooks, or anything else you find compelling.

The design covers the three core requirements plus three of the creative extras:
**sequential multi-signer**, **click-to-place signature placement**, and **live status tracking**.

`DESIGN-HANDOFF.md` (included in this folder) is the upstream engineering spec written before
the design pass. It carries the data model, API contract, signing-engine math, test list and
deploy checklist. **Read it as the implementation contract, and read the Deviations section
below for every place the design overrides it.**

---

## About the design files

The `.dc.html` files in this bundle are **design references created in HTML** — working
prototypes that show intended look and behaviour. They are **not production code to copy**.
They render through a bespoke streaming-template runtime (`support.js`, not included) and
their styles come from a linked design-system stylesheet.

The task is to **recreate these designs in the target stack**: Vite + React + TypeScript on
the frontend (per the stack requirement), talking to Elysia on Bun. Use the codebase's own
patterns; take from these files the layout, copy, tokens, geometry and behaviour, not the
markup.

Open them in a browser to interact with them. Each has a dev bar along the bottom that
forces every state — that bar is a prototyping affordance and **must not be built**.

## Fidelity

**High fidelity.** Colours, typography, spacing, states and copy are final. Recreate the UI
faithfully. The one exception is the mock document: the prototype renders a fake NDA as DOM
text because it has no PDF engine. In production that area is a pdf.js canvas (see
`DESIGN-HANDOFF.md` §11).

---

## Design tokens (as shipped)

These **replace** §10 of `DESIGN-HANDOFF.md` entirely (see Deviations #1). They come from the
Modernist design system; `styles.css` in this folder is the source of truth.

| Token | Value | Used for |
|---|---|---|
| `--color-bg` | `#f3f2f2` | Page ground |
| `--color-surface` | `#eae9e9` | Insets, secondary bands, dev bar, skeletons |
| `--color-text` | `#201e1d` | All body and heading ink |
| `--color-accent` | `#ec3013` | Primary buttons, order badges, section numbers, marks |
| `--color-accent-600` | `#dd2b0f` | Primary button hover |
| `--color-accent-700` | `#ae1800` | Accent text at small sizes, link hover, error text |
| `--color-accent-800` | `#7c1405` | Text on accent-100 fills |
| `--color-accent-100` | `#fff2ef` | Error/callout fills, drag-over fill |
| `--color-neutral-300` | `#d7d3d3` | Unfilled progress segments |
| `--color-divider` | `rgba(32,30,29,.4)` | **All** rules and borders |
| `--radius-*` | `0px` | Nothing is rounded, anywhere |

Muted ink is the text colour at reduced alpha: `rgba(32,30,29,.8)` body-secondary,
`.7` labels, `.6` meta, `.55` helper text, `.5` faint furniture.

**Rules:** 2px `--color-divider` between major sections and under section headers; 1px for
row separators inside a list or table. Never hairlines, never replaced by whitespace.

**Type:** Archivo only (400 / 600 / 800), loaded from Google Fonts by the stylesheet.

| Role | Spec |
|---|---|
| Landing display h1 | `clamp(42px,6.2vw,84px)` / 1.06 / `-.02em` / 800, `margin-left:-.058em` optical inset, one sentence per line |
| Landing close h2 | `clamp(34px,4.2vw,56px)` / 1.06 / `-.015em` / 800 |
| Screen h1 | 30–38px / 1.12 / `-.02em` / 800 |
| Section header | 14px / `.1em` tracking / uppercase / 800, preceded by a 22px/800 accent number |
| Section number | 22px / 800 / `#ec3013` (`01`, `02`, `03`) |
| Sub-head (h3) | 19–20px / 800 |
| Body | 15px / 1.55–1.65 |
| Small body / helper | 12.5px / 1.5 |
| Micro label | 10–11.5px, `.05–.14em` tracking, uppercase, 600 |
| Landing stat figure | `clamp(34px,3.4vw,48px)` / 800 / `#ec3013`, `margin-left:-.045em` |

**Spacing:** 4px base — 4 / 8 / 12 / 16 / 24 / 32. Horizontal page padding is
`clamp(16px,4vw,32px)` (`clamp(14px,4vw,28px)` on the signer screen); this is what makes the
pages work at 375px without media queries. Content max-widths: landing 1200px, S1 1180px,
S2 1000px, S3 1060px.

**Elevation:** none. No shadows are used anywhere in this product. Borders do the work.

**Buttons:** `.btn` is 800-weight Archivo, 14px, zero radius, **label flush left** — a
button wider than its label starts its text at the left padding edge, never centred.
Primary = accent fill with `#f3f2f2` label. Secondary = 1px divider border, transparent.
Ghost = accent text. Heights used: 38px (inline), 42–46px (form), 50px (signer submit),
64px (full-width bottom bars). Focus is the system's `2px solid #ec3013` outline at 2px
offset — never remove it.

**Disabled:** the design system sets `opacity:.45`. Do **not** apply it to an accent-filled
button on the light ground — it lands at ~1.6:1 contrast and the label disappears. For a
button that is busy rather than unavailable (the "Sending…" / "Signing…" spinner states),
use `aria-disabled="true"` + `pointer-events:none` and keep the fill at full opacity.

---

## Screens

### 0 · Landing (`/`) — `InkSign - Landing.dc.html`

**Purpose:** explain the product and start a request. Not in the original spec; added during
the design pass.

**Layout:** design-system `.nav` header (brand lockup, "How it works", "The document",
primary CTA; `flex-wrap:wrap` so it stacks on a phone). Then a 1200px column with
`clamp(20px,5vw,72px)` gutters: hero → 2px rule → stat row → 2px rule → three numbered
feature rows → "The document" split → full-bleed red close → footer.

- **Hero.** h1 in two block lines: "Send a PDF." / "Get it back signed." Sub, 17px/1.65,
  max 58ch: "InkSign takes a document, collects the signatures you need in the order you
  need them, and hands the signed file back to you. One link per signer. No accounts, no
  installs, nothing to configure." Buttons: primary "Send a document" → `/`(S1),
  secondary "See how it works" → `#how`.
- **Stat row.** `repeat(auto-fit,minmax(190px,1fr))`. `10 MB` / "Largest document" ·
  `5` / "Signers per request, in order" · `0` / "Accounts to create" · `256-bit` / "Every
  link, unguessable". Figures in accent; labels 13px uppercase `.08em` at `rgba(32,30,29,.7)`.
- **Feature rows.** Wrapping flex: number (`flex:0 0 60px`, 15px/800), title
  (`flex:1 1 240px`, 24px/800), copy (`flex:1 1 340px`, 15.5px/1.65, max 52ch). 2px rule
  between rows, 42px vertical padding. Content: "One link per signer" / "The mark lands
  where you put it" / "The signed file comes back to you".
- **The document.** Wrapping flex, 2px top rule: left kicker "THE DOCUMENT" +
  h2 "Your PDF, unchanged"; right paragraph about the stamp and version history.
- **Red close.** Full-bleed `#ec3013`, `#f3f2f2` ink, 84px vertical padding, wrapping flex:
  left h2 "Your first document" / "is a link away." + ghost CTA with a `1px solid #f3f2f2`
  border; right a paper-coloured (`#f3f2f2`) figure, `flex:0 1 404px`, 26px padding — the
  signing animation (below).
- **Footer.** 13px, `rgba(32,30,29,.7)`, max 70ch: "InkSign stamps a visual signature onto
  the page, with the signer's printed name beneath it, and records who signed and when. It
  is not cryptographic e-signature PKI, and it doesn't claim to be." Keep this sentence —
  it is the product's honesty statement.

---

### S1 · Create request (`/`) — in `InkSign.dc.html`

**Purpose:** get a PDF and an ordered signer list in with minimum friction.

**Layout:** header (brand + "Request · Step 1 of 3") → 1180px main as a wrapping flex:
left column `flex:1 1 540px` holds sections 01 and 02; right `aside` `flex:0 1 320px`
(min 280px) with a 2px border holds section 03 → full-width bottom bar with a 2px top rule.

- **01 Document.** Title and Your-email fields side by side (`flex:1 1 240px` each, 42px
  tall). Email helper: "Labels the request. No account needed." Then the drop zone: 2px
  divider border, 148px min height, flush-left contents — "Drop the PDF here" (19px/800) and
  a secondary "Choose a file" button. With a file: filename at 19px/800 (ellipsised),
  "2.4 MB · 4 pages" at 12.5px muted, "Replace" button pushed right.
- **02 Signers.** Header row of 10px uppercase labels (Order / Email / Name (optional)),
  then one wrapping-flex row per signer: order badge (28px accent square, `#f3f2f2` numeral,
  800/13px) + "1st" micro label in a `flex:0 0 82px` cell, email input `flex:1 1 200px`,
  name input `flex:1 1 140px`, remove icon-button `flex:0 0 38px` (hidden when one row
  remains). 1px rule under each row, 2px under the header. "Add signer" secondary button
  below; cap shown as "2 of 5" at the section header's right edge.
- **03 Then.** Three numbered lines explaining links, unlock order, and early download,
  then a 2px rule and: "There are no accounts. Your dashboard link is the only way back to
  a request, so keep it."
- **Bottom bar.** Primary "Send for signature" (`flex:1 1 320px`, 64px tall, 18px, label
  flush left at 32px padding) + a 2px-left-ruled hint cell (`flex:1 1 260px`, 12px muted)
  whose text names exactly what is missing.

**States** (all in the prototype's dev bar):

| State | Behaviour |
|---|---|
| Idle | Submit disabled until title, a valid requester email, a valid signer-1 email, and a file exist. Hint: "Add a title, your email, one signer and a PDF to send." → "A PDF is still missing." → "Check the email addresses — yours and signer 1's." |
| Dragging | An absolutely-positioned overlay covers the drop zone: 2px `#ec3013` border, `#fff2ef` fill, "Drop to attach" at 19px/800 in `#ae1800`, `pointer-events:none` |
| Wrong file type | Inline `role="alert"` under the zone, 13px `#ae1800`: "That's not a PDF. Only PDF files can be signed." Form contents untouched |
| Too large | Same treatment, actual size stated: "That file is 14.2 MB. The limit is 10 MB." |
| Uploading | Every input and button disabled; submit becomes a 14px spinner + "Sending…" (see the Disabled note above) |
| Server error | Full-width band above the main: `#fff2ef` on a 2px `#ec3013` bottom rule, "NOT SENT" tag in `#ae1800` + "We couldn't reach the server. Nothing was lost — your details are still here, so try sending again." |

**Never clear the form on any error.**

---

### S2 · Request created — in `InkSign.dc.html`

**Purpose:** hand over the links. This screen *is* the return mechanism (R3), so it has to be
unmistakable.

**Layout:** 1000px column. h1 38px "Your request is out for signature." → sub naming the
count → 2px rule → 01 Signer links → 02 Your dashboard link → bottom bar.

- **Signer links.** Section header's right edge carries "Only signer 1's link works now —
  the rest unlock in order". One wrapping-flex row per signer: badge + state micro-label
  ("Live now" / "Unlocks after 1") in `flex:0 0 96px`; email at 14px/800 above a read-only
  `.input` holding the absolute URL (12.5px, `#eae9e9` fill) in `flex:1 1 260px`; then a
  fixed **112px** "Copy link" secondary button and a ghost "Open" link. The fixed width is
  deliberate — the label swaps to "Copied" for 1.7s and must not reflow the row.
- **Dashboard link.** A 2px `#ec3013` box on `#fff2ef`, 22px padding. Inside, at 20px/800 in
  `#7c1405`, max 44ch: **"Save this link. It's the only way back to this request — there are
  no accounts."** Then the URL in a read-only input (accent border, `#f3f2f2` fill) and a
  112px primary "Copy link". This sentence is the most important copy in the product.
- **Bottom bar.** Primary "Open dashboard" (64px) + secondary "Create another request"
  separated by a 2px left rule.

---

### S3 · Requester dashboard (`/d/:requesterToken`) — in `InkSign.dc.html`

**Purpose:** status tracking and collecting the file.

**Layout:** 1060px column: title row → meta line → 2px rule → progress → 01 Signers →
download panel → (end).

- **Title row.** h1 34px + status pill pushed right. Pending = `.tag-neutral` ; Completed =
  accent fill with `#f3f2f2` ink. Both 11px/800 uppercase `.09em`, 8px×12px padding. Status
  is never colour alone — the pill always carries its word.
- **Meta line.** 13px muted: `mutual-nda-2026.pdf · 4 pages · created 2 minutes ago by ops@inksign.app`.
- **Progress.** "1 of 2 signed" at 30px/800; the signer being waited on named beside it at
  13px muted; at the right a live indicator — a 7px accent square pulsing 1.8s
  (`om-pulse`) + "LIVE · CHECKS EVERY 5S", replaced by "NO LONGER POLLING" when complete.
  Below: one segment per signer, `flex:1`, 12px tall, 3px gaps, `#d7d3d3` empty /
  `#ec3013` filled, in signing order.
- **01 Signers.** A real `<table class="table">`, `table-layout:fixed`, `min-width:700px`
  inside an `overflow-x:auto` wrapper (so a phone scrolls it rather than crushing it).
  Columns: `52px` # · auto Signer · `112px` Status · `168px` Signed · `210px` Link.
  Cells: order badge; email at 14.5px/800 over a 11.5px muted sub-line ("Signed as Ada
  Lovelace" / "Signs second · link is live" / "Signs second · link inert until 1"); status
  pill; relative time with the full ISO timestamp in `title=` — and for the current turn,
  "WAITING ON THIS SIGNER" at 11px/800 uppercase in `#ae1800` (exactly one row ever);
  then a ghost "Copy signing link" (flexes) beside a ghost "Open".
- **Download panel.** 2px-bordered box, wrapping flex: h3 + helper on the left, primary
  button with a download glyph on the right. Pending: "Current version · v1" /
  "Not everyone has signed yet. This copy carries the 1 signature collected so far." /
  button "Download current version". Complete: "Signed document · final" / "All 2 signatures
  are on this copy." / "Download signed PDF". With nothing signed: "Nothing signed yet" /
  "The signed PDF appears here the moment the first signature lands." and, in place of the
  button, 12.5px faint text "Nothing to download yet — no one has signed."
- **Completion moment.** When the last signature lands, a full-bleed accent band appears
  above the content: "Everyone has signed." (15px/800) + "The final PDF is ready to download
  below.", with a `#ae1800` panel wiping across from the left over 450ms (`om-wipe`). It
  clears itself after 6s, and is skipped entirely under `prefers-reduced-motion`.

**States:** skeleton on load (grey `#eae9e9` blocks at the real heights + "Loading the
request…"); refresh failure = a non-destructive `#eae9e9` band, "OFFLINE" + "Couldn't
refresh — retrying. Everything below is the last good copy." — the last good data stays on
screen; unknown token = the S5 card rendered in place (see below).

---

### S4 · Signer (`/s/:signToken`) — `InkSign - Signer.dc.html`

**Purpose:** the core screen. Five states, all built.

**Layout:** header (brand, doc title at 15px/800, "You're signer 1 of 2" micro-label,
ghost "Download a copy" pushed right) → a state band → main as a wrapping flex: document
column `flex:1 1 560px` (min 280px) and panel `flex:0 1 380px` (min 280px). The panel's
divider is a 2px **left** border on desktop and a 2px **top** border below 767px, where it
becomes a sheet under the document.

**Document frame:** `max-width:620px`, `aspect-ratio:17/22`, white, 2px divider border,
`overflow:hidden`, `tabIndex=0`, `role="group"`, `aria-label="Mutual NDA — Acme × InkSign,
page 2 of 4"`. Above it: prev/next secondary icon-buttons, "PAGE 2 OF 4" micro-label, and a
right-aligned hint ("Signature usually goes on the execution page (4)" while placing, then
"Your signature is on page 4"). In production this is the pdf.js canvas.

**S4-a · Not your turn** (`yourTurn:false`). A `#eae9e9` band on a 2px rule:
"Waiting on ada@acme.com to sign first." at 20px/800, then "We'll be ready for you right
after. This page updates itself — you can leave it open, or come back to the same link
later." and "READ-ONLY UNTIL IT'S YOUR TURN · CHECKS EVERY 10S". The document shows;
**there is no signature UI in the DOM at all** — not disabled, absent.

**S4-b · Ready to place.** A `#fff2ef` band on a 2px `#ec3013` rule: "Click where your
signature should go." at 15px/800 `#7c1405`, plus "Or focus the page and press Enter — arrow
keys nudge, + and − resize." Cursor over the page is `crosshair`. A ghost box follows the
pointer: 1px dashed `rgba(236,48,19,.85)`, `rgba(255,242,239,.5)` fill, `pointer-events:none`,
sized exactly like the box that will be committed.

**S4-c · Placed, needs a signature.** Band goes neutral: "Drag the box to adjust. The corner
handle resizes it." + a live readout `x 0.31 · y 0.62 · w 0.26 · page 4` + a secondary
"Clear placement". The box is draggable (`cursor:move`) with a 12px accent corner handle at
`right:-5px;bottom:-5px` that resizes `w`. Before ink exists it reads "SIGNATURE HERE" at
9px/600 uppercase in `#ae1800`. The panel:

- **Full name** — `.input`, 42px, `maxLength=100`, helper "This appears under your signature."
- **Signature** — a 170px-tall white canvas with a 1px divider border, `touch-action:none`,
  `cursor:crosshair`; label row carries "Draw with a mouse, finger or stylus" → "Trimmed and
  ready". Below: secondary "Undo" and "Clear", both disabled while empty.
- **Printed name** — a `.seg` segmented control, two options: **"Under the ink"** (default)
  and **"None"**. Helper text switches with it: "Your name printed under a signature line,
  ink above it — the paper convention." / "Nothing printed. Only the ink you drew lands on
  the page."
- **Submit** — primary "Sign document", 50px, disabled until a non-empty name *and* non-empty
  ink exist; a 11.5px helper under it says which is missing, or what will happen.

**S4-d · Submitting.** Everything disabled; button becomes spinner + "Signing…". On a `409`
the panel shows a 2px accent box on `#fff2ef`: "The order changed while you were signing."
(14px/800 `#7c1405`) + "Someone ahead of you signed a moment ago, so this document moved on.
Nothing you drew was lost." + a primary "Reload this document" that refetches state. Never a
raw error.

**S4-e · Signed** (also the load state when `yourStatus==='signed'`). Neutral band:
"Signed on 7 Aug 2026 at 10:12." at 20px/800, then either "1 more signer to go — the
requester gets the final copy once everyone has signed." or "That was the last signature.
The requester has the completed document." A primary "View signed document" sits at the
right. The stamped signature stays visible on the page with its border dropped to `0` and
the handle gone. **Never expose the requester's dashboard token here.**

**Loading.** On mount, a skeleton: a 34px grey bar, a full page-shaped `#eae9e9` block with
the 2px border, "Opening the document…", and a matching panel skeleton.

**Refresh failure.** Same non-destructive band as the dashboard: "OFFLINE" + "Couldn't check
whether it's your turn — retrying. Anything you've drawn is still here."

---

### S5 · Invalid link — `InkSign - Invalid link.dc.html`

Header (brand + "404"). One card centred in the viewport, 520px max, 2px divider border,
32px padding, **contents flush left**: "LINK NOT VALID" kicker at 11px/600 `.14em` in
`#ae1800`; h1 30px "This link isn't valid."; 15px/1.6 body — "It may have been mistyped, or
the request may have been removed. If someone sent it to you, ask them for a fresh link —
signing links are long, and they don't survive being broken across two lines of an email.";
2px rule; primary "Go to InkSign".

Serve this for **every** unknown, wrong-type or expired token, with identical copy — it must
leak nothing about whether a token exists. The dashboard renders the same card inline for a
bad `requesterToken` (its body instead reads "Dashboard links are long — check nothing was
cut off when it was copied.").

---

## Interactions & behaviour

### Signature placement — get this exactly right

`{page, x, y, w}` are normalised: `x`/`y` are fractions of page width/height from the
**top-left**, and they mark the **top-left corner of the signature box**. `w` is the box
width as a fraction of page width. Clicking centres the box on the pointer, then clamps it
inside the page. Convert clicks against the canvas's **CSS** box
(`getBoundingClientRect`), never its pixel buffer.

Box height is **not** just the ink's aspect. With "Under the ink" selected the box reserves
a fixed **14px** band for the printed name:

```
inkH     = w * pageWidth * (pngHeight / pngWidth)
boxH     = inkH + (printedName === 'under' ? 14 : 0)
```

Inside the box: a 1px `#201e1d` rule at 50% opacity sits at `bottom:12px`; the printed name
is 8px/1.4 Archivo 700, **centre-aligned**, at `bottom:0`; the ink is **bottom-anchored** at
`bottom:4px`, full box width, so it crosses the rule and overlaps the name the way a pen
does on paper. Do not top-anchor it and do not centre it in the whole box — both were tried
and read as a stray hairline through the type.

pdf-lib's origin is bottom-left, so `pdfY = pageHeight − (y × pageHeight) − boxH`.
Clamp `page` into range and clamp `x`/`y`/`w` rather than rejecting them — a signature two
pixels off the edge should land on the edge, not throw away the signer's work.

**Keyboard placement is required.** With the page focused: `Enter`/`Space` places the box
mid-page (x centred, y 0.62); arrows nudge by 0.01 (0.002 with Shift); `+`/`−` resize `w`
by 0.02; `Escape` clears; `Enter` with a box moves focus to the name field. Announce each
change through a polite live region.

### Signature pad

Pointer events only (`pointerdown/move/up` + `setPointerCapture`), `touch-action:none`.
Size the backing store to `rect.width × devicePixelRatio` and scale the context.
`lineWidth` 2.5 CSS px, round cap and join, `#111`, **transparent background**. Interpolate
with quadratic midpoints — raw `lineTo` looks polygonal on a fast stroke. Keep stroke point
arrays so Undo is one step.

**Trim on export, and repaint before measuring.** Read the alpha channel, find the ink
bounding box, pad by `4 × dpr`, copy that region to a scratch canvas, `toDataURL('image/png')`.
Emptiness is measured from those pixels, never a `hasDrawn` boolean — it gates the submit
button. One trap worth naming: if you draw during `pointermove` from a deferred state
update, the canvas can still be stale when `pointerup` measures it, and the signer ends up
with visible ink and a disabled button. Repaint from the authoritative stroke data as the
first line of the export routine.

### Polling

Dashboard: refetch every 5s while `status === 'pending'`; stop on `completed`. Signer:
every 10s while it isn't your turn, then transition in place. Relative times ("2 minutes
ago") re-render on a 1s tick, with the absolute ISO value in `title=`.

### Copy-to-clipboard

`navigator.clipboard.writeText`, label swaps to "Copied" for ~1.7s, announced politely.
Every copy control has a fixed width (or lives in a fixed-width table cell) so the swap
cannot reflow its row.

### Animation

All easing is short and only on state the user caused, except the landing's two idle loops.

| Name | Spec | Where |
|---|---|---|
| `om-rise` | `opacity 0→1`, `translateY(20px)→0`, 0.8–0.85s `cubic-bezier(.2,.75,.2,1)` | Landing hero (staggered 0 / .09s / .2s / .3s); every scrolled section, driven by `animation-timeline:view()` with `animation-range:entry 6% cover 22%` |
| `om-draw` | `scaleX(0)→1`, `transform-origin:left`, 0.75–1s | The 2px rules, so they draw in |
| `om-wipe` | `clip-path:inset(100% 0 0 0)→inset(0)`, 0.9s | Red close band; also the dashboard completion flash (as a `scaleX` variant) |
| `om-ink` | `stroke-dashoffset 100→0` on a `pathLength="100"` path, 9s infinite | Landing: the signature drawing itself, second stroke delayed 0.55s |
| `om-type` | `clip-path` reveal, `steps(12,end)`, 9s infinite | Landing: "Ada Lovelace" typing under the signature line |
| `om-caret` | opacity blink, 1.05s `steps(1,end)` | The 2px accent caret after the typed name |
| `om-spin` | 0.7s linear infinite | Button spinners |
| `om-pulse` | opacity 1→.25→1, 1.8s | The dashboard's live-polling square |

`@media (prefers-reduced-motion: reduce)` kills every animation and `clip-path`, and the
signature paths are forced to `stroke-dashoffset:0` so they stay visible.

### Responsive

No media queries except the two noted (the signer panel's border side, reduced motion).
Everything else is `clamp()` padding, `flex-wrap` with `flex-basis` minimums, and
`auto-fit` grids. Verified at 375px: no horizontal overflow on any screen; the signer panel
becomes a sheet below the document; the dashboard's signer table scrolls horizontally
inside its wrapper. Tap targets are 38px minimum, 42–50px for anything primary.

### Accessibility

Real `<label>` on every input (placeholders are never the only label); errors tied with
`aria-describedby` and announced with `role="alert"`; a visually-hidden polite live region
carries status changes (file attached, copied, signature captured, signed); the 2px accent
`:focus-visible` ring is never removed; status is never colour alone; the document canvas is
labelled with document and page, and "Download a copy" is the escape hatch for anyone who
can't use it. The whole signer flow, placement included, completes from the keyboard.

---

## State management

Frontend state, per screen (the prototypes keep it all in component state; use whatever the
codebase prefers):

**S1** — `{title, requesterEmail, signers:[{email,name}], file:{name,size,pages}|null,
ui:'idle'|'dragging'|'wrongtype'|'toolarge'|'uploading'|'error', error}`. Derived:
submit-enabled, the hint string, the signer cap.

**S2** — the `POST /api/documents` response, plus `copied:<id>|''`.

**S3** — `{doc, loading, refreshError, notFound, celebrate, now}` where `doc` is the
dashboard payload; `now` ticks every second for relative times; `celebrate` is set on the
pending→completed transition and self-clears after 6s.

**S4** — `{loading, refreshError, phase:'wait'|'place'|'placed'|'submitting'|'done',
page, box:{page,x,y,w}|null, ghost:{x,y,w}|null, name, ink:<dataURL>|null, inkAspect,
strokes:Point[][], printedName:'under'|'none', err409, signedAt}` plus the measured page
width in px (needed for the 14px reserve maths).

Data fetching follows `DESIGN-HANDOFF.md` §5, with the diffs below.

---

## Deviations from `DESIGN-HANDOFF.md`

**Every one of these was a deliberate decision during the design pass. Follow the design,
not the spec, where they disagree.**

1. **§10 design tokens are replaced wholesale.** The spec's deep-green / system-font /
   10px-radius palette is gone; the product is built on the Modernist design system — red
   `#ec3013` accent, Archivo throughout, **zero radius everywhere**, 2px rules, no shadows.
   The token table above is authoritative. Because the palette is mono, status is carried by
   an accent-filled pill (Signed / Completed) against a neutral pill (Pending) plus the word
   itself — there is no amber/green/red status trio.

2. **The audit trail is removed** — the biggest change. §4's `events` table, §5's `events`
   array on the dashboard payload, and §9's audit-trail list are all cut, because they
   recorded signer IP addresses and user agents. **Do not build the `events` table, do not
   log `ip`/`user_agent` anywhere, and drop the `downloaded` event.** `signers.signed_at` is
   still stored and is what the dashboard's per-signer times read from. If a reviewer asks
   for §R8's "audit trail" extra, the honest answer is that it was traded away on privacy
   grounds; the sequential-signer state machine and live status tracking are the extras
   being shown instead.

3. **§6.1's caption is not drawn.** No `name — ISO8601 — doc <id>` line under the signature.
   Instead the signer chooses **"Under the ink"** — their typed name printed 8px/700,
   centre-aligned, under a 1px signature line, with the ink overlapping it — or **"None"**,
   which stamps only the drawn ink. No timestamp and no document id ever appear on the page.
   API impact: `POST /api/sign/:token` gains `printedName: 'under' | 'none'`, and the
   stamping function needs the 14px reserve maths above.

4. **A landing page was added** at `/`, ahead of S1. It is not in §9. Its CTAs go to the
   create-request screen.

5. **The dashboard's signer list is a `<table>` with fixed column widths**, not a flex row
   list, so the "Copy signing link" → "Copied" swap cannot shift the layout.

6. **A brand mark was added** (see Assets) and appears in every header, linking home.

7. **The requester dashboard's 404 is rendered inline** as the S5 card rather than a
   redirect, so the URL the requester saved stays in the address bar.

8. **§11's optional "Type instead" tab is not built.** It was the spec's own first thing to
   cut.

9. **§9's S2 "note that only signer 1's link works" is placed in the section header**, and
   each row carries its own state label ("Live now" / "Unlocks after 1").

### API contract diffs (against §5)

- `GET /api/docs/:requesterToken` → **remove** `events` from the payload.
- `POST /api/sign/:token` → **add** `printedName: 'under' | 'none'` (default `'under'`).
- Everything else — routes, error codes, the opaque 404 rule, relative URLs, the
  `hasSignedVersion` flag — is unchanged.

### What the prototypes fake

- The document is DOM text, not a rendered PDF. Production uses pdf.js per §11.
- "Download a copy", "View signed document" and the dashboard download only announce; they
  don't produce a file.
- Tokens are generated client-side with `crypto.getRandomValues` purely so the links look
  real; URLs are hardcoded to `https://inksign.app`. The real frontend prefixes
  `location.origin` onto the relative URLs the API returns.
- The dev bar's "Sign as 1", "404 token", "Refresh error" and state chips simulate server
  transitions. None of it ships.
- One canned signature (an inline SVG scrawl) stands in for drawn ink in the forced states.

---

## Assets

- **Brand mark** — inline SVG, no image files: a 24×24 `#ec3013` square containing a
  `#f3f2f2` baseline (`M4 16.8h16`, 1.5px) and a signature stroke
  (`M6 19.2c2.7 0 2.2-11.4 6-11.4 3 0 1.4 8.6 4.4 8.6 1.3 0 1.9-.9 2.5-2`, 2px, round caps).
  Rendered at 21px beside the wordmark, 9px gap.
- **Icons** — simple inline SVG paths in the Lucide idiom (x, plus, chevrons, download,
  pen). 14–15px, `stroke-width` 2–2.4, `currentColor`. Swap in real Lucide if the codebase
  already has it.
- **Fonts** — Archivo 400/600/800 from Google Fonts, imported by `styles.css`.
- **No photography.** The design uses none; don't add stock imagery.

---

## Files in this bundle

| File | What it is |
|---|---|
| `InkSign - Landing.dc.html` | Landing page, with the two idle animations |
| `InkSign.dc.html` | S1 → S2 → S3, wired end to end, with all S1 states and the dashboard's loading / refresh-error / 404 / completion states |
| `InkSign - Signer.dc.html` | S4, all five states, live placement and a working signature pad |
| `InkSign - Invalid link.dc.html` | S5 |
| `styles.css` | The Modernist design-system stylesheet — the token source of truth |
| `DESIGN-HANDOFF.md` | The upstream engineering spec: data model, API contract, signing engine, security, tests, deploy checklist |

The `.dc.html` files reference a runtime (`support.js`) that is not included; open them from
the original project if you want them live, or read them as source. Their dev bars are
prototyping tools and are not part of the product.

## Suggested build order

1. Elysia + Bun skeleton, SQLite schema (**minus the `events` table**), static serving with
   the SPA fallback for `/d/:token` and `/s/:token`.
2. `sign.ts` — the stamping maths including the 14px printed-name reserve — and its unit
   tests. This is the highest-risk code and the most test-worthy.
3. `POST /api/documents` + S1, including every error state.
4. S2, then `GET /api/docs/:requesterToken` + S3 with polling.
5. `GET/POST /api/sign/:token` + S4: placement first, then the pad, then submit and the 409.
6. S5 and the opaque-404 behaviour on every token route.
7. CI (`bunx tsc --noEmit` → `bun test` → `bun run build`), then Fly deploy per §15.
