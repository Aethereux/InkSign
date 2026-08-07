import { useRef, useState } from "react";
import { DIVIDER, Header, HELPER, LiveRegion, MUTED, SectionHead, Spinner } from "../components/Chrome";
import { createDocument, RequestFailed, type CreatedDoc } from "../lib/api";
import { absoluteUrl, humanSize, isEmail, ordinal, short } from "../lib/format";

const MAX_MB = 10;
const CAP = 5;

type SignerRow = { email: string; name: string };
type Attached = { file: File; label: string };
type Ui = "idle" | "wrongtype" | "toolarge" | "uploading" | "error";

export default function Create() {
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [signers, setSigners] = useState<SignerRow[]>([{ email: "", name: "" }]);
  const [attached, setAttached] = useState<Attached | null>(null);
  const [ui, setUi] = useState<Ui>("idle");
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [created, setCreated] = useState<CreatedDoc | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  if (created) return <Sent doc={created} onRestart={() => location.assign("/new")} />;

  const busy = ui === "uploading";
  const validEmails = isEmail(email) && isEmail(signers[0]?.email ?? "");
  const ready = !!title.trim() && !!attached && validEmails;

  let hint = "Signers get their links in the order above.";
  if (!title.trim()) hint = "Add a title, your email, one signer and a PDF to send.";
  else if (!attached) hint = "A PDF is still missing.";
  else if (!validEmails) hint = "Check the email addresses — yours and signer 1's.";
  if (busy) hint = "Uploading the PDF and minting the links.";

  async function handleFile(file: File | null | undefined) {
    setDrag(false);
    if (!file) return;
    if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      setAttached(null);
      setUi("wrongtype");
      return setErr("That's not a PDF. Only PDF files can be signed.");
    }
    if (file.size / 1048576 > MAX_MB) {
      setAttached(null);
      setUi("toolarge");
      return setErr(`That file is ${humanSize(file.size)}. The limit is ${MAX_MB} MB.`);
    }
    setUi("idle");
    setErr("");
    setAttached({ file, label: humanSize(file.size) });
    // Page count is read in the browser so the summary confirms the PDF actually parses
    // before anything is uploaded. Imported dynamically: pdf.js is ~400 kB and nobody
    // landing on this screen should pay for it until they pick a file.
    const { pageCount } = await import("../lib/pdf");
    const pages = await pageCount(file);
    if (pages === null) {
      setAttached(null);
      setUi("wrongtype");
      return setErr("That PDF couldn't be read. It may be corrupt or password-protected.");
    }
    setAttached({ file, label: `${humanSize(file.size)} · ${pages} ${pages === 1 ? "page" : "pages"}` });
    setAnnounce(`${file.name} attached, ${pages} pages.`);
  }

  async function submit() {
    if (!ready || !attached) return;
    setUi("uploading");
    setErr("");
    const form = new FormData();
    form.set("title", title.trim());
    form.set("requesterEmail", email.trim());
    form.set(
      "signers",
      JSON.stringify(
        signers
          .filter((s) => isEmail(s.email))
          .map((s) => ({ email: s.email.trim(), name: s.name.trim() || undefined })),
      ),
    );
    form.set("file", attached.file);
    try {
      const doc = await createDocument(form);
      setAnnounce(`Request created. ${doc.signers.length} signer links ready.`);
      setCreated(doc);
    } catch (e) {
      // Nothing is ever cleared on failure — re-entering five signer emails because the
      // PDF was too big is the kind of thing that makes a reviewer wince.
      setUi("error");
      setErr(e instanceof RequestFailed ? e.message : "We couldn't reach the server. Nothing was lost — your details are still here, so try sending again.");
    }
  }

  const setRow = (i: number, patch: Partial<SignerRow>) =>
    setSigners((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="page">
      <Header step="Request · Step 1 of 3" />
      <LiveRegion message={announce} />

      {ui === "error" && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
            background: "#fff2ef",
            borderBottom: "2px solid #ec3013",
            padding: "14px clamp(16px,4vw,32px)",
          }}
        >
          <span className="micro" style={{ color: "#ae1800" }}>Not sent</span>
          <span style={{ fontSize: 13.5, color: "#7c1405", maxWidth: "62ch" }}>{err}</span>
        </div>
      )}

      <main className="wrap" style={{ maxWidth: 1180, display: "flex", flexWrap: "wrap", gap: 32, padding: "32px clamp(16px,4vw,32px)", flex: 1 }}>
        <div style={{ flex: "1 1 540px", minWidth: 280 }}>
          <section style={{ marginBottom: 40 }}>
            <SectionHead n="01" label="Document" />
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
              <div className="field" style={{ flex: "1 1 240px" }}>
                <label htmlFor="title">Title</label>
                <input id="title" className="input" style={{ height: 42 }} value={title} disabled={busy}
                  autoFocus onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="field" style={{ flex: "1 1 240px" }}>
                <label htmlFor="reqemail">Your email</label>
                <input id="reqemail" className="input" style={{ height: 42 }} type="email" value={email}
                  disabled={busy} onChange={(e) => setEmail(e.target.value)} aria-describedby="reqemail-help" />
                <p id="reqemail-help" style={{ fontSize: 12.5, color: HELPER, margin: "5px 0 0" }}>
                  Labels the request. No account needed.
                </p>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
              onDrop={(e) => { e.preventDefault(); if (!busy) void handleFile(e.dataTransfer.files?.[0]); }}
              style={{
                position: "relative", minHeight: 148, border: `2px solid ${drag ? "#ec3013" : DIVIDER}`,
                background: drag ? "#fff2ef" : "transparent", display: "flex", flexDirection: "column",
                justifyContent: "center", gap: 10, padding: 22,
              }}
            >
              {attached ? (
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                    <p style={{ font: "800 19px/1.2 Archivo, sans-serif", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {attached.file.name}
                    </p>
                    <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>{attached.label}</p>
                  </div>
                  <button type="button" className="btn btn-secondary btn-center" style={{ marginLeft: "auto", height: 38 }}
                    disabled={busy} onClick={() => picker.current?.click()}>
                    Replace
                  </button>
                </div>
              ) : (
                <>
                  <p style={{ font: "800 19px/1.2 Archivo, sans-serif", margin: 0 }}>Drop the PDF here</p>
                  <button type="button" className="btn btn-secondary btn-center" style={{ alignSelf: "flex-start", height: 38 }}
                    disabled={busy} onClick={() => picker.current?.click()}>
                    Choose a file
                  </button>
                </>
              )}
              {drag && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#fff2ef", pointerEvents: "none" }}>
                  <span style={{ font: "800 19px/1 Archivo, sans-serif", color: "#ae1800" }}>Drop to attach</span>
                </div>
              )}
              <input ref={picker} type="file" accept="application/pdf,.pdf" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void handleFile(f); }} />
            </div>
            {(ui === "wrongtype" || ui === "toolarge") && (
              <p role="alert" style={{ fontSize: 13, color: "#ae1800", margin: "10px 0 0" }}>{err}</p>
            )}
          </section>

          <section>
            <SectionHead n="02" label="Signers" aside={`${signers.length} of ${CAP}`} />
            <div style={{ display: "flex", gap: 12, paddingBottom: 8, borderBottom: `2px solid ${DIVIDER}` }}>
              <span className="micro" style={{ flex: "0 0 82px", color: MUTED }}>Order</span>
              <span className="micro" style={{ flex: "1 1 200px", color: MUTED }}>Email</span>
              <span className="micro" style={{ flex: "1 1 140px", color: MUTED }}>Name (optional)</span>
              <span style={{ flex: "0 0 38px" }} />
            </div>
            {signers.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${DIVIDER}` }}>
                <div style={{ flex: "0 0 82px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge">{i + 1}</span>
                  <span className="micro" style={{ color: MUTED }}>{short(i)}</span>
                </div>
                <input className="input" style={{ flex: "1 1 200px", height: 40 }} type="email" disabled={busy}
                  aria-label={`Signer ${i + 1} email`} placeholder="name@company.com"
                  value={row.email} onChange={(e) => setRow(i, { email: e.target.value })} />
                <input className="input" style={{ flex: "1 1 140px", height: 40 }} disabled={busy}
                  aria-label={`Signer ${i + 1} name`} value={row.name}
                  onChange={(e) => setRow(i, { name: e.target.value })} />
                {signers.length > 1 ? (
                  <button type="button" className="btn btn-icon btn-ghost" style={{ flex: "0 0 38px" }} disabled={busy}
                    aria-label={`Remove signer ${i + 1}`}
                    onClick={() => setSigners((rows) => rows.filter((_, j) => j !== i))}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                ) : (
                  <span style={{ flex: "0 0 38px" }} />
                )}
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-center" style={{ marginTop: 16, height: 40 }}
              disabled={busy || signers.length >= CAP}
              onClick={() => setSigners((rows) => [...rows, { email: "", name: "" }])}>
              Add signer
            </button>
          </section>
        </div>

        <aside style={{ flex: "0 1 320px", minWidth: 280, border: `2px solid ${DIVIDER}`, padding: 22, alignSelf: "flex-start" }}>
          <SectionHead n="03" label="Then" />
          {[
            "You get one link per signer, plus a dashboard link of your own.",
            "Signers unlock in the order above — signer 2 waits for signer 1.",
            "The signed PDF is on your dashboard as soon as the first signature lands.",
          ].map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <span style={{ font: "800 13px/1.5 Archivo, sans-serif", color: "#ec3013", flex: "none" }}>0{i + 1}</span>
              <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>{line}</p>
            </div>
          ))}
          <hr className="hr" />
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: "rgba(32,30,29,.8)" }}>
            There are no accounts. Your dashboard link is the only way back to a request, so keep it.
          </p>
        </aside>
      </main>

      <div style={{ display: "flex", flexWrap: "wrap", borderTop: `2px solid ${DIVIDER}` }}>
        <button type="button" className="btn btn-primary" style={{ flex: "1 1 320px", height: 64, fontSize: 18, padding: "0 32px", gap: 10 }}
          disabled={!ready && !busy} aria-disabled={busy} onClick={() => void submit()}>
          {busy ? <><Spinner /> Sending…</> : "Send for signature"}
        </button>
        <p style={{ flex: "1 1 260px", display: "flex", alignItems: "center", margin: 0, padding: "0 24px", fontSize: 12, color: MUTED, borderLeft: `2px solid ${DIVIDER}` }}>
          {hint}
        </p>
      </div>
    </div>
  );
}

function Sent({ doc, onRestart }: { doc: CreatedDoc; onRestart: () => void }) {
  const [copied, setCopied] = useState("");
  const [announce, setAnnounce] = useState("");
  const dashUrl = absoluteUrl(doc.requesterUrl);

  function copy(id: string, text: string) {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
    setAnnounce("Link copied.");
    setTimeout(() => setCopied(""), 1700);
  }

  return (
    <div className="page">
      <Header step="Sent · Step 2 of 3" />
      <LiveRegion message={announce} />
      <main className="wrap" style={{ maxWidth: 1000, padding: "40px clamp(16px,4vw,32px)", flex: 1 }}>
        <h1 style={{ fontSize: 38, margin: "0 0 12px" }}>Your request is out for signature.</h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, maxWidth: "62ch", color: "rgba(32,30,29,.8)", margin: "0 0 32px" }}>
          {doc.signers.length === 1
            ? "One signer link is ready. Send it however you like — email, chat, carrier pigeon."
            : `${doc.signers.length} signer links are ready, one per person, unlocking in order. Send them however you like.`}
        </p>

        <section style={{ marginBottom: 40 }}>
          <SectionHead n="01" label="Signer links" aside="Only signer 1's link works now — the rest unlock in order" />
          {doc.signers.map((s, i) => {
            const url = absoluteUrl(s.signUrl);
            return (
              <div key={s.signUrl} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${DIVIDER}` }}>
                <div style={{ flex: "0 0 96px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge">{i + 1}</span>
                  <span className="micro" style={{ color: i === 0 ? "#ae1800" : MUTED }}>
                    {i === 0 ? "Live now" : `Unlocks after ${i}`}
                  </span>
                </div>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <p style={{ font: "800 14px/1.3 Archivo, sans-serif", margin: "0 0 5px" }}>{s.email}</p>
                  <input className="input" readOnly value={url} style={{ fontSize: 12.5, height: 34 }}
                    aria-label={`Signing link for ${s.email}`} onFocus={(e) => e.currentTarget.select()} />
                </div>
                <button type="button" className="btn btn-secondary btn-center" style={{ flex: "0 0 112px", width: 112, height: 38 }}
                  onClick={() => copy(`l${i}`, url)}>
                  {copied === `l${i}` ? "Copied" : "Copy link"}
                </button>
                <a className="btn btn-ghost btn-center" href={s.signUrl} style={{ height: 38 }}>Open</a>
              </div>
            );
          })}
        </section>

        <section>
          <SectionHead n="02" label="Your dashboard link" />
          <div style={{ border: "2px solid #ec3013", background: "#fff2ef", padding: 22 }}>
            <p style={{ font: "800 20px/1.35 Archivo, sans-serif", color: "#7c1405", maxWidth: "44ch", margin: "0 0 18px" }}>
              Save this link. It's the only way back to this request — there are no accounts.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input className="input" readOnly value={dashUrl} aria-label="Your dashboard link"
                style={{ flex: "1 1 260px", fontSize: 12.5, height: 38, background: "#f3f2f2", borderColor: "#ec3013" }}
                onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-primary btn-center" style={{ flex: "0 0 112px", width: 112, height: 38 }}
                onClick={() => copy("dash", dashUrl)}>
                {copied === "dash" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </section>
      </main>

      <div style={{ display: "flex", flexWrap: "wrap", borderTop: `2px solid ${DIVIDER}` }}>
        <a className="btn btn-primary" href={doc.requesterUrl} style={{ flex: "1 1 320px", height: 64, fontSize: 18, padding: "0 32px" }}>
          Open dashboard
        </a>
        <button type="button" className="btn btn-secondary" style={{ flex: "1 1 260px", height: 64, fontSize: 15, padding: "0 24px", borderWidth: 0, borderLeft: `2px solid ${DIVIDER}` }}
          onClick={onRestart}>
          Create another request
        </button>
      </div>
    </div>
  );
}
