import { categorize } from "./categorize";
import { detectAccountKind, inferCardType, isBankSideCardPayment, isCardSidePayment, normalizeCardSigns, parseCardSummary } from "./card";
import { detectDateOrder } from "./normalize";
import { inferSignsFromBalance, reconcile } from "./reconcile";
import { inferType, normalizeType } from "./txnType";
import type { AccountKind, ColumnRole, ParseResult, Transaction } from "./types";

export interface RawRow {
  date: string;
  /** Raw value from the statement's Type column, if it has one. */
  type?: string;
  description: string;
  amount: number;
  balance: number | null;
  flags?: string[];
  /** The amount carried a CR marker (on a card statement: a payment or refund). */
  creditMarked?: boolean;
  pendingForeign?: string;
}

export interface FinalizeInput {
  fileName: string;
  source: ParseResult["source"];
  bank: string;
  rows: RawRow[];
  /** False when the statement had one amount column with no sign information. */
  amountsSigned: boolean;
  /** The statement says which way each amount goes (separate debit/credit columns, or a Type column). */
  directionKnown?: boolean;
  /** Statement text, used to recognise card statements and read their summary box. */
  statementText?: string;
  /** The user's choice; otherwise detected. */
  accountKind?: AccountKind;
  /** Raw date strings, to read the summary box's dates the same way as the rows. */
  rawDates?: string[];
  openingBalance: number | null;
  closingBalance: number | null;
  warnings: string[];
  columns: { header: string; role: ColumnRole }[];
}

let counter = 0;
const newId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function finalize(input: FinalizeInput): ParseResult {
  const warnings = [...input.warnings];
  const statementText = input.statementText ?? "";
  const accountKind = input.accountKind ?? detectAccountKind(statementText, input.fileName);
  const isCard = accountKind === "card";
  const direction = isCard ? -1 : 1;
  const normalized = isCard && !input.directionKnown ? normalizeCardSigns(input.rows) : { rows: input.rows, unsigned: false };
  let txns: Transaction[] = normalized.rows.map((r) => ({
    id: newId(),
    date: r.date,
    type: normalizeType(r.type ?? ""),
    description: r.description,
    altDescription: "",
    amount: r.amount || 0, // never -0
    balance: r.balance,
    category: "",
    accountKind,
    transfer: false,
    sourceFile: input.fileName,
    flags: [...(r.flags ?? []), ...(r.pendingForeign ? [`Not posted yet: the statement gives only ${r.pendingForeign}, so it's left out of totals`] : [])],
    ...(r.pendingForeign ? { pendingForeign: r.pendingForeign } : {}),
  }));

  // Put rows in date order before using the balance to infer signs.
  if (txns.length > 1 && txns[0].date > txns[txns.length - 1].date) txns.reverse();

  const opening = input.openingBalance;
  if (isCard) {
    if (normalized.unsigned) {
      inferSignsFromBalance(txns, opening, -1);
      if (!txns.some((t) => t.balance != null)) {
        warnings.push("Amounts have no signs, so rows were treated as charges unless their description looks like a payment or refund. Check signs.");
      }
    }
  } else if (!input.amountsSigned) {
    // Without an opening balance the first row keeps the sign the parser gave it.
    inferSignsFromBalance(txns, opening);
    if (!txns.some((t) => t.balance != null)) {
      warnings.push("Single amount column with no balance — could not tell money in from money out. Check signs.");
    }
  }

  const { transactions, check } = reconcile(txns, opening, input.closingBalance, direction);
  txns = transactions;

  if (check.closingBalance != null && input.closingBalance != null && txns.length && opening != null) {
    if (check.totalsMatch === false) {
      const sum = txns.reduce((s, t) => s + direction * t.amount, opening);
      warnings.push(
        `Opening ${opening.toFixed(2)} + transactions = ${sum.toFixed(2)}, but statement closing balance is ${input.closingBalance.toFixed(2)}. ${input.rows.some((r) => r.pendingForeign) ? "Rows not posted yet may explain this." : "Some rows may be missing or misread."}`,
      );
    }
  }
  if (check.mismatches) warnings.push(`${check.mismatches} row(s) don't match the running balance — highlighted below.`);
  if (!txns.length) warnings.push("No transactions found.");

  // A date earlier than the row before it usually means a misread digit (e.g. OCR reading 09 as 08).
  // Card statements list by posting date, so transaction dates legitimately jump around.
  for (let i = 1; i < txns.length && !isCard; i++) {
    if (txns[i].date < txns[i - 1].date) txns[i].flags.push(`Date ${txns[i].date} is out of sequence — check it against the statement`);
  }

  for (const t of txns) {
    t.category = categorize(t.description, t.amount);
    if (isCard) {
      t.type ||= inferCardType(t.description, t.amount);
      if (t.amount > 0 && isCardSidePayment(t.description)) t.transfer = true;
      else if (t.amount > 0 && t.category === "Other Income") t.category = "Refunds";
      else if (/^(Interest|Fee)$/.test(inferCardType(t.description, t.amount))) t.category = "Fees & Charges";
    } else {
      t.type ||= inferType(t.description, t.amount);
      if (t.amount < 0 && isBankSideCardPayment(t.description)) t.transfer = true;
    }
    if (t.transfer) t.category = "Card Payment";
  }

  const summary = isCard ? parseCardSummary(statementText, detectDateOrder(input.rawDates ?? [])) : undefined;
  if (summary && summary.statementBalance == null && check.closingBalance != null) summary.statementBalance = check.closingBalance;

  return {
    fileName: input.fileName,
    source: input.source,
    bank: input.bank,
    accountKind,
    cardSummary: summary,
    transactions: txns,
    warnings,
    balanceCheck: check,
    columns: input.columns,
  };
}
