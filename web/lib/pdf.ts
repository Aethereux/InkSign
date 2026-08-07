import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Assigning the worker as a URL is what keeps pdf.js off its fake-worker fallback, which
// warns in dev and silently fails in a production build.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const loadPdf = (data: ArrayBuffer) => pdfjs.getDocument({ data }).promise;

/** Page count for the upload summary. Returns null if the file can't be parsed at all. */
export async function pageCount(file: File): Promise<number | null> {
  try {
    return (await loadPdf(await file.arrayBuffer())).numPages;
  } catch {
    return null;
  }
}
