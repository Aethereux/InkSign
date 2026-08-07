import { Brand, DIVIDER, MUTED } from "../components/Chrome";

const FEATURES = [
  ["01", "One link per signer",
   "Each signer gets a link of their own. Signer two's link stays inert until signer one is finished, so nobody signs out of turn and nobody needs a password."],
  ["02", "The mark lands where you put it",
   "Click the page, draw with a mouse or a finger, and see the signature at its real size before committing. What the signer previews is exactly what the PDF gets."],
  ["03", "The signed file comes back to you",
   "Your dashboard link is the way back in. Watch the signatures arrive, and download the document as it stands — you don't have to wait for the last signer to see the first signature."],
];

const STATS = [
  ["10 MB", "Largest document"],
  ["5", "Signers per request, in order"],
  ["0", "Accounts to create"],
  ["256-bit", "Every link, unguessable"],
];

const Rule = ({ style }: { style?: React.CSSProperties }) => (
  <hr className="rule-draw" style={{ height: 2, border: 0, background: DIVIDER, margin: 0, ...style }} />
);

export default function Landing() {
  return (
    <div className="page">
      <nav className="nav" style={{ flexWrap: "wrap", padding: "16px clamp(16px,4vw,32px)" }}>
        <span className="nav-brand" style={{ display: "flex" }}><Brand /></span>
        <a href="#how">How it works</a>
        <a href="#doc">The document</a>
        <a className="btn btn-primary btn-center" href="/new" style={{ height: 38, padding: "0 16px" }}>
          Send a document
        </a>
      </nav>

      <main style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: "0 clamp(20px,5vw,72px)" }}>
        <section style={{ padding: "clamp(48px,7vw,96px) 0" }}>
          <h1 style={{
            fontSize: "clamp(42px,6.2vw,84px)", lineHeight: 1.06, letterSpacing: "-.02em",
            fontWeight: 800, marginLeft: "-.058em", margin: "0 0 24px",
            animation: "om-rise .85s cubic-bezier(.2,.75,.2,1) both",
          }}>
            <span style={{ display: "block" }}>Send a PDF.</span>
            <span style={{ display: "block" }}>Get it back signed.</span>
          </h1>
          <p style={{
            fontSize: 17, lineHeight: 1.65, maxWidth: "58ch", color: "rgba(32,30,29,.8)", margin: "0 0 32px",
            animation: "om-rise .85s cubic-bezier(.2,.75,.2,1) .09s both",
          }}>
            InkSign takes a document, collects the signatures you need in the order you need them, and
            hands the signed file back to you. One link per signer. No accounts, no installs, nothing
            to configure.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", animation: "om-rise .85s cubic-bezier(.2,.75,.2,1) .2s both" }}>
            <a className="btn btn-primary btn-center" href="/new" style={{ height: 50, padding: "0 26px", fontSize: 16 }}>
              Send a document
            </a>
            <a className="btn btn-secondary btn-center" href="#how" style={{ height: 50, padding: "0 26px", fontSize: 16 }}>
              See how it works
            </a>
          </div>
        </section>

        <Rule />
        <section style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 24,
          padding: "36px 0", animation: "om-rise .85s cubic-bezier(.2,.75,.2,1) .3s both",
        }}>
          {STATS.map(([figure, label]) => (
            <div key={label}>
              <p style={{ fontSize: "clamp(34px,3.4vw,48px)", fontWeight: 800, color: "#ec3013", marginLeft: "-.045em", margin: "0 0 6px", lineHeight: 1 }}>
                {figure}
              </p>
              <p style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(32,30,29,.7)", margin: 0 }}>
                {label}
              </p>
            </div>
          ))}
        </section>
        <Rule />

        <section id="how">
          {FEATURES.map(([n, title, copy]) => (
            <div key={n}>
              <div className="reveal" style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "42px 0" }}>
                <span style={{ flex: "0 0 60px", font: "800 15px/1.6 Archivo, sans-serif" }}>{n}</span>
                <h2 style={{ flex: "1 1 240px", fontSize: 24, margin: 0, lineHeight: 1.25 }}>{title}</h2>
                <p style={{ flex: "1 1 340px", fontSize: 15.5, lineHeight: 1.65, maxWidth: "52ch", margin: 0, color: "rgba(32,30,29,.8)" }}>
                  {copy}
                </p>
              </div>
              <Rule />
            </div>
          ))}
        </section>

        <section id="doc" style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: "56px 0" }} className="reveal">
          <div style={{ flex: "1 1 320px" }}>
            <p className="micro" style={{ color: "#ec3013", margin: "0 0 14px" }}>The document</p>
            <h2 style={{ fontSize: "clamp(34px,4.2vw,56px)", lineHeight: 1.06, letterSpacing: "-.015em", margin: 0 }}>
              Your PDF, unchanged
            </h2>
          </div>
          <p style={{ flex: "1 1 380px", fontSize: 15.5, lineHeight: 1.7, maxWidth: "54ch", margin: 0, color: "rgba(32,30,29,.8)" }}>
            Nothing is re-typeset and nothing is flattened away. The signature is stamped onto the page
            where it was placed, with the signer's name set underneath it in small grey type. Every
            earlier version stays on file, so a failed signature never overwrites a good one.
          </p>
        </section>
      </main>

      <section style={{
        background: "#ec3013", color: "#f3f2f2", padding: "84px clamp(20px,5vw,72px)",
        animation: "om-wipe-clip .9s cubic-bezier(.2,.75,.2,1) both",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center" }}>
          <div style={{ flex: "1 1 360px" }}>
            <h2 style={{ fontSize: "clamp(34px,4.2vw,56px)", lineHeight: 1.06, letterSpacing: "-.015em", margin: "0 0 28px", color: "#f3f2f2" }}>
              <span style={{ display: "block" }}>Your first document</span>
              <span style={{ display: "block" }}>is a link away.</span>
            </h2>
            <a className="btn btn-center" href="/new"
              style={{ height: 50, padding: "0 26px", fontSize: 16, color: "#f3f2f2", border: "1px solid #f3f2f2" }}>
              Send a document
            </a>
          </div>

          <figure style={{ flex: "0 1 404px", background: "#f3f2f2", color: "#201e1d", padding: 26, margin: 0 }}>
            <figcaption className="micro" style={{ color: "rgba(32,30,29,.6)", marginBottom: 10 }}>
              Signature — page 4 of 4
            </figcaption>
            <svg viewBox="0 0 320 100" width="100%" height="96" fill="none" stroke="#201e1d" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="A signature being written">
              <path data-ink="1" pathLength="100"
                style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: "om-ink 9s cubic-bezier(.4,.5,.3,1) infinite" }}
                d="M8 70C30 24 44 22 50 36C56 50 40 74 34 78C28 82 30 66 46 56C70 42 96 34 118 48C132 57 120 74 112 66C104 58 124 38 150 38C176 38 168 66 158 70C150 73 160 48 186 44C210 40 232 50 250 62C262 70 276 66 300 50" />
              <path data-ink="1" pathLength="100" strokeWidth="2"
                style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: "om-ink 9s cubic-bezier(.4,.5,.3,1) .55s infinite" }}
                d="M44 88C112 97 208 93 282 80" />
            </svg>
            <div style={{ borderTop: "1px solid rgba(32,30,29,.5)", marginTop: 6, paddingTop: 6, display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{ font: "700 12px/1.4 Archivo, sans-serif", animation: "om-type 9s steps(12,end) infinite" }}>
                Ada Lovelace
              </span>
              <span aria-hidden style={{ width: 2, height: 12, background: "#ec3013", animation: "om-caret 1.05s steps(1,end) infinite" }} />
            </div>
          </figure>
        </div>
      </section>

      <footer style={{ padding: "40px clamp(20px,5vw,72px)" }}>
        <p style={{ maxWidth: "70ch", margin: "0 auto", fontSize: 13, lineHeight: 1.7, color: "rgba(32,30,29,.7)" }}>
          InkSign stamps a visual signature onto the page, with the signer's printed name beneath it,
          and records who signed and when. It is not cryptographic e-signature PKI, and it doesn't
          claim to be.
        </p>
      </footer>
    </div>
  );
}
