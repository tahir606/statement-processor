"use client";

import { CalendarClock, CircleCheck, CreditCard, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { balanceSeries, cardOverview, periods, spendByCategory, spendByLabel, spendByMerchant, summarize, UNLABELLED, type CardOverview, type Summary } from "@/lib/analytics";
import { formatDate } from "@/lib/normalize";
import type { ParseResult, Transaction } from "@/lib/types";
import { PairedColumns, RankedBars, TimeLines } from "./Charts";
import { Card, Segmented, cx, fmt } from "./ui";

export default function Overview({ txns, results }: { txns: Transaction[]; results: ParseResult[] }) {
  const summary = useMemo(() => summarize(txns), [txns]);
  const money = useMemo(() => periods(txns), [txns]);
  const balances = useMemo(() => balanceSeries(txns), [txns]);
  const merchants = useMemo(() => spendByMerchant(txns), [txns]);
  const categories = useMemo(() => spendByCategory(txns), [txns]);
  const labels = useMemo(() => spendByLabel(txns), [txns]);
  const [by, setBy] = useState<"category" | "alt">("category");
  const cards = results.filter((r) => r.accountKind === "card").map((r) => cardOverview(r, txns));
  const hasBank = txns.some((t) => t.accountKind === "bank");
  const groups = by === "category" ? categories : labels;

  if (!txns.length) return <Card className="px-4 py-16 text-center text-sm text-muted">No transactions to summarise yet.</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">In plain English</h2>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
          {plainEnglish(summary, hasBank, categories[0], categories.reduce((s, g) => s + g.value, 0)).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      {cards.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <CardPanel key={c.fileName} card={c} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Average spent per month" value={fmt(summary.avgMonthlySpending)} hint={`over ${summary.months} month${summary.months === 1 ? "" : "s"}`} />
        <Figure label="Average spent per day" value={fmt(summary.avgDailySpending)} hint="first to last transaction" />
        <Figure
          label="Share of income kept"
          value={summary.savingsRate == null ? "—" : `${Math.round(summary.savingsRate)}%`}
          hint={summary.savingsRate == null ? "no income in these statements" : "income minus spending"}
        />
        <Figure label="Interest and fees" value={fmt(summary.interestAndFees)} hint="charged in this period" />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Money in and spending by {money.unit}</h2>
        <p className="mb-3 text-xs text-muted">
          Card payments are left out, so nothing counts twice.{money.unit === "week" ? " Each date is the Monday that week starts." : ""}
        </p>
        <PairedColumns
          rows={money.rows.map((r) => ({ label: r.label, a: r.income, b: r.spending }))}
          seriesA="Money in"
          seriesB="Spending"
          caption={`Money in and spending by ${money.unit}`}
        />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Where the money went</h2>
            <Segmented
              value={by}
              onChange={setBy}
              options={[
                { value: "category", label: "Category" },
                { value: "alt", label: "Alt description" },
              ]}
            />
          </div>
          {groups.length ? <RankedBars groups={groups} muted={UNLABELLED} /> : <p className="text-sm text-muted">No spending in this view.</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Top merchants</h2>
          {merchants.length ? <RankedBars groups={merchants} /> : <p className="text-sm text-muted">No spending in this view.</p>}
        </Card>
      </div>

      {balances.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Bank balance over time</h2>
          <p className="mb-3 text-xs text-muted">
            One line per statement.{balances.length > 4 ? ` Showing the first 4 of ${balances.length}.` : ""}
          </p>
          <TimeLines series={balances} caption="Bank balance over time" formatDate={formatDate} />
        </Card>
      )}

      <p className="text-xs text-muted">Totals add up every statement as one currency. Statements in different currencies shouldn&apos;t be combined.</p>
    </div>
  );
}

function plainEnglish(s: Summary, hasBank: boolean, topCategory: { label: string; value: number } | undefined, totalCategorySpend: number): string[] {
  const lines: string[] = [];
  if (s.firstDate && s.lastDate) lines.push(`These statements cover ${formatDate(s.firstDate)} to ${formatDate(s.lastDate)}, with ${s.count} transaction${s.count === 1 ? "" : "s"}.`);
  if (!hasBank) lines.push(`You spent ${fmt(s.spending)} on your card${s.spending ? ", after refunds" : ""}.`);
  else if (s.net >= 0) lines.push(`You received ${fmt(s.income)} and spent ${fmt(s.spending)}, leaving ${fmt(s.net)}.`);
  else lines.push(`You received ${fmt(s.income)} and spent ${fmt(s.spending)}, which is ${fmt(-s.net)} more than came in.`);
  if (topCategory && totalCategorySpend > 0) lines.push(`Your biggest area of spending was ${topCategory.label}, at ${fmt(topCategory.value)} (${Math.round((topCategory.value / totalCategorySpend) * 100)}% of the total).`);
  if (s.largest) lines.push(`Your largest single expense was ${fmt(-s.largest.amount)}: ${s.largest.description}, on ${formatDate(s.largest.date)}.`);
  if (s.interestAndFees > 0) lines.push(`Interest and fees came to ${fmt(s.interestAndFees)}.`);
  if (s.cardPaymentsExcluded > 0) lines.push(`${fmt(s.cardPaymentsExcluded)} paid from your bank to your card isn't counted as spending, because the purchases already are.`);
  if (s.duplicates > 0) lines.push(`${s.duplicates} row${s.duplicates === 1 ? " looks" : "s look"} like a duplicate and ${s.duplicates === 1 ? "is" : "are"} still counted. Remove ${s.duplicates === 1 ? "it" : "them"} under Needs review if so.`);
  return lines;
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-3.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{hint}</div>
    </Card>
  );
}

function CardPanel({ card: c }: { card: CardOverview }) {
  const { minimumPayment, dueDate, creditLimit } = c.summary;
  const u = c.utilization;
  const rows: [string, string, boolean?][] = [
    ...(c.previousBalance != null ? ([["Owed at the start", fmt(c.previousBalance)]] as [string, string][]) : []),
    ["Purchases", `+ ${fmt(c.purchases)}`],
    ["Interest and fees", `+ ${fmt(c.interestAndFees)}`],
    ["Refunds", `− ${fmt(c.refunds)}`],
    ["Payments you made", `− ${fmt(c.paymentsMade)}`],
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <CreditCard className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold" title={c.fileName}>{c.fileName}</h2>
          <p className="text-xs text-muted">Credit card</p>
        </div>
      </div>

      {c.owed != null && (
        <div className="mt-4">
          <div className="text-xs font-medium text-muted">You owe</div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{fmt(c.owed)}</div>
        </div>
      )}

      {(minimumPayment != null || dueDate) && (
        <p className="mt-2 flex items-start gap-1.5 text-sm">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>
            {minimumPayment != null ? `Minimum payment ${fmt(minimumPayment)}` : "Payment"}
            {dueDate ? `, due by ${formatDate(dueDate)}.` : "."} Paying less than the full amount usually means interest on the rest.
          </span>
        </p>
      )}

      {u != null && creditLimit != null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted">
            <span>{Math.round(u)}% of your limit used</span>
            <span className="tabular-nums">limit {fmt(creditLimit)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-2 rounded-full" style={{ width: `${Math.min(u, 100)}%`, background: "var(--series-1)" }} />
          </div>
        </div>
      )}

      <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
        {c.owed != null && (
          <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold">
            <dt>Owed now</dt>
            <dd className="tabular-nums">{fmt(c.owed)}</dd>
          </div>
        )}
      </dl>

      {c.totalsMatch != null && (
        <p className={cx("mt-3 flex items-center gap-1.5 text-xs", c.totalsMatch ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300")}>
          {c.totalsMatch ? <CircleCheck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          {c.totalsMatch
            ? "These figures add up to the statement's total."
            : `The rows listed differ from the statement's total${c.difference != null ? ` by ${fmt(Math.abs(c.difference))}` : ""}. ${c.pendingCount ? "Rows not yet posted may be part of this." : "A row may be missing or misread."}`}
        </p>
      )}

      {c.pendingCount > 0 && (
        <p className="mt-2 text-xs text-muted">
          {c.pendingCount} row{c.pendingCount === 1 ? " is" : "s are"} not posted yet ({c.pending.join(", ")}). The statement gives no converted amount, so {c.pendingCount === 1 ? "it's" : "they're"} left out of the totals.
        </p>
      )}
    </Card>
  );
}
