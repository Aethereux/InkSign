import type { ReactNode } from "react";

export const DIVIDER = "rgba(32,30,29,.4)";
export const MUTED = "rgba(32,30,29,.6)";
export const HELPER = "rgba(32,30,29,.55)";

export function Brand() {
  return (
    <a
      href="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        font: "800 19px/1 Archivo, sans-serif",
        color: "#201e1d",
        textDecoration: "none",
      }}
    >
      <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", flex: "none" }}>
        <rect width="24" height="24" fill="#ec3013" />
        <path d="M4 16.8h16" stroke="#f3f2f2" strokeWidth="1.5" />
        <path
          d="M6 19.2c2.7 0 2.2-11.4 6-11.4 3 0 1.4 8.6 4.4 8.6 1.3 0 1.9-.9 2.5-2"
          fill="none"
          stroke="#f3f2f2"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>InkSign</span>
    </a>
  );
}

export function Header({ step, right }: { step?: string; right?: ReactNode }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        padding: "16px clamp(16px,4vw,32px)",
        borderBottom: `2px solid ${DIVIDER}`,
      }}
    >
      <Brand />
      {right ?? (
        <span className="micro" style={{ marginLeft: "auto", color: HELPER }}>
          {step}
        </span>
      )}
    </header>
  );
}

/** Section header: an accent number then a tracked-out uppercase label. */
export function SectionHead({ n, label, aside }: { n: string; label: string; aside?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        flexWrap: "wrap",
        paddingBottom: 10,
        borderBottom: `2px solid ${DIVIDER}`,
        marginBottom: 18,
      }}
    >
      <span className="snum">{n}</span>
      <h2 className="slabel" style={{ margin: 0 }}>
        {label}
      </h2>
      {aside && (
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: MUTED, textAlign: "right" }}>{aside}</span>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ animation: "om-spin .7s linear infinite" }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity=".3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Announces status changes to screen readers without moving focus. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}

export function InvalidLinkCard({ body }: { body: string }) {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "clamp(16px,4vw,32px)" }}>
      <div style={{ width: "min(520px,100%)", border: `2px solid ${DIVIDER}`, padding: 32 }}>
        <p className="micro" style={{ color: "#ae1800", margin: "0 0 10px" }}>
          Link not valid
        </p>
        <h1 style={{ fontSize: 30, margin: "0 0 12px" }}>This link isn't valid.</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, color: "rgba(32,30,29,.8)" }}>{body}</p>
        <hr className="hr" style={{ margin: "22px 0" }} />
        <a className="btn btn-primary" href="/" style={{ height: 42, padding: "0 18px" }}>
          Go to InkSign
        </a>
      </div>
    </div>
  );
}
