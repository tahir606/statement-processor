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
  /** The original amount of a foreign purchase; the account's own currency is in the amount column. */
  | "foreign"
  | "ignore";

export type AccountKind = "bank" | "card";

/** Figures read from a credit card statement's summary box. */
export interface CardSummary {
  statementBalance?: number;
  minimumPayment?: number;
  /** ISO yyyy-mm-dd */
  dueDate?: string;
  creditLimit?: number;
  availableCredit?: number;
}

export interface Transaction {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** Transaction type, e.g. "Direct Debit" — from the statement's Type column or inferred from the description. */
  type: string;
  description: string;
  /** Set from the user's alt description rules; "" when no rule matches. */
  altDescription: string;
  /** Signed: money in is positive, money out is negative. */
  amount: number;
  balance: number | null;
  category: string;
  accountKind: AccountKind;
  /** Money moving between the user's own accounts (a card payment): not income, not spending. */
  transfer: boolean;
  /** Not posted yet: the statement only gives this foreign amount (e.g. "SGD 3.16"), so it's left out of totals. */
  pendingForeign?: string;
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
  /** Opening balance plus all transactions equals the closing balance. Null when the statement doesn't show both. */
  totalsMatch: boolean | null;
}

export interface ParseResult {
  fileName: string;
  source: "csv" | "pdf-text" | "pdf-ocr";
  bank: string;
  accountKind: AccountKind;
  cardSummary?: CardSummary;
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
