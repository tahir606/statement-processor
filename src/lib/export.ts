import { formatDate } from "./normalize";
import type { Transaction } from "./types";

export const EXPORT_COLUMNS = ["Date", "Type", "Description", "Alt Description", "Credit", "Debit", "Balance"] as const;

const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Credit and Debit are positive numbers in separate columns; the other is left blank. */
export function toRow(t: Transaction): string[] {
  return [
    formatDate(t.date),
    t.type,
    t.description,
    t.altDescription,
    t.amount > 0 ? t.amount.toFixed(2) : "",
    t.amount < 0 ? (-t.amount).toFixed(2) : "",
    t.balance?.toFixed(2) ?? "",
  ];
}

export function toCsv(txns: Transaction[]): string {
  return [EXPORT_COLUMNS.join(","), ...txns.map((t) => toRow(t).map(escape).join(","))].join("\n");
}

/**
 * Excel export. Unlike CSV, the dates are real date cells with a dd-mmm-yy format,
 * so spreadsheet apps keep the format instead of re-interpreting the text.
 */
export async function toXlsx(txns: Transaction[]): Promise<Blob> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  const ws = wb.addWorksheet("Transactions");
  ws.columns = [
    { header: "Date", key: "date", width: 12, style: { numFmt: "dd-mmm-yy" } },
    { header: "Type", key: "type", width: 20 },
    { header: "Description", key: "description", width: 50 },
    { header: "Alt Description", key: "altDescription", width: 30 },
    { header: "Credit", key: "credit", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Debit", key: "debit", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Balance", key: "balance", width: 14, style: { numFmt: "#,##0.00" } },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const t of txns) {
    const [y, m, d] = t.date.split("-").map(Number);
    ws.addRow({
      date: new Date(Date.UTC(y, m - 1, d)),
      type: t.type,
      description: t.description,
      altDescription: t.altDescription,
      debit: t.amount < 0 ? -t.amount : null,
      credit: t.amount > 0 ? t.amount : null,
      balance: t.balance,
    });
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
