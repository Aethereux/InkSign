import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clamp, layout, NAME_SIZE, type Placement, type PrintedName } from "./geometry";

export { layout, NAME_BAND, type Placement, type PrintedName } from "./geometry";

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
