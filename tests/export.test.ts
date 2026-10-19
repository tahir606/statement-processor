import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export";
import type { Transaction } from "@/lib/types";

const t = (amount: number, description = "Shop"): Transaction => ({
  id: "1", date: "2026-09-01", type: "Card Payment", description, altDescription: "", amount, balance: 100, category: "", sourceFile: "a.csv", flags: [],
});

describe("toCsv", () => {
  it("writes Date,Type,Description,Alt Description,Credit,Debit,Balance with credits and debits split", () => {
    expect(toCsv([{ ...t(-12.5), altDescription: "Food" }, t(40, 'Refund, "big"')]).split("\n")).toEqual([
      "Date,Type,Description,Alt Description,Credit,Debit,Balance",
      "01-Sep-26,Card Payment,Shop,Food,,12.50,100.00",
      '01-Sep-26,Card Payment,"Refund, ""big""",,40.00,,100.00',
    ]);
  });
});

describe("toXlsx", () => {
  it("stores dates as real dates formatted dd-mmm-yy", async () => {
    const { Workbook } = await import("exceljs");
    const { toXlsx } = await import("@/lib/export");
    const blob = await toXlsx([t(-12.5)]);
    const wb = new Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet("Transactions")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Date", "Type", "Description", "Alt Description", "Credit", "Debit", "Balance"]);
    const date = ws.getCell("A2");
    expect(date.value).toBeInstanceOf(Date);
    expect((date.value as Date).toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(date.numFmt).toBe("dd-mmm-yy");
    expect(ws.getCell("E2").value).toBeNull(); // Credit
    expect(ws.getCell("F2").value).toBe(12.5); // Debit
  });
});

describe("export with alt description as description", () => {
  const rows = [{ ...t(-12.5, "Card payment TESCO STORES"), altDescription: "Food - Supermarket" }, t(40, "Refund")];

  it("CSV: swaps in the alt description only where one exists", () => {
    expect(toCsv(rows, { useAltDescription: true }).split("\n").slice(1)).toEqual([
      "01-Sep-26,Card Payment,Food - Supermarket,Food - Supermarket,,12.50,100.00",
      "01-Sep-26,Card Payment,Refund,,40.00,,100.00",
    ]);
    expect(toCsv(rows).split("\n")[1]).toContain("Card payment TESCO STORES"); // off by default
  });

  it("Excel: same swap in the Description column", async () => {
    const { Workbook } = await import("exceljs");
    const { toXlsx } = await import("@/lib/export");
    const wb = new Workbook();
    await wb.xlsx.load(await (await toXlsx(rows, { useAltDescription: true })).arrayBuffer());
    const ws = wb.getWorksheet("Transactions")!;
    expect(ws.getCell("C2").value).toBe("Food - Supermarket");
    expect(ws.getCell("C3").value).toBe("Refund");
  });
});
