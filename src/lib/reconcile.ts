import type { BalanceCheck, Transaction } from "./types";

const cents = (n: number) => Math.round(n * 100);

/**
 * Check every row's running balance: previous balance + amount should equal this balance.
 * On a credit card the balance is what's owed, so it moves the other way (direction -1).
 * Also detects statements listed newest-first and reverses them.
 * Mutates `flags` on mismatched rows and returns the transactions in chronological order.
 */
export function reconcile(
  txns: Transaction[],
  openingBalance: number | null,
  closingBalance: number | null,
  direction: 1 | -1 = 1,
): { transactions: Transaction[]; check: BalanceCheck } {
  let rows = txns;
  if (isNewestFirst(rows, openingBalance, direction)) rows = [...rows].reverse();

  let prev = openingBalance;
  let checked = 0;
  let mismatches = 0;
  for (const t of rows) {
    if (t.balance != null && prev != null) {
      checked++;
      if (cents(prev + direction * t.amount) !== cents(t.balance)) {
        mismatches++;
        const expected = (prev + direction * t.amount).toFixed(2);
        t.flags.push(`Balance mismatch: expected ${expected}, statement shows ${t.balance.toFixed(2)}`);
      }
    }
    if (t.balance != null) prev = t.balance;
    else if (prev != null) prev = prev + direction * t.amount;
  }

  const lastBalance = [...rows].reverse().find((t) => t.balance != null)?.balance ?? null;
  const closing = closingBalance ?? lastBalance;
  const totalsMatch =
    openingBalance != null && closing != null && rows.length
      ? cents(rows.reduce((s, t) => s + direction * t.amount, openingBalance)) === cents(closing)
      : null;
  return {
    transactions: rows,
    check: {
      checked,
      mismatches,
      openingBalance,
      closingBalance: closing,
      totalsMatch,
    },
  };
}

/** Fits better when read bottom-up? Compares how many balance steps match in each direction. */
function isNewestFirst(rows: Transaction[], opening: number | null, direction: 1 | -1): boolean {
  const withBal = rows.filter((t) => t.balance != null);
  if (withBal.length < 2) {
    return rows.length > 1 && rows[0].date > rows[rows.length - 1].date;
  }
  const score = (list: Transaction[], start: number | null) => {
    let p = start;
    let ok = 0;
    for (const t of list) {
      if (t.balance == null) continue;
      if (p != null && cents(p + direction * t.amount) === cents(t.balance)) ok++;
      p = t.balance;
    }
    return ok;
  };
  const forward = score(rows, opening);
  const backward = score([...rows].reverse(), null);
  if (backward !== forward) return backward > forward;
  return rows[0].date > rows[rows.length - 1].date;
}

/**
 * When a statement has a single unsigned amount column plus a balance, the sign of each
 * amount can be recovered from how the balance moved.
 */
export function inferSignsFromBalance(txns: Transaction[], openingBalance: number | null, direction: 1 | -1 = 1): void {
  let prev = openingBalance;
  for (const t of txns) {
    if (t.balance != null && prev != null) {
      const delta = direction * cents(t.balance - prev);
      const abs = cents(Math.abs(t.amount));
      if (delta === abs) t.amount = Math.abs(t.amount);
      else if (delta === -abs) t.amount = -Math.abs(t.amount);
    }
    if (t.balance != null) prev = t.balance;
  }
}
