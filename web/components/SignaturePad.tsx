import { useCallback, useEffect, useRef, useState } from "react";

export type Ink = { dataUrl: string; aspect: number } | null;

type Point = { x: number; y: number };

/**
 * Draw-your-signature canvas.
 *
 * Pointer events only, so touch and stylus work without a second code path. Strokes are
 * kept as point arrays rather than only as pixels, which is what makes Undo one step and
 * lets the export repaint from authoritative data.
 */
export default function SignaturePad({
  disabled,
  onChange,
  onAnnounce,
}: {
  disabled?: boolean;
  onChange: (ink: Ink) => void;
  onAnnounce: (msg: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [count, setCount] = useState(0);

  const paint = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, el.width / dpr, el.height / dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#111";

    for (const pts of strokes.current) {
      if (!pts.length) continue;
      if (pts.length < 3) {
        ctx.beginPath();
        ctx.arc(pts[0]!.x, pts[0]!.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
        if (pts.length === 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0]!.x, pts[0]!.y);
          ctx.lineTo(pts[1]!.x, pts[1]!.y);
          ctx.stroke();
        }
        continue;
      }
      // Quadratic midpoints — a raw lineTo chain looks visibly polygonal on a fast stroke.
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i]!.x + pts[i + 1]!.x) / 2;
        const my = (pts[i]!.y + pts[i + 1]!.y) / 2;
        ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
      ctx.stroke();
    }
  }, []);

  const fit = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    // Backing store at device resolution, or the signature is blurry on every modern screen.
    el.width = Math.round(r.width * dpr);
    el.height = Math.round(r.height * dpr);
    el.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }, [paint]);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  /**
   * Trims to the ink's bounding box before exporting. Without this a signer who signs
   * small produces a mostly-transparent PNG, which the stamp scales to the box width and
   * renders as a tiny mark floating in a large invisible rectangle.
   */
  const exportInk = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    paint(); // repaint from stroke data first — a deferred render would leave this stale
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const { data } = ctx.getImageData(0, 0, el.width, el.height);

    let minX = el.width, minY = el.height, maxX = -1, maxY = -1;
    for (let y = 0; y < el.height; y++) {
      for (let x = 0; x < el.width; x++) {
        if (data[(y * el.width + x) * 4 + 3]! > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    // Emptiness is measured from pixels, never a hasDrawn flag — it gates the submit button.
    if (maxX < 0) return onChange(null);

    const dpr = window.devicePixelRatio || 1;
    const pad = Math.round(4 * dpr);
    const x0 = Math.max(0, minX - pad);
    const y0 = Math.max(0, minY - pad);
    const w = Math.min(el.width - x0, maxX - minX + 1 + pad * 2);
    const h = Math.min(el.height - y0, maxY - minY + 1 + pad * 2);

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")?.drawImage(el, x0, y0, w, h, 0, 0, w, h);
    onChange({ dataUrl: out.toDataURL("image/png"), aspect: h / w });
    onAnnounce("Signature captured.");
  }, [onChange, onAnnounce, paint]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function clear() {
    strokes.current = [];
    setCount(0);
    paint();
    onChange(null);
    onAnnounce("Signature cleared.");
  }

  function undo() {
    strokes.current = strokes.current.slice(0, -1);
    setCount(strokes.current.length);
    exportInk();
  }

  return (
    <>
      <canvas
        ref={canvas}
        aria-label="Signature pad — draw your signature"
        style={{
          width: "100%", height: 170, display: "block",
          background: "#fff", border: "1px solid rgba(32,30,29,.4)",
          touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair",
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          strokes.current = [...strokes.current, [point(e)]];
          setCount(strokes.current.length);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const last = strokes.current[strokes.current.length - 1];
          if (last) last.push(point(e));
          paint();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          exportInk();
        }}
        onPointerCancel={() => {
          if (!drawing.current) return;
          drawing.current = false;
          exportInk();
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-secondary btn-center" style={{ height: 36 }}
          disabled={disabled || count === 0} onClick={undo}>
          Undo
        </button>
        <button type="button" className="btn btn-secondary btn-center" style={{ height: 36 }}
          disabled={disabled || count === 0} onClick={clear}>
          Clear
        </button>
      </div>
    </>
  );
}
