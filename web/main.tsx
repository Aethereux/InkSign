import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Header, InvalidLinkCard } from "./components/Chrome";
import Create from "./screens/Create";
import Dashboard from "./screens/Dashboard";
import "./styles.css";

/** Three routes, two of them a prefix plus a token — not enough to justify a router. */
function App() {
  const path = location.pathname;
  const dashboard = /^\/d\/([^/]+)$/.exec(path);
  const signer = /^\/s\/([^/]+)$/.exec(path);

  if (path === "/") return <Create />;
  if (dashboard) return <Dashboard token={dashboard[1]!} />;
  if (signer) return <Placeholder label={`Signer ${signer[1]}`} />;

  return (
    <div className="page">
      <Header step="404" />
      <InvalidLinkCard body="It may have been mistyped, or the request may have been removed. If someone sent it to you, ask them for a fresh link — signing links are long, and they don't survive being broken across two lines of an email." />
    </div>
  );
}

// Placeholder until S3 and S4 land.
function Placeholder({ label }: { label: string }) {
  return (
    <div className="page">
      <Header step="Coming next" />
      <p style={{ padding: 32 }}>{label}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
