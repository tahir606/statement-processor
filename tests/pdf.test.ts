import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readTextLayer } from "@/lib/pdf/textLayer";
import { parseStatementLayout } from "@/lib/pdf/layout";

async function parse(file: string) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`samples/${file}`)) }).promise;
  const { words, imagePages } = await readTextLayer(doc as never);
  expect(imagePages).toEqual([]);
  return parseStatementLayout(words, { fileName: file, source: "pdf-text" });
}

describe("PDF layout parser", () => {
  it("parses a two-page statement with split paid out / paid in columns", async () => {
    const r = await parse("example-bank-sep-2026.pdf");
    expect(r.bank).toBe("Example Bank");
    expect(r.transactions).toHaveLength(13);
    expect(r.balanceCheck.openingBalance).toBe(1523.45);
    expect(r.balanceCheck.mismatches).toBe(0);
    expect(r.warnings).toEqual([]);
    const t = r.transactions;
    expect(t[0]).toMatchObject({ date: "2026-09-02", amount: -45.2, description: "Card payment TESCO STORES 3021" });
    expect(t[1]).toMatchObject({ date: "2026-09-02", amount: -3.85 }); // date printed once per day
    expect(t[2]).toMatchObject({ amount: 250, description: "Faster payment received from J SMITH REF RENT SHARE SEPT" });
    expect(t[t.length - 1]).toMatchObject({ date: "2026-09-30", amount: -3, balance: 3062.65 });
  });

  it("parses a newest-first statement with a single signed amount column", async () => {
    const r = await parse("globe-savings-newest-first.pdf");
    expect(r.transactions).toHaveLength(6);
    expect(r.transactions[0]).toMatchObject({ date: "2026-09-16", amount: -1890, category: "Eating Out" });
    expect(r.balanceCheck.openingBalance).toBe(64210.75);
    expect(r.balanceCheck.mismatches).toBe(0);
  });
});

describe("OCR-style input", () => {
  // Word boxes shaped like Tesseract output, with a garbled header word and a misread date.
  const w = (text: string, x: number, y: number, confidence = 95) => ({ text, x, y, width: text.length * 3.2, height: 5, page: 1, confidence });
  const words = [
    w("Txn", 32, 85), w("Date", 46, 85), w("Narration", 83, 85), w("/", 113, 85), w("Detalls", 118, 85, 60),
    w("Amount", 323, 85), w("Balance", 381, 85),
    w("16/09/2026", 32, 98), w("FOODPANDA", 83, 98), w("ORDER", 130, 98), w("-1,890.00", 317, 98), w("62,320.75", 374, 98),
    w("25/08/2026", 32, 108), w("K-ELECTRIC", 83, 108), w("BILL", 132, 108), w("-8,750.50", 317, 108), w("53,570.25", 374, 108),
    w("28/09/2026", 32, 118), w("ATM", 83, 118, 55), w("-10,000.00", 313, 118), w("43,570.25", 374, 118),
  ];

  it("finds the description column despite a garbled header and flags suspicious rows", () => {
    const r = parseStatementLayout(words, { fileName: "scan.pdf", source: "pdf-ocr" });
    expect(r.transactions.map((t) => t.description)).toEqual(["FOODPANDA ORDER", "K-ELECTRIC BILL", "ATM"]);
    expect(r.transactions[1].flags.join()).toMatch(/out of sequence/);
    expect(r.columns.map((c) => c.role).filter((x) => x !== "ignore")).toEqual(["date", "description", "amount", "balance"]);
    expect(r.transactions[2].flags.join()).toMatch(/Low OCR confidence/);
  });
});
