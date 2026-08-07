import { useCallback, useEffect, useRef, useState } from "react";
import { boxHeight, clamp, NAME_SIZE, RULE_OFFSET, INK_OFFSET, type PrintedName } from "../../src/geometry";
import PdfPage, { type PageMetrics } from "../components/PdfPage";
import SignaturePad, { type Ink } from "../components/SignaturePad";
import { Brand, DIVIDER, HELPER, InvalidLinkCard, LiveRegion, MUTED, Spinner } from "../components/Chrome";
import { getSignerView, RequestFailed, submitSignature, type SignerView } from "../lib/api";

const POLL_MS = 10_000;
const DEFAULT_W = 0.26;
const DEFAULT_ASPECT = 0.32;

type Phase = "wait" | "place" | "placed" | "submitting" | "done";
type Box = { page: number; x: number; y: number; w: number };

export default function Signer({ token }: { token: string }) {
  const [view, setView] = useState<SignerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [metrics, setMetrics] = useState<PageMetrics | null>(null);

  const [box, setBox] = useState<Box | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number } | null>(null);
  const [name, setName] = useState("");
  const [ink, setInk] = useState<Ink>(null);
  const [printedName, setPrintedName] = useState<PrintedName>("under");
  const [phase, setPhase] = useState<Phase>("place");
  const [conflict, setConflict] = useState(false);
  const [announce, setAnnounce] = useState("");

  const pageEl = useRef<HTMLDivElement>(null);
  const nameEl = useRef<HTMLInputElement>(null);
  const drag = useRef<"move" | "resize" | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const aspect = ink?.aspect ?? DEFAULT_ASPECT;

  const refresh = useCallback(async () => {
    try {
      const next = await getSignerView(token);
      setView(next);
      setRefreshError(false);
      setPhase((p) =>
        next.yourStatus === "signed" ? "done" : !next.yourTurn ? "wait" : p === "wait" ? "place" : p,
      );
    } catch (e) {
      if (e instanceof RequestFailed && e.status === 404) setNotFound(true);
      else setRefreshError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => void refresh(), [refresh]);

  useEffect(() => {
    if (notFound) return;
    fetch(`/api/sign/${token}/file`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("file"))))
      .then(setPdf)
      .catch(() => setPdfFailed(true));
  }, [token, notFound]);

  // Only poll while waiting for someone ahead; there is nothing to learn otherwise.
  useEffect(() => {
    if (notFound || phase !== "wait") return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [notFound, phase, refresh]);

  /**
   * Box height as a fraction of page height. The render scale cancels out of this ratio,
   * so it is computed straight from PDF points using the same helper the stamp uses.
   */
  const boxHFrac = useCallback(
    (w: number) =>
      metrics ? boxHeight(w * metrics.widthPt, aspect, printedName) / metrics.heightPt : 0.1,
    [metrics, aspect, printedName],
  );

  const fracFromEvent = (e: { clientX: number; clientY: number }) => {
    const r = pageEl.current!.getBoundingClientRect();
    // Normalised against the CSS box, never the pixel buffer — otherwise placement breaks
    // on HiDPI and only shows up on a retina screen.
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const fit = (v: number, size: number) => clamp(v, 0, Math.max(0, 1 - size));

  function placeAt(px: number, py: number) {
    const w = DEFAULT_W;
    const h = boxHFrac(w);
    setBox({ page, x: fit(px - w / 2, w), y: fit(py - h / 2, h), w });
    setGhost(null);
    setPhase("placed");
    setAnnounce(`Signature placed on page ${page + 1}. Draw your signature to preview it.`);
  }

  function clearPlacement() {
    setBox(null);
    setGhost(null);
    setPhase("place");
    setAnnounce("Placement cleared. Click any page to place it again.");
  }

  function onPageKey(e: React.KeyboardEvent) {
    if (phase === "place") {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const w = DEFAULT_W;
        setBox({ page, x: 0.5 - w / 2, y: fit(0.62, boxHFrac(w)), w });
        setPhase("placed");
        setAnnounce("Signature placed mid-page. Arrow keys nudge it.");
      }
      return;
    }
    if (phase !== "placed" || !box) return;
    const step = e.shiftKey ? 0.002 : 0.01;
    const h = boxHFrac(box.w);
    const set = (patch: Partial<Box>) => setBox({ ...box, ...patch });
    const keys: Record<string, () => void> = {
      ArrowLeft: () => set({ x: fit(box.x - step, box.w) }),
      ArrowRight: () => set({ x: fit(box.x + step, box.w) }),
      ArrowUp: () => set({ y: fit(box.y - step, h) }),
      ArrowDown: () => set({ y: fit(box.y + step, h) }),
      "+": () => set({ w: Math.min(0.9, box.w + 0.02) }),
      "=": () => set({ w: Math.min(0.9, box.w + 0.02) }),
      "-": () => set({ w: Math.max(0.08, box.w - 0.02) }),
      Escape: clearPlacement,
      Enter: () => nameEl.current?.focus(),
    };
    const fn = keys[e.key];
    if (fn) { e.preventDefault(); fn(); }
  }

  async function submit() {
    if (!box || !ink || !name.trim()) return;
    setPhase("submitting");
    setConflict(false);
    try {
      await submitSignature(token, {
        name: name.trim(),
        signaturePng: ink.dataUrl,
        printedName,
        placement: { page: box.page, x: box.x, y: box.y, w: box.w },
      });
      setAnnounce("Signed. The document has been returned to the requester.");
      await refresh();
      setPhase("done");
    } catch (e) {
      if (e instanceof RequestFailed && e.status === 409) {
        setConflict(true);
        setPhase("placed");
      } else {
        setRefreshError(true);
        setPhase("placed");
      }
    }
  }

  if (notFound) {
    return (
      <div className="page">
        <header style={{ display: "flex", gap: 16, padding: "16px clamp(14px,4vw,28px)", borderBottom: `2px solid ${DIVIDER}` }}>
          <Brand />
          <span className="micro" style={{ marginLeft: "auto", color: HELPER }}>404</span>
        </header>
        <InvalidLinkCard body="It may have been mistyped, or the request may have been removed. If someone sent it to you, ask them for a fresh link — signing links are long, and they don't survive being broken across two lines of an email." />
      </div>
    );
  }

  const total = view?.position.total ?? 1;
  const index = view?.position.index ?? 0;
  const pageCount = view?.pageCount ?? 1;
  const showBox = box?.page === page && (phase === "placed" || phase === "submitting" || phase === "done");
  const showPanel = phase === "placed" || phase === "submitting";
  const busy = phase === "submitting";
  const scale = metrics?.scale ?? 1;

  let signHint = "Type your name and draw a signature to enable this.";
  if (!name.trim() && ink) signHint = "Your name is still missing.";
  else if (name.trim() && !ink) signHint = "Draw your signature above — the pad is empty.";
  else if (name.trim() && ink) signHint = `This applies your signature to page ${(box?.page ?? 0) + 1} and returns the document to the requester.`;
  if (busy) signHint = "Stamping the PDF and handing it back.";

  return (
    <div className="page">
      <header style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", padding: "16px clamp(14px,4vw,28px)", borderBottom: `2px solid ${DIVIDER}` }}>
        <Brand />
        <div style={{ minWidth: 0 }}>
          <p style={{ font: "800 15px/1.25 Archivo, sans-serif", margin: 0 }}>{view?.docTitle ?? "…"}</p>
          <p className="micro" style={{ color: HELPER, margin: "3px 0 0" }}>
            You're signer {index + 1} of {total}
          </p>
        </div>
        <a className="btn btn-ghost btn-center" href={`/api/sign/${token}/file`} style={{ marginLeft: "auto", height: 36 }}>
          Download a copy
        </a>
      </header>
      <LiveRegion message={announce} />

      {refreshError && (
        <div role="status" style={{ display: "flex", gap: 12, flexWrap: "wrap", background: "#eae9e9", padding: "12px clamp(14px,4vw,28px)" }}>
          <span className="micro" style={{ color: "#ae1800" }}>Offline</span>
          <span style={{ fontSize: 13, color: MUTED }}>
            Couldn't check whether it's your turn — retrying. Anything you've drawn is still here.
          </span>
        </div>
      )}

      {loading ? (
        <main style={{ padding: "clamp(14px,4vw,28px)", flex: 1 }}>
          <div style={{ height: 34, width: "min(360px,70%)", background: "#eae9e9", marginBottom: 16 }} />
          <div style={{ maxWidth: 620, aspectRatio: "17/22", background: "#eae9e9", border: `2px solid ${DIVIDER}` }} />
          <p style={{ fontSize: 13, color: MUTED, marginTop: 14 }}>Opening the document…</p>
        </main>
      ) : (
        <>
          <StateBand
            phase={phase}
            view={view}
            box={box}
            onClear={clearPlacement}
            signedAt={view?.signedAt ?? null}
            remaining={view?.remainingSigners ?? 0}
            token={token}
          />

          <main style={{ display: "flex", flexWrap: "wrap", flex: 1, alignItems: "stretch" }}>
            <div style={{ flex: "1 1 560px", minWidth: 280, padding: "clamp(14px,4vw,28px)" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12, maxWidth: 620, margin: "0 auto 12px" }}>
                <button type="button" className="btn btn-icon btn-secondary" aria-label="Previous page"
                  disabled={page === 0} onClick={() => { setPage((p) => Math.max(0, p - 1)); setGhost(null); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                <button type="button" className="btn btn-icon btn-secondary" aria-label="Next page"
                  disabled={page >= pageCount - 1} onClick={() => { setPage((p) => Math.min(pageCount - 1, p + 1)); setGhost(null); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                </button>
                <span className="micro" style={{ color: MUTED }}>Page {page + 1} of {pageCount}</span>
                <span style={{ marginLeft: "auto", fontSize: 12.5, color: HELPER, textAlign: "right" }}>
                  {phase === "place"
                    ? `Signature usually goes on the execution page (${pageCount})`
                    : box
                      ? box.page === page ? "Your signature is on this page" : `Your signature is on page ${box.page + 1}`
                      : ""}
                </span>
              </div>

              <div
                ref={pageEl}
                tabIndex={0}
                role="group"
                aria-label={`${view?.docTitle ?? "Document"}, page ${page + 1} of ${pageCount}`}
                onKeyDown={onPageKey}
                onClick={(e) => {
                  if (phase !== "place" || moved.current) { moved.current = false; return; }
                  const p = fracFromEvent(e);
                  placeAt(p.x, p.y);
                }}
                onPointerMove={(e) => {
                  if (drag.current && box) {
                    const p = fracFromEvent(e);
                    moved.current = true;
                    if (drag.current === "move") {
                      setBox({ ...box, x: fit(p.x - dragOffset.current.x, box.w), y: fit(p.y - dragOffset.current.y, boxHFrac(box.w)) });
                    } else {
                      setBox({ ...box, w: clamp(p.x - box.x, 0.08, 0.9) });
                    }
                    return;
                  }
                  if (phase === "place") {
                    const p = fracFromEvent(e);
                    const h = boxHFrac(DEFAULT_W);
                    setGhost({ x: fit(p.x - DEFAULT_W / 2, DEFAULT_W), y: fit(p.y - h / 2, h), w: DEFAULT_W });
                  }
                }}
                onPointerUp={() => { drag.current = null; }}
                onPointerLeave={() => { drag.current = null; setGhost(null); }}
                style={{
                  position: "relative", maxWidth: 620, margin: "0 auto", background: "#fff",
                  border: `2px solid ${DIVIDER}`, overflow: "hidden",
                  cursor: phase === "place" ? "crosshair" : "default",
                  minHeight: metrics ? undefined : 400,
                }}
              >
                {pdfFailed ? (
                  <div style={{ padding: 24 }}>
                    <p style={{ font: "800 15px/1.3 Archivo, sans-serif", margin: "0 0 6px" }}>
                      The document couldn't be loaded.
                    </p>
                    <p style={{ fontSize: 13, color: MUTED, margin: 0, maxWidth: "48ch" }}>
                      Check your connection and reload. Your signing link is still valid.
                    </p>
                  </div>
                ) : (
                  <PdfPage data={pdf} pageNumber={page + 1} onMetrics={setMetrics} />
                )}

                {phase === "place" && ghost && (
                  <div aria-hidden style={{
                    position: "absolute", left: `${ghost.x * 100}%`, top: `${ghost.y * 100}%`,
                    width: `${ghost.w * 100}%`, height: `${boxHFrac(ghost.w) * 100}%`,
                    border: "1px dashed rgba(236,48,19,.85)", background: "rgba(255,242,239,.5)",
                    pointerEvents: "none",
                  }} />
                )}

                {showBox && box && (
                  <div
                    onPointerDown={(e) => {
                      if (phase !== "placed") return;
                      e.preventDefault();
                      const p = fracFromEvent(e);
                      drag.current = "move";
                      dragOffset.current = { x: p.x - box.x, y: p.y - box.y };
                    }}
                    style={{
                      position: "absolute", left: `${box.x * 100}%`, top: `${box.y * 100}%`,
                      width: `${box.w * 100}%`, height: `${boxHFrac(box.w) * 100}%`,
                      border: phase === "done" ? "none" : "1px dashed rgba(236,48,19,.85)",
                      cursor: phase === "placed" ? "move" : "default",
                    }}
                  >
                    {printedName === "under" && (
                      <>
                        <div style={{ position: "absolute", left: 0, right: 0, bottom: RULE_OFFSET * scale, height: 1, background: "rgba(32,30,29,.5)" }} />
                        <div style={{
                          position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center",
                          font: `700 ${NAME_SIZE * scale}px/1.4 Archivo, sans-serif`, color: "#201e1d",
                          whiteSpace: "nowrap", overflow: "hidden",
                        }}>
                          {name.trim() || "Your name"}
                        </div>
                      </>
                    )}
                    {ink ? (
                      <img src={ink.dataUrl} alt="" style={{
                        position: "absolute", left: 0, width: "100%",
                        bottom: printedName === "under" ? INK_OFFSET * scale : 0,
                      }} />
                    ) : (
                      <span className="micro" style={{ position: "absolute", left: 4, top: 3, fontSize: 9, color: "#ae1800" }}>
                        Signature here
                      </span>
                    )}
                    {phase === "placed" && (
                      <span
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); drag.current = "resize"; }}
                        style={{ position: "absolute", right: -5, bottom: -5, width: 12, height: 12, background: "#ec3013", cursor: "nwse-resize" }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {showPanel && (
              <aside style={{
                flex: "0 1 380px", minWidth: 280, padding: "clamp(14px,4vw,28px)",
                borderLeft: `2px solid ${DIVIDER}`,
              }}>
                <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>Sign the document</h2>
                <p style={{ fontSize: 13, color: MUTED, margin: "0 0 20px" }}>
                  Your name and signature appear where you placed the box — at that exact size.
                </p>

                {conflict && (
                  <div role="alert" style={{ border: "2px solid #ec3013", background: "#fff2ef", padding: 16, marginBottom: 20 }}>
                    <p style={{ font: "800 14px/1.35 Archivo, sans-serif", color: "#7c1405", margin: "0 0 6px" }}>
                      The order changed while you were signing.
                    </p>
                    <p style={{ fontSize: 13, color: "#7c1405", margin: "0 0 12px" }}>
                      Someone ahead of you signed a moment ago, so this document moved on. Nothing you drew was lost.
                    </p>
                    <button type="button" className="btn btn-primary btn-center" style={{ height: 38 }}
                      onClick={() => void refresh()}>
                      Reload this document
                    </button>
                  </div>
                )}

                <div className="field" style={{ marginBottom: 18 }}>
                  <label htmlFor="signer-name">Full name</label>
                  <input id="signer-name" ref={nameEl} className="input" style={{ height: 42 }} maxLength={100}
                    value={name} disabled={busy} onChange={(e) => setName(e.target.value)}
                    aria-describedby="signer-name-help" />
                  <p id="signer-name-help" style={{ fontSize: 12.5, color: HELPER, margin: "5px 0 0" }}>
                    This appears under your signature.
                  </p>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(32,30,29,.7)" }}>Signature</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: HELPER }}>
                      {ink ? "Trimmed and ready" : "Draw with a mouse, finger or stylus"}
                    </span>
                  </div>
                  <SignaturePad disabled={busy} onChange={setInk} onAnnounce={setAnnounce} />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <span style={{ display: "block", fontSize: 12, color: "rgba(32,30,29,.7)", marginBottom: 6 }}>Printed name</span>
                  <div className="seg">
                    {(["under", "none"] as const).map((opt) => (
                      <label key={opt} className="seg-opt">
                        <input type="radio" name="printed" checked={printedName === opt} disabled={busy}
                          onChange={() => setPrintedName(opt)} />
                        {opt === "under" ? "Under the ink" : "None"}
                      </label>
                    ))}
                  </div>
                  <p style={{ fontSize: 12.5, color: HELPER, margin: "8px 0 0" }}>
                    {printedName === "under"
                      ? "Your name printed under a signature line, ink above it — the paper convention."
                      : "Nothing printed. Only the ink you drew lands on the page."}
                  </p>
                </div>

                <button type="button" className="btn btn-primary" style={{ width: "100%", height: 50, fontSize: 16, gap: 10 }}
                  disabled={!name.trim() || !ink} aria-disabled={busy} onClick={() => void submit()}>
                  {busy ? <><Spinner /> Signing…</> : "Sign document"}
                </button>
                <p style={{ fontSize: 11.5, color: HELPER, margin: "8px 0 0" }}>{signHint}</p>
              </aside>
            )}
          </main>
        </>
      )}
    </div>
  );
}

function StateBand({ phase, view, box, onClear, signedAt, remaining, token }: {
  phase: Phase; view: SignerView | null; box: Box | null; onClear: () => void;
  signedAt: string | null; remaining: number; token: string;
}) {
  if (phase === "wait") {
    return (
      <div style={{ background: "#eae9e9", borderBottom: `2px solid ${DIVIDER}`, padding: "18px clamp(14px,4vw,28px)" }}>
        <p style={{ font: "800 20px/1.3 Archivo, sans-serif", margin: "0 0 6px" }}>
          Waiting on {view?.waitingOn} to sign first.
        </p>
        <p style={{ fontSize: 14, color: MUTED, margin: "0 0 8px", maxWidth: "68ch" }}>
          We'll be ready for you right after. This page updates itself — you can leave it open, or come back to the same link later.
        </p>
        <p className="micro" style={{ color: HELPER, margin: 0 }}>Read-only until it's your turn · checks every 10s</p>
      </div>
    );
  }
  if (phase === "place") {
    return (
      <div style={{ background: "#fff2ef", borderBottom: "2px solid #ec3013", padding: "14px clamp(14px,4vw,28px)" }}>
        <p style={{ font: "800 15px/1.3 Archivo, sans-serif", color: "#7c1405", margin: "0 0 4px" }}>
          Click where your signature should go.
        </p>
        <p style={{ fontSize: 12.5, color: "#7c1405", margin: 0 }}>
          Or focus the page and press Enter — arrow keys nudge, + and − resize.
        </p>
      </div>
    );
  }
  if (phase === "done") {
    return (
      <div style={{ background: "#eae9e9", borderBottom: `2px solid ${DIVIDER}`, padding: "18px clamp(14px,4vw,28px)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 320px" }}>
          <p style={{ font: "800 20px/1.3 Archivo, sans-serif", margin: "0 0 6px" }}>
            Signed on {signedAt ? new Date(signedAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "just now"}.
          </p>
          <p style={{ fontSize: 14, color: MUTED, margin: 0, maxWidth: "62ch" }}>
            {remaining > 0
              ? `${remaining} more signer${remaining === 1 ? "" : "s"} to go — the requester gets the final copy once everyone has signed.`
              : "That was the last signature. The requester has the completed document."}
          </p>
        </div>
        <a className="btn btn-primary btn-center" href={`/api/sign/${token}/file`} style={{ height: 46, padding: "0 20px" }}>
          View signed document
        </a>
      </div>
    );
  }
  return (
    <div style={{ background: "#eae9e9", borderBottom: `2px solid ${DIVIDER}`, padding: "12px clamp(14px,4vw,28px)", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 13.5 }}>Drag the box to adjust. The corner handle resizes it.</span>
      {box && (
        <code style={{ fontSize: 12, color: MUTED, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          x {box.x.toFixed(2)} · y {box.y.toFixed(2)} · w {box.w.toFixed(2)} · page {box.page + 1}
        </code>
      )}
      <button type="button" className="btn btn-secondary btn-center" style={{ marginLeft: "auto", height: 34 }}
        onClick={onClear}>
        Clear placement
      </button>
    </div>
  );
}
