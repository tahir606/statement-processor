import { categorize } from "./categorize";
import { inferSignsFromBalance, reconcile } from "./reconcile";
import { inferType, normalizeType } from "./txnType";
import type { ColumnRole, ParseResult, Transaction } from "./types";

export interface RawRow {
  date: string;
  /** Raw value from the statement's Type column, if it has one. */
  type?: string;
  description: string;
  amount: number;
  balance: number | null;
  flags?: string[];
}

export interface FinalizeInput {
  fileName: string;
  source: ParseResult["source"];
  bank: string;
  rows: RawRow[];
  /** False when the statement had one amount column with no sign information. */
  amountsSigned: boolean;
  openingBalance: number | null;
  closingBalance: number | null;
  warnings: string[];
  columns: { header: string; role: ColumnRole }[];
}

let counter = 0;
const newId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function finalize(input: FinalizeInput): ParseResult {
  const warnings = [...input.warnings];
  let txns: Transaction[] = input.rows.map((r) => ({
    id: newId(),
    date: r.date,
    type: normalizeType(r.type ?? ""),
    description: r.description,
    amount: r.amount,
    balance: r.balance,
    category: "",
    sourceFile: input.fileName,
    flags: [...(r.flags ?? [])],
  }));

  // Put rows in date order before using the balance to infer signs.
  if (txns.length > 1 && txns[0].date > txns[txns.length - 1].date) txns.reverse();

  const opening = input.openingBalance;
  if (!input.amountsSigned) {
    // Without an opening balance the first row keeps the sign the parser gave it.
    inferSignsFromBalance(txns, opening);
    if (!txns.some((t) => t.balance != null)) {
      warnings.push("Single amount column with no balance — could not tell money in from money out. Check signs.");
    }
  }

  const { transactions, check } = reconcile(txns, opening, input.closingBalance);
  txns = transactions;

  if (check.closingBalance != null && input.closingBalance != null && txns.length && opening != null) {
    const sum = txns.reduce((s, t) => s + t.amount, opening);
    if (Math.round(sum * 100) !== Math.round(input.closingBalance * 100)) {
      warnings.push(
        `Opening ${opening.toFixed(2)} + transactions = ${sum.toFixed(2)}, but statement closing balance is ${input.closingBalance.toFixed(2)}. Some rows may be missing or misread.`,
      );
    }
  }
  if (check.mismatches) warnings.push(`${check.mismatches} row(s) don't match the running balance — highlighted below.`);
  if (!txns.length) warnings.push("No transactions found.");

  // A date earlier than the row before it usually means a misread digit (e.g. OCR reading 09 as 08).
  for (let i = 1; i < txns.length; i++) {
    if (txns[i].date < txns[i - 1].date) txns[i].flags.push(`Date ${txns[i].date} is out of sequence — check it against the statement`);
  }

  for (const t of txns) {
    t.category = categorize(t.description, t.amount);
    t.type ||= inferType(t.description, t.amount);
  }

  return {
    fileName: input.fileName,
    source: input.source,
    bank: input.bank,
    transactions: txns,
    warnings,
    balanceCheck: check,
    columns: input.columns,
  };
}
