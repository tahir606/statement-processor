import type { ColumnRole } from "./types";

/**
 * Header words banks use for each column. Checked in order, so more specific roles
 * (debit/credit/balance) come before the generic "amount".
 */
export const HEADER_KEYWORDS: [Exclude<ColumnRole, "ignore">, RegExp][] = [
  ["balance", /\b(balance|bal|running balance|ledger balance)\b/i],
  ["debit", /\b(debit|debits|withdrawal|withdrawals|paid out|money out|out|payments?|dr|spent)\b/i],
  ["credit", /\b(credit|credits|deposit|deposits|paid in|money in|in|receipts?|cr|received)\b/i],
  ["date", /\b(date|posted|posting date|transaction date|txn date|value date|trans\.? date)\b/i],
  ["amount", /\b(amount|value|sum|transaction amount)\b/i],
  ["type", /^(type|transaction type|txn type)$/i],
  ["description", /\b(description|details|narrative|narration|particulars|transaction|memo|payee|reference|merchant|name)\b/i],
];

export function roleForHeader(header: string): ColumnRole {
  const h = header.trim();
  if (!h) return "ignore";
  for (const [role, re] of HEADER_KEYWORDS) {
    if (re.test(h)) return role;
  }
  return "ignore";
}

/**
 * Assign roles to a header row. When several headers map to the same role
 * (e.g. "Transaction Date" and "Value Date"), only the first is kept.
 */
export function rolesForHeaders(headers: string[], overrides?: Record<string, ColumnRole>): ColumnRole[] {
  const seen = new Set<ColumnRole>();
  return headers.map((h) => {
    const override = overrides?.[h.trim().toLowerCase()];
    let role = override ?? roleForHeader(h);
    if (role !== "ignore" && role !== "description" && seen.has(role)) role = "ignore";
    seen.add(role);
    return role;
  });
}

/** A header row should have a date column plus some kind of amount column. */
export function isUsableHeader(roles: ColumnRole[]): boolean {
  const has = (r: ColumnRole) => roles.includes(r);
  return has("date") && (has("amount") || has("debit") || has("credit"));
}
