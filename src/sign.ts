import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clamp, layout, NAME_SIZE, type Placement, type PrintedName } from "./geometry";

export { layout, NAME_BAND, type Placement, type PrintedName } from "./geometry";

/**
 * pdf-lib's standard fonts are WinAnsi-encoded and throw on any character outside it, so a
 * signer called "李伟" — or one whose keyboard produced a curly apostrophe — would crash the
 * stamp. Common typographic characters are folded to ASCII and anything still unencodable
 * is dropped. Embedding a Unicode font would need fontkit and a megabyte of TTF for one
 * 8pt line of text.
 * ponytail: drops non-Latin names rather than rendering them; embed a Unicode font if that
 * ever matters.
 */
export function toWinAnsi(name: string): string {
  return name
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

export type SignInput = {
  pdf: Uint8Array;
  signaturePng: Uint8Array;
  /** One or more marks, each on any page. A signer may sign every page of a document. */
  placements: Placement[];
  name: string;
  printedName: PrintedName;
};

/**
 * Stamps a signature at every given placement and returns the new PDF bytes.
 *
 * The image and font are embedded once and reused across placements, so signing twenty
 * pages costs one copy of the PNG rather than twenty.
 *
 * No timestamp and no document id are ever drawn on the page — the signer chooses whether
 * their typed name is printed under the ink, and nothing else is added.
 */
export async function applySignature(input: SignInput): Promise<Uint8Array> {
  const { pdf, signaturePng, placements, name, printedName } = input;

  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  const png = await doc.embedPng(signaturePng);
  const aspect = png.height / png.width;
  const printed = printedName === "under" ? toWinAnsi(name) : "";
  // No drawable characters left? Still draw the rule and the ink — just no printed name.
  const font = printed ? await doc.embedFont(StandardFonts.HelveticaBold) : null;
  const drawRule = printedName === "under";

  for (const placement of placements) {
    const page = pages[clamp(Math.trunc(placement.page), 0, pages.length - 1)]!;

    // ponytail: getSize() is rotation-aware for 90° multiples; arbitrary rotations aren't
    // handled — the skew would need a full transform and no real PDF in this flow has one.
    const { width: pageW, height: pageH } = page.getSize();
    const box = layout(placement, pageW, pageH, aspect, printedName);

    if (drawRule) {
      page.drawLine({
        start: { x: box.x, y: box.ruleY },
        end: { x: box.x + box.boxW, y: box.ruleY },
        thickness: 1,
        color: rgb(0.125, 0.118, 0.114), // #201e1d
        opacity: 0.5,
      });

    }

    if (font && printed) {
      // Shrink rather than overflow the box — a long name centred at full size spills out.
      let size = NAME_SIZE;
      while (size > 5 && font.widthOfTextAtSize(printed, size) > box.boxW) size -= 0.5;
      const textW = font.widthOfTextAtSize(printed, size);
      page.drawText(printed, {
        x: box.x + (box.boxW - textW) / 2,
        y: box.nameY,
        size,
        font,
        color: rgb(0.125, 0.118, 0.114),
      });
    }

    // Drawn last so the ink sits over the rule, the way a pen does on paper.
    page.drawImage(png, { x: box.x, y: box.inkY, width: box.boxW, height: box.inkH });
  }

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
