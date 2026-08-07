import { useEffect, useRef, useState } from "react";

export type PageMetrics = { widthPt: number; heightPt: number; scale: number };

/**
 * Renders one PDF page to a canvas at container width, and reports the page's point
 * dimensions plus the render scale. The scale is what converts the shared PDF-point
 * geometry into CSS pixels so the preview and the stamp agree exactly.
 */
export default function PdfPage({
  data,
  pageNumber,
  onMetrics,
}: {
  data: ArrayBuffer | null;
  pageNumber: number;
  onMetrics: (m: PageMetrics) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    // pdf.js can hang rather than reject if its worker fails to come up. A blank frame with
    // no explanation is the worst outcome for a signer, so fall back to the download link.
    const giveUp = setTimeout(() => { if (!cancelled) setError(true); }, 15_000);

    (async () => {
      try {
        const { loadPdf } = await import("../lib/pdf");
        // pdf.js transfers (and detaches) the buffer it is handed, so each render gets a copy.
        const doc = await loadPdf(data.slice(0));
        if (cancelled) return;
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const width = holder.current?.clientWidth ?? base.width;
        const scale = width / base.width;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });

        const el = canvas.current;
        if (!el || cancelled) return;
        el.width = Math.round(viewport.width);
        el.height = Math.round(viewport.height);
        el.style.width = "100%";
        el.style.height = "auto";
        const ctx = el.getContext("2d");
        if (!ctx) return;
        task = page.render({ canvasContext: ctx, viewport, canvas: el });
        await (task as unknown as { promise: Promise<void> }).promise;
        if (!cancelled) onMetrics({ widthPt: base.width, heightPt: base.height, scale });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        clearTimeout(giveUp);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      task?.cancel();
    };
  }, [data, pageNumber, onMetrics]);

  return (
    <div ref={holder} style={{ width: "100%" }}>
      {error ? (
        <div style={{ padding: 24 }}>
          <p style={{ font: "800 15px/1.3 Archivo, sans-serif", margin: "0 0 6px" }}>
            The preview didn't load.
          </p>
          <p style={{ fontSize: 13, color: "rgba(32,30,29,.6)", margin: "0 0 12px", maxWidth: "48ch" }}>
            You can still read the document — use “Download a copy” at the top of the page. Placing
            a signature needs the preview, so reload if you want to try again.
          </p>
          <button type="button" className="btn btn-secondary btn-center" style={{ height: 38 }}
            onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      ) : (
        <canvas ref={canvas} style={{ display: "block", width: "100%" }} />
      )}
    </div>
  );
}
