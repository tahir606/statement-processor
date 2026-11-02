import type { CardSummary, ParseResult, Transaction } from "./types";

const cents = (n: number) => Math.round(n * 100);
const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

/**
 * Paying a card from a bank account moves money between your own accounts. The purchases
 * already count as spending on the card, so the payment must not count again.
 * Pairs a bank debit with a card payment of the same amount within a week, one to one.
 */
export function linkCardPayments(txns: Transaction[], windowDays = 7): Transaction[] {
  const cardPayments = txns.filter((t) => t.accountKind === "card" && t.amount > 0 && t.transfer);
  const used = new Set<string>();
  const linked = new Set<string>();
  for (const p of cardPayments) {
    const match = txns.find(
      (t) => t.accountKind === "bank" && t.amount < 0 && !used.has(t.id) && cents(-t.amount) === cents(p.amount) && days(t.date, p.date) <= windowDays,
    );
    if (match) {
      used.add(match.id);
      linked.add(match.id);
    }
  }
  return txns.map((t) => (linked.has(t.id) ? { ...t, transfer: true, category: "Card Payment" } : t));
}

/** How much a transaction adds to spending. Refunds on a card reduce it; other money in isn't spending. */
export function spendOf(t: Transaction): number {
  if (t.transfer) return 0;
  if (t.amount < 0) return -t.amount;
  return t.accountKind === "card" ? -t.amount : 0;
}
export const incomeOf = (t: Transaction) => (!t.transfer && t.accountKind === "bank" && t.amount > 0 ? t.amount : 0);

export const isDuplicate = (t: Transaction) => t.flags.some((f) => f.startsWith("Possible duplicate"));
const isInterestOrFee = (t: Transaction) => !t.transfer && t.amount < 0 && (t.category === "Fees & Charges" || /^(Interest|Fee)$/.test(t.type));

const NOISE = /\b(card payment|contactless|refund|direct debit|standing order|pos purchase|pos|purchase|faster payment( received from)?|payment to|atm cash withdrawal|debit card|visa|mastercard|ref\b.*)\b/gi;

/** Reduce a bank description to something that groups as one merchant: "Card payment TESCO STORES 3021" -> "Tesco Stores". */
export function merchantName(description: string): string {
  const cleaned = description
    .replace(NOISE, " ")
    .replace(/[*#]+\S*/g, " ")
    .replace(/\.com\b/gi, "")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = cleaned || description.trim();
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export interface Group {
  label: string;
  value: number;
}

function groupSpend(txns: Transaction[], key: (t: Transaction) => string): Group[] {
  const m = new Map<string, number>();
  for (const t of txns) {
    const s = spendOf(t);
    if (s) m.set(key(t), (m.get(key(t)) ?? 0) + s);
  }
  return [...m.entries()].filter(([, v]) => v > 0).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export const UNLABELLED = "No alt description";
export const spendByCategory = (txns: Transaction[]) => groupSpend(txns, (t) => t.category);
export const spendByLabel = (txns: Transaction[]) => groupSpend(txns, (t) => t.altDescription || UNLABELLED);
/** Interest and fees come from the card issuer, not a shop, so they aren't merchants. */
export const spendByMerchant = (txns: Transaction[]) => groupSpend(txns.filter((t) => !isInterestOrFee(t)), (t) => merchantName(t.description));

export interface Summary {
  income: number;
  spending: number;
  net: number;
  /** Share of income not spent, 0–100; null without income. */
  savingsRate: number | null;
  months: number;
  avgMonthlySpending: number;
  avgDailySpending: number;
  interestAndFees: number;
  cardPaymentsExcluded: number;
  duplicates: number;
  largest: Transaction | null;
  count: number;
  firstDate: string | null;
  lastDate: string | null;
}

export function summarize(txns: Transaction[]): Summary {
  const income = txns.reduce((s, t) => s + incomeOf(t), 0);
  const spending = txns.reduce((s, t) => s + spendOf(t), 0);
  const dates = txns.map((t) => t.date).sort();
  const firstDate = dates[0] ?? null;
  const lastDate = dates[dates.length - 1] ?? null;
  const months = new Set(dates.map((d) => d.slice(0, 7))).size;
  const spanDays = firstDate && lastDate ? days(firstDate, lastDate) + 1 : 0;
  const expenses = txns.filter((t) => !t.transfer && t.amount < 0);
  return {
    income,
    spending,
    net: income - spending,
    savingsRate: income > 0 ? ((income - spending) / income) * 100 : null,
    months,
    avgMonthlySpending: months ? spending / months : 0,
    avgDailySpending: spanDays ? spending / spanDays : 0,
    interestAndFees: txns.filter(isInterestOrFee).reduce((s, t) => s - t.amount, 0),
    cardPaymentsExcluded: txns.filter((t) => t.transfer && t.amount < 0).reduce((s, t) => s - t.amount, 0),
    duplicates: txns.filter(isDuplicate).length,
    largest: expenses.reduce<Transaction | null>((best, t) => (!best || t.amount < best.amount ? t : best), null),
    count: txns.length,
    firstDate,
    lastDate,
  };
}

export interface Period {
  key: string;
  label: string;
  income: number;
  spending: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`;
const weekStart = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Income and spending per month; per week when the data covers two months or less, so one month isn't one lone bar. */
export function periods(txns: Transaction[]): { unit: "week" | "month"; rows: Period[] } {
  const unit = new Set(txns.map((t) => t.date.slice(0, 7))).size <= 2 ? "week" : "month";
  const m = new Map<string, Period>();
  for (const t of txns) {
    const key = unit === "month" ? t.date.slice(0, 7) : weekStart(t.date);
    const label = unit === "month" ? monthLabel(key) : `${+key.slice(8, 10)} ${MONTHS[+key.slice(5, 7) - 1]}`;
    const p = m.get(key) ?? { key, label, income: 0, spending: 0 };
    p.income += incomeOf(t);
    p.spending += spendOf(t);
    m.set(key, p);
  }
  return { unit, rows: [...m.values()].sort((a, b) => a.key.localeCompare(b.key)) };
}

export interface BalanceSeries {
  name: string;
  points: { date: string; balance: number }[];
}

/** Bank balance over time, per statement; the last balance printed each day. Cards are left out: theirs is a debt, not money held. */
export function balanceSeries(txns: Transaction[]): BalanceSeries[] {
  const byFile = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.balance == null || t.accountKind !== "bank") continue;
    if (!byFile.has(t.sourceFile)) byFile.set(t.sourceFile, new Map());
    byFile.get(t.sourceFile)!.set(t.date, t.balance);
  }
  return [...byFile.entries()]
    .map(([name, points]) => ({ name, points: [...points.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, balance]) => ({ date, balance })) }))
    .filter((s) => s.points.length > 1);
}

export interface CardOverview {
  fileName: string;
  bank: string;
  summary: CardSummary;
  owed: number | null;
  previousBalance: number | null;
  purchases: number;
  paymentsMade: number;
  refunds: number;
  interestAndFees: number;
  /** Share of the limit in use, 0–100+; null without both figures. */
  utilization: number | null;
  totalsMatch: boolean | null;
  /** Owed minus what the listed rows add up to, when they differ. */
  difference: number | null;
  /** Rows not posted yet, totalled per currency, e.g. ["SGD 232.39"]. */
  pending: string[];
  pendingCount: number;
}

export function cardOverview(result: ParseResult, txns: Transaction[]): CardOverview {
  const rows = txns.filter((t) => t.sourceFile === result.fileName);
  const summary = result.cardSummary ?? {};
  const owed = summary.statementBalance ?? result.balanceCheck.closingBalance;
  const interestAndFees = rows.filter(isInterestOrFee).reduce((s, t) => s - t.amount, 0);
  const opening = result.balanceCheck.openingBalance;
  const listed = opening == null ? null : rows.reduce((s, t) => s - t.amount, opening);
  const perCurrency = new Map<string, number>();
  const pendingRows = rows.filter((t) => t.pendingForeign);
  for (const t of pendingRows) {
    const [code, value] = t.pendingForeign!.split(" ");
    perCurrency.set(code, (perCurrency.get(code) ?? 0) + Number(value.replace(/,/g, "")));
  }
  return {
    fileName: result.fileName,
    bank: result.bank,
    summary,
    owed,
    previousBalance: result.balanceCheck.openingBalance,
    purchases: rows.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0) - interestAndFees,
    paymentsMade: rows.filter((t) => t.amount > 0 && t.transfer).reduce((s, t) => s + t.amount, 0),
    refunds: rows.filter((t) => t.amount > 0 && !t.transfer).reduce((s, t) => s + t.amount, 0),
    interestAndFees,
    utilization: owed != null && summary.creditLimit ? (owed / summary.creditLimit) * 100 : null,
    totalsMatch: result.balanceCheck.totalsMatch,
    difference: result.balanceCheck.totalsMatch === false && owed != null && listed != null ? owed - listed : null,
    pending: [...perCurrency.entries()].map(([code, v]) => `${code} ${v.toFixed(2)}`),
    pendingCount: pendingRows.length,
  };
}

