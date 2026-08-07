import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/** Three routes, two of them a prefix plus a token — not enough to justify a router. */
function App() {
  const path = location.pathname;
  if (path.startsWith("/d/")) return <p>Dashboard {path.slice(3)}</p>;
  if (path.startsWith("/s/")) return <p>Signer {path.slice(3)}</p>;
  if (path === "/") return <p>InkSign</p>;
  return <p>This link isn't valid.</p>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
