import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export";
import type { Transaction } from "@/lib/types";

const t = (amount: number, description = "Shop"): Transaction => ({
  id: "1", date: "2026-09-01", type: "Card Payment", description, amount, balance: 100, category: "", sourceFile: "a.csv", flags: [],
});

describe("toCsv", () => {
  it("writes Date,Type,Description,Debit,Credit,Balance with debits and credits split", () => {
    expect(toCsv([t(-12.5), t(40, 'Refund, "big"')]).split("\n")).toEqual([
      "Date,Type,Description,Debit,Credit,Balance",
      "01-Sep-26,Card Payment,Shop,12.50,,100.00",
      '01-Sep-26,Card Payment,"Refund, ""big""",,40.00,100.00',
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
    expect(ws.getRow(1).values).toEqual([undefined, "Date", "Type", "Description", "Debit", "Credit", "Balance"]);
    const date = ws.getCell("A2");
    expect(date.value).toBeInstanceOf(Date);
    expect((date.value as Date).toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(date.numFmt).toBe("dd-mmm-yy");
    expect(ws.getCell("D2").value).toBe(12.5);
    expect(ws.getCell("E2").value).toBeNull();
  });
});
