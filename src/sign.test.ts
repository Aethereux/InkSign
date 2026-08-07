import { expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { NAME_BAND, applySignature, decodePngDataUrl, layout } from "./sign";

// Opaque PNGs generated offline: 40×20 (aspect 0.5) and 20×20 (aspect 1).
const PNG_2x1 = decodePngDataUrl(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAL0lEQVR4nO3OsREAIAADoey/tE7hvQUFPdt2PpcHBAXrgKBgHRAUrAOCgnVA8KkLH3QdDiWNv94AAAAASUVORK5CYII=",
);
const PNG_1x1 = decodePngDataUrl(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAHUlEQVR4nGNgYGD4T2U8auCogaMGjho4auDINBAAqMKOgECfktYAAAAASUVORK5CYII=",
);

const PAGE_W = 600;
const PAGE_H = 800;

async function fixturePdf(pages = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([PAGE_W, PAGE_H]);
  return doc.save();
}

const place = (o: Partial<Parameters<typeof layout>[0]> = {}) => ({
  page: 0,
  x: 0.2,
  y: 0.5,
  w: 0.25,
  ...o,
});

// --- layout maths -----------------------------------------------------------------

test("aspect ratio comes from the PNG, not the box", () => {
  const l = layout(place({ w: 0.5 }), PAGE_W, PAGE_H, 0.5, "none");
  expect(l.boxW).toBe(300); // half the page width
  expect(l.inkH).toBe(150); // and half of that again, per the 2:1 image
  expect(l.boxH).toBe(l.inkH); // 'none' reserves nothing
});

test("'under' reserves exactly the name band on top of the ink height", () => {
  const none = layout(place(), PAGE_W, PAGE_H, 0.5, "none");
  const under = layout(place(), PAGE_W, PAGE_H, 0.5, "under");
  expect(under.boxH - none.boxH).toBe(NAME_BAND);
  expect(under.inkH).toBe(none.inkH); // the ink itself is unchanged
});

test("y is measured from the top of the page and flipped to PDF space", () => {
  // y=0 puts the box's top edge at the page's top edge, so its bottom sits boxH below.
  const l = layout(place({ y: 0 }), PAGE_W, PAGE_H, 0.5, "none");
  expect(l.y).toBe(PAGE_H - l.boxH);
});

test("the ink crosses the signature rule rather than sitting above it", () => {
  const l = layout(place({ w: 0.5 }), PAGE_W, PAGE_H, 0.5, "under");
  expect(l.inkY).toBeLessThan(l.ruleY); // ink starts below the line…
  expect(l.inkY + l.inkH).toBeGreaterThan(l.ruleY); // …and continues above it
  expect(l.nameY).toBe(l.y); // name sits on the box floor
});

test("out-of-range placements clamp instead of throwing", () => {
  const l = layout(place({ x: 5, y: -3, w: 99 }), PAGE_W, PAGE_H, 0.5, "none");
  expect(l.boxW).toBe(PAGE_W);
  expect(l.x).toBe(0);
  expect(l.y).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(l.boxH)).toBe(true);
});

test("a box near an edge is pulled fully onto the page", () => {
  const l = layout(place({ x: 0.95, y: 0.99, w: 0.25 }), PAGE_W, PAGE_H, 0.5, "under");
  expect(l.x + l.boxW).toBeLessThanOrEqual(PAGE_W);
  expect(l.y).toBeGreaterThanOrEqual(0);
  expect(l.y + l.boxH).toBeLessThanOrEqual(PAGE_H);
});

test("NaN placements fall back to the low bound rather than poisoning the PDF", () => {
  const l = layout(place({ x: NaN, y: NaN, w: NaN }), PAGE_W, PAGE_H, 0.5, "none");
  expect(Number.isFinite(l.x)).toBe(true);
  expect(Number.isFinite(l.y)).toBe(true);
  expect(Number.isFinite(l.boxW)).toBe(true);
});

// --- stamping ---------------------------------------------------------------------

test("stamping preserves the page count and returns a loadable PDF", async () => {
  const before = await fixturePdf(3);
  const after = await applySignature({
    pdf: before,
    signaturePng: PNG_2x1,
    placement: place({ page: 1 }),
    name: "Ada Lovelace",
    printedName: "under",
  });

  expect(after).not.toEqual(before);
  const doc = await PDFDocument.load(after);
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(1).getSize()).toEqual({ width: PAGE_W, height: PAGE_H });
});

test("a page index past the end clamps to the last page", async () => {
  const pdf = await applySignature({
    pdf: await fixturePdf(2),
    signaturePng: PNG_1x1,
    placement: place({ page: 99 }),
    name: "Ada",
    printedName: "none",
  });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
});

test("stamping twice accumulates — this is how multi-signer works", async () => {
  const one = await applySignature({
    pdf: await fixturePdf(1),
    signaturePng: PNG_2x1,
    placement: place(),
    name: "Ada",
    printedName: "under",
  });
  const two = await applySignature({
    pdf: one,
    signaturePng: PNG_1x1,
    placement: place({ y: 0.7 }),
    name: "Grace",
    printedName: "under",
  });
  expect(two.byteLength).toBeGreaterThan(one.byteLength);
  expect((await PDFDocument.load(two)).getPageCount()).toBe(1);
});

test("a name far wider than the box still stamps", async () => {
  const pdf = await applySignature({
    pdf: await fixturePdf(1),
    signaturePng: PNG_1x1,
    placement: place({ w: 0.05 }),
    name: "Bartholomew Fitzgerald-Wellingtonshire III",
    printedName: "under",
  });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
});

// --- decodePngDataUrl -------------------------------------------------------------

test("decodePngDataUrl accepts a real PNG and reports its bytes", () => {
  expect(PNG_2x1.length).toBeGreaterThan(8);
  expect(PNG_2x1[0]).toBe(0x89);
});

test.each([
  ["a JPEG data URL", "data:image/jpeg;base64,/9j/4AAQSkZJRg=="],
  ["bare base64", "iVBORw0KGgo="],
  ["an empty string", ""],
  ["an SVG smuggled in as PNG", "data:image/png;base64,PHN2Zz48L3N2Zz4="],
])("decodePngDataUrl rejects %s", (_label, input) => {
  expect(() => decodePngDataUrl(input)).toThrow();
});

test("decodePngDataUrl rejects anything over 2 MB", () => {
  const huge = "data:image/png;base64," + "A".repeat(3_000_000);
  expect(() => decodePngDataUrl(huge)).toThrow(/too large/);
});
