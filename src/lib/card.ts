import { parseAmount, parseDate } from "./normalize";
import type { AccountKind, CardSummary, DateOrder } from "./types";

const CARD_SIGNALS = [
  /\bcredit card\b/i,
  /\bminimum (payment|amount|due)\b/i,
  /\b(payment )?due date\b/i,
  /\b(credit|card) limit\b/i,
  /\bavailable (credit|limit)\b/i,
  /\b(statement|new|outstanding) balance\b/i,
  /\btotal (amount )?due\b/i,
];
const CARD_FILE_NAME = /credit[\s_-]?card|\b(visa|mastercard|amex)\b/i;

/** A payment made to the card, as it appears on the card statement. */
export const CARD_SIDE_PAYMENT = /\b(payment|pymt|thank you|autopay|direct debit)\b/i;
const NOT_A_PAYMENT = /\b(refund|reversal|return)\b/i;
/** A payment to a card, as it appears on a bank statement. "Card payment TESCO" is a purchase, so it must not match. */
const BANK_SIDE_PAYMENT = /\b(credit ?card|cc|amex|american express)\b.*\b(payment|pymt|pmt|bill|repayment)\b|\b(payment|pymt|bill)\b.*\b(credit ?card|amex|american express)\b/i;

export const isCardSidePayment = (description: string) => CARD_SIDE_PAYMENT.test(description) && !NOT_A_PAYMENT.test(description);
export const isBankSideCardPayment = (description: string) => BANK_SIDE_PAYMENT.test(description);

/** Two signals in the statement text (one alone also appears on bank statements), or a telling file name. */
export function detectAccountKind(text: string, fileName = ""): AccountKind {
  const signals = CARD_SIGNALS.filter((re) => re.test(text)).length;
  return signals >= 2 || CARD_FILE_NAME.test(fileName) ? "card" : "bank";
}

/** "USD Amount: 6.64 USD Conversion Rate: 278.6": conversion detail some issuers print inside the description. */
export const stripConversionNote = (s: string) => s.replace(/\b[A-Z]{3} Amount:\s*[\d.,]*\s*(?:[A-Z]{3} )?Conversion Rate:\s*[\d.,]*/g, " ");

/**
 * A row not yet posted: the amount column just repeats the foreign figure, without a
 * currency, because no conversion exists yet. Returns e.g. "SGD 3.16".
 */
export function pendingForeignAmount(foreign: string, amount: string): string | null {
  const m = foreign.trim().match(/^([A-Z]{3})\s*([\d,]*\.?\d+)$/);
  if (!m || !/^[\d,.]+$/.test(amount.trim())) return null;
  return parseAmount(m[2]) === parseAmount(amount) ? `${m[1]} ${m[2]}` : null;
}

export const hasCreditMark = (amount: string) => /\d\s*(CR|C)\.?\s*$/i.test(amount.trim());

export function inferCardType(description: string, amount: number): string {
  if (amount > 0) return isCardSidePayment(description) ? "Payment" : "Refund";
  if (/\binterest\b|\bfinance charge\b/i.test(description)) return "Interest";
  if (/\bcash advance\b|\batm\b/i.test(description)) return "Cash Advance";
  if (/\bfee\b|\bcharges?\b|\btax\b|\bFED\b/i.test(description)) return "Fee";
  return "Purchase";
}

/**
 * Card statements with one amount column usually show charges as positive. Convert to
 * this app's convention (money out is negative). Returns whether the statement gave no
 * direction at all, in which case the running balance is the next-best evidence.
 */
export function normalizeCardSigns<T extends { amount: number; description: string; creditMarked?: boolean }>(rows: T[]): { rows: T[]; unsigned: boolean } {
  if (rows.some((r) => r.creditMarked)) {
    return { rows: rows.map((r) => ({ ...r, amount: r.creditMarked ? Math.abs(r.amount) : -Math.abs(r.amount) })), unsigned: false };
  }
  const positive = rows.filter((r) => r.amount > 0).length;
  const negative = rows.filter((r) => r.amount < 0).length;
  if (negative > positive) return { rows, unsigned: false }; // Already money-out-negative.
  if (negative > 0) return { rows: rows.map((r) => ({ ...r, amount: -r.amount })), unsigned: false };
  // All positive: only the wording can separate payments and refunds from charges.
  return {
    rows: rows.map((r) => ({ ...r, amount: isCardSidePayment(r.description) || NOT_A_PAYMENT.test(r.description) ? r.amount : -r.amount })),
    unsigned: true,
  };
}

const MONEY = /(?:[£$€₹]|\b(?:GBP|USD|EUR|PKR|INR|AED|Rs\.?))?\s?\d[\d,]*\.\d{2}\b/i;
const DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}[ -][A-Za-z]{3,9}[ ,-]+\d{2,4}\b|\b[A-Za-z]{3,9} \d{1,2},? \d{4}\b/;

type MoneyField = "statementBalance" | "minimumPayment" | "creditLimit" | "availableCredit";
const MONEY_LABELS: [MoneyField, RegExp][] = [
  ["minimumPayment", /\bminimum (payment|amount|due)\b/i],
  ["statementBalance", /\b(statement balance|new balance|current balance|total (amount )?due|outstanding balance|closing balance)\b/i],
  ["creditLimit", /(?<!available )\b(credit|card) limit\b/i],
  ["availableCredit", /\bavailable (credit|limit)\b/i],
];
const DUE_DATE = /\b(payment due date|due date|payment due|pay by|due by)\b/i;

/** Read the summary box. Values may follow the label on its line or sit on the next line. */
export function parseCardSummary(text: string, order: DateOrder = "DMY"): CardSummary {
  const lines = text.split("\n");
  const summary: CardSummary = {};
  const after = (i: number, re: RegExp, value: RegExp) => {
    const m = lines[i].match(re);
    if (!m) return null;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length);
    return rest.match(value)?.[0] ?? lines[i + 1]?.match(value)?.[0] ?? null;
  };
  for (let i = 0; i < lines.length; i++) {
    for (const [key, re] of MONEY_LABELS) {
      if (summary[key] != null) continue;
      const raw = after(i, re, MONEY);
      const value = raw ? parseAmount(raw) : null;
      if (value != null) summary[key] = Math.abs(value);
    }
    if (!summary.dueDate) {
      const raw = after(i, DUE_DATE, DATE);
      if (raw) summary.dueDate = parseDate(raw.replace(/,/g, " "), order) ?? undefined;
    }
  }
  return summary;
}
