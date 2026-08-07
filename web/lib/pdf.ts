import * as pdfjs from "pdfjs-dist";
// Vite's ?worker import: Vite constructs the Worker with the correct module type and
// bundles it. Pointing GlobalWorkerOptions.workerSrc at a bare .mjs URL instead makes
// pdf.js build the worker itself, which is fragile across bundlers.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

export const loadPdf = (data: ArrayBuffer) => pdfjs.getDocument({ data }).promise;

/** Page count for the upload summary. Returns null if the file can't be parsed at all. */
export async function pageCount(file: File): Promise<number | null> {
  try {
    return (await loadPdf(await file.arrayBuffer())).numPages;
  } catch {
    return null;
  }
}
