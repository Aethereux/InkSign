import { useCallback, useEffect, useRef, useState } from "react";
import { DIVIDER, Header, HELPER, InvalidLinkCard, LiveRegion, MUTED, SectionHead } from "../components/Chrome";
import { getDashboard, RequestFailed, type Dashboard as Doc } from "../lib/api";
import { absolute, absoluteUrl, ordinal, relative } from "../lib/format";

const POLL_MS = 5000;

export default function Dashboard({ token }: { token: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [copied, setCopied] = useState("");
  const [announce, setAnnounce] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const wasPending = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getDashboard(token);
      // Fire the celebration on the transition only, never on a reload of an already
      // completed request — otherwise it replays on every visit.
      if (wasPending.current && next.status === "completed") {
        setCelebrate(true);
        setAnnounce("Everyone has signed. The final PDF is ready.");
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setTimeout(() => setCelebrate(false), 6000);
        }
      }
      wasPending.current = next.status === "pending";
      setDoc(next);
      setRefreshError(false);
    } catch (e) {
      if (e instanceof RequestFailed && e.status === 404) setNotFound(true);
      // Any other failure keeps the last good data on screen rather than blanking it.
      else setRefreshError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => void refresh(), [refresh]);

  // Relative times re-render on a 1s tick; the poll only runs while there's news to expect.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (notFound || doc?.status === "completed") return;
    const poll = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(poll);
  }, [notFound, doc?.status, refresh]);

  function copy(id: string, text: string) {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
    setAnnounce("Link copied.");
    setTimeout(() => setCopied(""), 1700);
  }

  if (notFound) {
    return (
      <div className="page">
        <Header step="Dashboard · 404" />
        <InvalidLinkCard body="It may have been mistyped, or the request may have been removed. Dashboard links are long — check nothing was cut off when it was copied." />
      </div>
    );
  }

  if (loading || !doc) {
    return (
      <div className="page">
        <Header step="Dashboard · Step 3 of 3" />
        <main className="wrap" style={{ maxWidth: 1060, padding: "36px clamp(16px,4vw,32px)" }}>
          <div style={{ height: 38, width: "min(420px,80%)", background: "#eae9e9", marginBottom: 14 }} />
          <div style={{ height: 16, width: "min(320px,60%)", background: "#eae9e9", marginBottom: 30 }} />
          <div style={{ height: 12, background: "#eae9e9", marginBottom: 30 }} />
          <div style={{ height: 200, background: "#eae9e9" }} />
          <p style={{ fontSize: 13, color: MUTED, marginTop: 16 }}>Loading the request…</p>
        </main>
      </div>
    );
  }

  const signed = doc.signers.filter((s) => s.status === "signed").length;
  const total = doc.signers.length;
  const nextIdx = doc.signers.findIndex((s) => s.status !== "signed");
  const pending = doc.status === "pending";

  return (
    <div className="page">
      <Header step={pending ? "Dashboard · Step 3 of 3" : "Dashboard · Complete"} />
      <LiveRegion message={announce} />

      {celebrate && (
        <div style={{ position: "relative", overflow: "hidden", background: "#ec3013", color: "#f3f2f2", padding: "14px clamp(16px,4vw,32px)" }}>
          <div style={{ position: "absolute", inset: 0, background: "#ae1800", transformOrigin: "left", animation: "om-wipe .45s cubic-bezier(.2,.75,.2,1) both" }} />
          <div style={{ position: "relative", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong style={{ font: "800 15px/1.3 Archivo, sans-serif" }}>Everyone has signed.</strong>
            <span style={{ fontSize: 13.5 }}>The final PDF is ready to download below.</span>
          </div>
        </div>
      )}

      {refreshError && (
        <div role="status" style={{ display: "flex", gap: 12, flexWrap: "wrap", background: "#eae9e9", padding: "12px clamp(16px,4vw,32px)", borderBottom: `1px solid ${DIVIDER}` }}>
          <span className="micro" style={{ color: "#ae1800" }}>Offline</span>
          <span style={{ fontSize: 13, color: MUTED }}>Couldn't refresh — retrying. Everything below is the last good copy.</span>
        </div>
      )}

      <main className="wrap" style={{ maxWidth: 1060, padding: "36px clamp(16px,4vw,32px)", flex: 1 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <h1 style={{ fontSize: 34, margin: 0, flex: "1 1 auto" }}>{doc.title}</h1>
          <span
            className="tag"
            style={{
              font: "800 11px/1 Archivo, sans-serif", letterSpacing: ".09em", textTransform: "uppercase",
              padding: "8px 12px",
              background: pending ? "#f8f4f4" : "#ec3013",
              color: pending ? "#444141" : "#f3f2f2",
            }}
          >
            {pending ? "Pending" : "Completed"}
          </span>
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: "10px 0 0" }}>
          {doc.filename} · {doc.pageCount} pages · created {relative(doc.createdAt, now)} by {doc.requesterEmail}
        </p>

        <hr className="hr" style={{ margin: "22px 0 26px" }} />

        <section style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline", marginBottom: 14 }}>
            <strong style={{ font: "800 30px/1 Archivo, sans-serif" }}>
              {signed} of {total} signed
            </strong>
            <span style={{ fontSize: 13, color: MUTED }}>
              {pending
                ? nextIdx >= 0 && `Waiting on ${doc.signers[nextIdx]!.email}`
                : `Completed ${relative(doc.completedAt, now)}`}
            </span>
            <span className="micro" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, color: HELPER }}>
              {pending && <span aria-hidden style={{ width: 7, height: 7, background: "#ec3013", animation: "om-pulse 1.8s ease-in-out infinite" }} />}
              {pending ? "Live · checks every 5s" : "No longer polling"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 3 }} aria-hidden>
            {doc.signers.map((s, i) => (
              <div key={i} style={{ flex: 1, height: 12, background: s.status === "signed" ? "#ec3013" : "#d7d3d3" }} />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <SectionHead n="01" label="Signers" />
          {/* Fixed column widths so the Copy → Copied swap can't shift the layout, and the
              whole table scrolls on a phone rather than being crushed. */}
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ width: 52 }} /><col /><col style={{ width: 112 }} />
                <col style={{ width: 168 }} /><col style={{ width: 210 }} />
              </colgroup>
              <thead>
                <tr><th>#</th><th>Signer</th><th>Status</th><th>Signed</th><th>Link</th></tr>
              </thead>
              <tbody>
                {doc.signers.map((s, i) => (
                  <tr key={s.signUrl}>
                    <td><span className="badge">{i + 1}</span></td>
                    <td>
                      <p style={{ font: "800 14.5px/1.3 Archivo, sans-serif", margin: "0 0 3px" }}>{s.email}</p>
                      <p style={{ fontSize: 11.5, color: MUTED, margin: 0 }}>
                        {s.status === "signed"
                          ? `Signed as ${s.name}`
                          : i === nextIdx
                            ? `${ordinal(i)} · link is live`
                            : `${ordinal(i)} · link inert until ${i}`}
                      </p>
                    </td>
                    <td>
                      <span className="tag" style={{
                        font: "800 11px/1 Archivo, sans-serif", letterSpacing: ".09em", textTransform: "uppercase",
                        padding: "6px 10px",
                        background: s.status === "signed" ? "#ec3013" : "#f8f4f4",
                        color: s.status === "signed" ? "#f3f2f2" : "#444141",
                      }}>
                        {s.status === "signed" ? "Signed" : "Pending"}
                      </span>
                    </td>
                    <td>
                      {s.signedAt ? (
                        <span style={{ fontSize: 13, color: MUTED }} title={absolute(s.signedAt)}>
                          {relative(s.signedAt, now)}
                        </span>
                      ) : pending && i === nextIdx ? (
                        <span className="micro" style={{ color: "#ae1800" }}>Waiting on this signer</span>
                      ) : (
                        <span style={{ color: HELPER }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button type="button" className="btn btn-ghost" style={{ flex: 1, height: 34, fontSize: 12.5 }}
                          onClick={() => copy(`r${i}`, absoluteUrl(s.signUrl))}>
                          {copied === `r${i}` ? "Copied" : "Copy signing link"}
                        </button>
                        <a className="btn btn-ghost btn-center" href={s.signUrl} style={{ height: 34, fontSize: 12.5 }}>Open</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ border: `2px solid ${DIVIDER}`, padding: 22, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 300px" }}>
            <h3 style={{ fontSize: 19, margin: "0 0 6px" }}>
              {doc.hasSignedVersion
                ? pending ? `Current version · v${doc.latestVersion}` : "Signed document · final"
                : "Nothing signed yet"}
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: 0, maxWidth: "58ch" }}>
              {doc.hasSignedVersion
                ? pending
                  ? `Not everyone has signed yet. This copy carries the ${signed} signature${signed === 1 ? "" : "s"} collected so far.`
                  : `All ${total} signatures are on this copy.`
                : "The signed PDF appears here the moment the first signature lands."}
            </p>
          </div>
          {doc.hasSignedVersion ? (
            <a className="btn btn-primary btn-center" href={`/api/docs/${token}/file`} style={{ height: 46, padding: "0 20px", gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 19h16" />
              </svg>
              {pending ? "Download current version" : "Download signed PDF"}
            </a>
          ) : (
            <p style={{ fontSize: 12.5, color: HELPER, margin: 0 }}>Nothing to download yet — no one has signed.</p>
          )}
        </section>
      </main>
    </div>
  );
}
