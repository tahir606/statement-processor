import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { PositionedWord } from "../types";

/** Pages with less text than this are treated as scanned images and sent to OCR. */
export const MIN_TEXT_CHARS = 20;

/**
 * Read the embedded text layer of each page with its position.
 * Returns words in top-down page coordinates (PDF points) and the page numbers that had no text.
 */
export async function readTextLayer(doc: PDFDocumentProxy): Promise<{ words: PositionedWord[]; imagePages: number[] }> {
  const words: PositionedWord[] = [];
  const imagePages: number[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let chars = 0;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const t = item as TextItem;
      if (!t.str.trim()) continue;
      chars += t.str.trim().length;
      // Transform the text origin (baseline, bottom-up) into viewport space (top-down).
      const [x, baseline] = viewport.convertToViewportPoint(t.transform[4], t.transform[5]);
      const height = t.height || Math.hypot(t.transform[2], t.transform[3]);
      words.push({ text: t.str, x, y: baseline - height, width: t.width, height, page: p });
    }
    if (chars < MIN_TEXT_CHARS) imagePages.push(p);
    page.cleanup();
  }
  return { words, imagePages };
}
