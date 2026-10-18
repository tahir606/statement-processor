import type { ParseResult } from "../types";
import { parseStatementLayout } from "./layout";
import { ocrPage } from "./ocr";
import { readTextLayer } from "./textLayer";

/** Browser-only: parse a PDF statement, falling back to OCR for pages with no text layer. */
export async function parsePdf(data: ArrayBuffer, fileName: string, onProgress?: (msg: string) => void): Promise<ParseResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    onProgress?.("Reading text layer…");
    const { words, imagePages } = await readTextLayer(doc);
    for (const [i, p] of imagePages.entries()) {
      onProgress?.(`Running OCR on scanned page ${p} (${i + 1}/${imagePages.length})…`);
      words.push(...(await ocrPage(doc, p)));
    }
    const result = parseStatementLayout(words, {
      fileName,
      source: imagePages.length ? "pdf-ocr" : "pdf-text",
    });
    if (imagePages.length) result.warnings.unshift(`OCR used on ${imagePages.length} scanned page(s) — double-check flagged rows.`);
    return result;
  } finally {
    await task.destroy();
  }
}
