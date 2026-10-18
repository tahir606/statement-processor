import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Worker } from "tesseract.js";
import type { PositionedWord } from "../types";

/** Render pages ~2480px wide (A4 at 300 DPI); Tesseract is much more accurate on larger text. */
const TARGET_WIDTH_PX = 2480;
const MIN_CONFIDENCE = 30;

/** Grayscale + Otsu threshold: turns coloured / shaded statement backgrounds into clean black-on-white. */
export function binarize(img: ImageData): void {
  const d = img.data;
  const hist = new Array<number>(256).fill(0);
  const gray = new Uint8Array(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    gray[j] = g;
    hist[gray[j]]++;
  }
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = gray[j] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

let workerPromise: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  workerPromise ??= import("tesseract.js").then(async ({ createWorker, PSM }) => {
    const worker = await createWorker("eng");
    // Treat the page as sparse blocks of text — works better than "single column" for tables.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    return worker;
  });
  return workerPromise;
}

/** OCR one page and return words in the same coordinate space as the text layer (scale 1, top-down). */
export async function ocrPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PositionedWord[]> {
  const page = await doc.getPage(pageNumber);
  const scale = Math.min(6, Math.max(2, TARGET_WIDTH_PX / page.getViewport({ scale: 1 }).width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  binarize(img);
  ctx.putImageData(img, 0, 0);

  const worker = await getWorker();
  // rotateAuto deskews tilted scans so table rows stay horizontal.
  const { data } = await worker.recognize(canvas, { rotateAuto: true }, { blocks: true });
  const words: PositionedWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const w of line.words) {
          if (w.confidence < MIN_CONFIDENCE || !w.text.trim()) continue;
          words.push({
            text: w.text,
            x: w.bbox.x0 / scale,
            y: w.bbox.y0 / scale,
            width: (w.bbox.x1 - w.bbox.x0) / scale,
            height: (w.bbox.y1 - w.bbox.y0) / scale,
            page: pageNumber,
            confidence: w.confidence,
          });
        }
      }
    }
  }
  page.cleanup();
  return words;
}
