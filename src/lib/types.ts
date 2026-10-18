export type DateOrder = "DMY" | "MDY" | "YMD";

/** What a statement column means. */
export type ColumnRole =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "balance"
  | "type"
  | "ignore";

export interface Transaction {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** Transaction type, e.g. "Direct Debit" — from the statement's Type column or inferred from the description. */
  type: string;
  description: string;
  /** Signed: money in is positive, money out is negative. */
  amount: number;
  balance: number | null;
  category: string;
  sourceFile: string;
  /** Problems found while parsing / reconciling this row. */
  flags: string[];
}

export interface BalanceCheck {
  /** Rows whose running balance could be checked. */
  checked: number;
  /** Rows whose balance did not match previous balance + amount. */
  mismatches: number;
  openingBalance: number | null;
  closingBalance: number | null;
}

export interface ParseResult {
  fileName: string;
  source: "csv" | "pdf-text" | "pdf-ocr";
  bank: string;
  transactions: Transaction[];
  warnings: string[];
  balanceCheck: BalanceCheck;
  /** Column roles used, keyed by original header text (for display / remapping). */
  columns: { header: string; role: ColumnRole }[];
}

/** A piece of positioned text from a PDF page (text layer or OCR). Coordinates are top-down. */
export interface PositionedWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  /** OCR confidence 0–100; absent for text-layer words. */
  confidence?: number;
}
