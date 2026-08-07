/**
 * Signature placement geometry — the single source of truth for both the browser preview
 * and the PDF stamp.
 *
 * This module is deliberately dependency-free (no pdf-lib, no DOM) so the frontend can
 * import it without pulling a PDF writer into the bundle. If the preview and the stamp
 * ever compute their boxes from separate copies of these numbers they will drift, and the
 * signature lands somewhere the signer didn't put it.
 *
 * All values are PDF points. The preview multiplies them by its render scale
 * (renderedWidthPx / pageWidthPt) — see `scaled()`.
 */

/** Reserved band under the ink for the printed name, when printedName === 'under'. */
export const NAME_BAND = 14;
/** Signature rule, measured up from the box floor. */
export const RULE_OFFSET = 12;
/** Ink sits below the rule so the stroke crosses it, the way a pen does on paper. */
export const INK_OFFSET = 4;
/** Printed name size. */
export const NAME_SIZE = 8;

export type PrintedName = "under" | "none";

export type Placement = {
  page: number; // 0-indexed
  x: number; // 0..1, fraction of page width, from the LEFT edge
  y: number; // 0..1, fraction of page height, from the TOP edge
  w: number; // 0..1, signature box width as a fraction of page width
};

export const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;

/** The geometry constants at a given render scale, for drawing the preview in CSS pixels. */
export const scaled = (scale: number) => ({
  nameBand: NAME_BAND * scale,
  ruleOffset: RULE_OFFSET * scale,
  inkOffset: INK_OFFSET * scale,
  nameSize: NAME_SIZE * scale,
});

/** Box height in points. `pngAspect` is pngHeight / pngWidth. */
export const boxHeight = (widthPt: number, pngAspect: number, printedName: PrintedName) =>
  widthPt * pngAspect + (printedName === "under" ? NAME_BAND : 0);

export type Layout = {
  x: number;
  y: number;
  boxW: number;
  boxH: number;
  inkH: number;
  inkY: number;
  ruleY: number;
  nameY: number;
};

/**
 * Converts a normalised placement into PDF coordinates. Pure and total — every input is
 * clamped rather than rejected, because a signature two pixels off the page edge should
 * land on the edge, not throw away the signer's work.
 *
 * `(x, y)` is the TOP-LEFT corner of the box in top-left origin space; PDF space has its
 * origin bottom-left, hence the flip.
 */
export function layout(
  placement: Placement,
  pageW: number,
  pageH: number,
  pngAspect: number,
  printedName: PrintedName,
): Layout {
  const boxW = clamp(placement.w, 0.01, 1) * pageW;
  const inkH = boxW * pngAspect;
  const boxH = boxBounded(inkH, printedName);

  const x = clamp(placement.x, 0, 1) * pageW;
  const yTop = clamp(placement.y, 0, 1) * pageH;
  // Keep the whole box on the page, not just its origin.
  const y = clamp(pageH - yTop - boxH, 0, Math.max(0, pageH - boxH));

  return {
    x: clamp(x, 0, Math.max(0, pageW - boxW)),
    y,
    boxW,
    boxH,
    inkH,
    inkY: printedName === "under" ? y + INK_OFFSET : y,
    ruleY: y + RULE_OFFSET,
    nameY: y,
  };
}

const boxBounded = (inkH: number, printedName: PrintedName) =>
  inkH + (printedName === "under" ? NAME_BAND : 0);
