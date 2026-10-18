import type { ColumnRole, DateOrder } from "./types";

/**
 * Per-bank overrides. The parsers auto-detect most layouts; add a profile when a bank
 * needs help (unusual header names, ambiguous date order, sign conventions, junk lines).
 *
 * To add a bank: copy the example below, set `detect` to text that only appears on that
 * bank's statements (name, sort code prefix, website), then fill in only what's needed.
 */
export interface BankProfile {
  id: string;
  name: string;
  /** Any match in the first page of a PDF / first lines of a CSV selects this profile. */
  detect: RegExp[];
  /** Force day/month order when a statement has no day > 12 to decide from. */
  dateOrder?: DateOrder;
  /** Map lower-cased header text to a role, e.g. { "paid out": "debit" }. */
  headerOverrides?: Record<string, ColumnRole>;
  /**
   * For a single amount column: whether positive numbers are money out (credit-card style)
   * instead of money in.
   */
  positiveIsDebit?: boolean;
  /** PDF lines matching any of these are skipped (page footers, promos, etc.). */
  skipLines?: RegExp[];
}

export const GENERIC_PROFILE: BankProfile = {
  id: "generic",
  name: "Auto-detected",
  detect: [],
};

export const PROFILES: BankProfile[] = [
  // Example — adjust or replace with your own banks.
  {
    id: "example-bank",
    name: "Example Bank",
    detect: [/example bank plc/i],
    dateOrder: "DMY",
    headerOverrides: { "paid out": "debit", "paid in": "credit" },
    skipLines: [/^page \d+ of \d+$/i],
  },
];

/** Lines that are never transactions, whatever the bank. */
export const COMMON_SKIP_LINES: RegExp[] = [
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^continued( on next page)?/i,
  /^(sub)?total\b/i,
];

export const OPENING_BALANCE = /\b(balance (brought|b\/?)\s?f(or)?w(ar)?d|opening balance|previous balance|balance b\/f|start(ing)? balance)\b/i;
export const CLOSING_BALANCE = /\b(balance carried (forward|fwd)|closing balance|balance c\/f|end(ing)? balance|new balance)\b/i;

export function detectProfile(text: string, profiles: BankProfile[] = PROFILES): BankProfile {
  return profiles.find((p) => p.detect.some((re) => re.test(text))) ?? GENERIC_PROFILE;
}
