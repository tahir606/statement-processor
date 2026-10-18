import type { BalanceCheck, Transaction } from "./types";

const cents = (n: number) => Math.round(n * 100);

/**
 * Check every row's running balance: previous balance + amount should equal this balance.
 * Also detects statements listed newest-first and reverses them.
 * Mutates `flags` on mismatched rows and returns the transactions in chronological order.
 */
export function reconcile(
  txns: Transaction[],
  openingBalance: number | null,
  closingBalance: number | null,
): { transactions: Transaction[]; check: BalanceCheck } {
  let rows = txns;
  if (isNewestFirst(rows, openingBalance)) rows = [...rows].reverse();

  let prev = openingBalance;
  let checked = 0;
  let mismatches = 0;
  for (const t of rows) {
    if (t.balance != null && prev != null) {
      checked++;
      if (cents(prev + t.amount) !== cents(t.balance)) {
        mismatches++;
        const expected = (prev + t.amount).toFixed(2);
        t.flags.push(`Balance mismatch: expected ${expected}, statement shows ${t.balance.toFixed(2)}`);
      }
    }
    if (t.balance != null) prev = t.balance;
    else if (prev != null) prev = prev + t.amount;
  }

  const lastBalance = [...rows].reverse().find((t) => t.balance != null)?.balance ?? null;
  return {
    transactions: rows,
    check: {
      checked,
      mismatches,
      openingBalance,
      closingBalance: closingBalance ?? lastBalance,
    },
  };
}

/** Fits better when read bottom-up? Compares how many balance steps match in each direction. */
function isNewestFirst(rows: Transaction[], opening: number | null): boolean {
  const withBal = rows.filter((t) => t.balance != null);
  if (withBal.length < 2) {
    return rows.length > 1 && rows[0].date > rows[rows.length - 1].date;
  }
  const score = (list: Transaction[], start: number | null) => {
    let p = start;
    let ok = 0;
    for (const t of list) {
      if (t.balance == null) continue;
      if (p != null && cents(p + t.amount) === cents(t.balance)) ok++;
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
export function inferSignsFromBalance(txns: Transaction[], openingBalance: number | null): void {
  let prev = openingBalance;
  for (const t of txns) {
    if (t.balance != null && prev != null) {
      const delta = cents(t.balance - prev);
      const abs = cents(Math.abs(t.amount));
      if (delta === abs) t.amount = Math.abs(t.amount);
      else if (delta === -abs) t.amount = -Math.abs(t.amount);
    }
    if (t.balance != null) prev = t.balance;
  }
}
