import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Placement = {
  page: number; // 0-indexed
  x: number; // 0..1, fraction of page width, from the LEFT edge
  y: number; // 0..1, fraction of page height, from the TOP edge
  w: number; // 0..1, signature box width as a fraction of page width
};

export type PrintedName = "under" | "none";

/**
 * Geometry of the printed-name band, in PDF points.
 *
 * The design specifies these as CSS pixels at the preview's render scale. They are points
 * here, so the frontend must scale them by (previewWidthPx / pageWidthPt) when it draws the
 * placement box — otherwise the preview and the stamp diverge, badly on a phone where that
 * scale is ~0.6. This is the mismatch §6.1 of the handoff warns about.
 */
export const NAME_BAND = 14; // reserved under the ink when printedName === 'under'
const RULE_OFFSET = 12; // signature line, measured up from the box bottom
const INK_OFFSET = 4; // ink sits below the rule so the stroke crosses it, as a pen does
const NAME_SIZE = 8;

const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;

export type Layout = {
  /** Box origin in PDF space (bottom-left origin). */
  x: number;
  y: number;
  boxW: number;
  boxH: number;
  inkH: number;
  /** Bottom edge of the ink, and of the signature rule. Absolute PDF coordinates. */
  inkY: number;
  ruleY: number;
  nameY: number;
};

/**
 * Converts a normalised placement into PDF coordinates. Pure and total — every input is
 * clamped rather than rejected, because a signature two pixels off the page edge should
 * land on the edge, not throw away the signer's work.
 *
 * `(x, y)` is the TOP-LEFT corner of the box in top-left origin space; pdf-lib's origin is
 * bottom-left, hence the flip.
 */
export function layout(
  placement: Placement,
  pageW: number,
  pageH: number,
  pngAspect: number, // pngHeight / pngWidth
  printedName: PrintedName,
): Layout {
  const boxW = clamp(placement.w, 0.01, 1) * pageW;
  const inkH = boxW * pngAspect;
  const boxH = inkH + (printedName === "under" ? NAME_BAND : 0);

  // Keep the whole box on the page, not just its origin.
  const x = clamp(placement.x, 0, 1) * pageW;
  const yTop = clamp(placement.y, 0, 1) * pageH;
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

export type SignInput = {
  pdf: Uint8Array;
  signaturePng: Uint8Array;
  placement: Placement;
  name: string;
  printedName: PrintedName;
};

/**
 * Stamps a signature onto one page and returns the new PDF bytes.
 *
 * No timestamp and no document id are ever drawn on the page — the signer chooses whether
 * their typed name is printed under the ink, and nothing else is added.
 */
export async function applySignature(input: SignInput): Promise<Uint8Array> {
  const { pdf, signaturePng, placement, name, printedName } = input;

  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  const page = pages[clamp(Math.trunc(placement.page), 0, pages.length - 1)]!;

  // ponytail: getSize() is rotation-aware for 90° multiples; arbitrary rotations aren't
  // handled — the skew would need a full transform and no real PDF in this flow has one.
  const { width: pageW, height: pageH } = page.getSize();

  const png = await doc.embedPng(signaturePng);
  const box = layout(placement, pageW, pageH, png.height / png.width, printedName);

  if (printedName === "under") {
    page.drawLine({
      start: { x: box.x, y: box.ruleY },
      end: { x: box.x + box.boxW, y: box.ruleY },
      thickness: 1,
      color: rgb(0.125, 0.118, 0.114), // #201e1d
      opacity: 0.5,
    });

    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    // Shrink rather than overflow the box — a long name centred at full size spills out.
    let size = NAME_SIZE;
    while (size > 5 && font.widthOfTextAtSize(name, size) > box.boxW) size -= 0.5;
    const textW = font.widthOfTextAtSize(name, size);
    page.drawText(name, {
      x: box.x + (box.boxW - textW) / 2,
      y: box.nameY,
      size,
      font,
      color: rgb(0.125, 0.118, 0.114),
    });
  }

  // Drawn last so the ink sits over the rule, the way a pen does on paper.
  page.drawImage(png, { x: box.x, y: box.inkY, width: box.boxW, height: box.inkH });

  return doc.save();
}

/** Decodes `data:image/png;base64,…`. Throws on anything else. */
export function decodePngDataUrl(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl ?? "");
  if (!m) throw new Error("signature must be a base64 PNG data URL");
  const bytes = Buffer.from(m[1]!, "base64");
  if (bytes.length > 2_000_000) throw new Error("signature is too large");
  if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  return new Uint8Array(bytes);
}
