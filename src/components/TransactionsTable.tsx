"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/normalize";
import type { Transaction } from "@/lib/types";
import { Card, cx, fmt } from "./ui";

export default function TransactionsTable({
  rows,
  onDelete,
  onAddRule,
  emptyMessage,
}: {
  rows: Transaction[];
  onDelete: (id: string) => void;
  onAddRule: (description: string) => void;
  emptyMessage: string;
}) {
  const credit = rows.reduce((s, t) => s + Math.max(t.amount, 0), 0);
  const debit = rows.reduce((s, t) => s + Math.max(-t.amount, 0), 0);
  const th = "whitespace-nowrap px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted";

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[calc(100vh-14rem)] min-h-64 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
            <tr className="text-left">
              <th className={cx(th, "border-b border-line pl-4")}>Date</th>
              <th className={cx(th, "hidden border-b border-line lg:table-cell")}>Type</th>
              <th className={cx(th, "border-b border-line")}>Description</th>
              <th className={cx(th, "border-b border-line")}>Alt description</th>
              <th className={cx(th, "border-b border-line text-right")}>Credit</th>
              <th className={cx(th, "border-b border-line text-right")}>Debit</th>
              <th className={cx(th, "border-b border-line text-right")}>Balance</th>
              <th className="w-10 border-b border-line" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-sm text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const flagged = t.flags.length > 0;
              const td = "border-b border-line px-3 py-2.5 align-top";
              return (
                <tr key={t.id} className={cx("group", flagged ? "bg-amber-50/60 dark:bg-amber-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60")}>
                  <td className={cx(td, "whitespace-nowrap pl-4 font-mono text-[13px] tabular-nums text-muted", flagged && "shadow-[inset_3px_0_0_#f59e0b]")}>
                    {formatDate(t.date)}
                  </td>
                  <td className={cx(td, "hidden whitespace-nowrap lg:table-cell")}>
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{t.type}</span>
                  </td>
                  <td className={cx(td, "min-w-40 lg:min-w-64")}>
                    <div className="leading-snug">{t.description}</div>
                    <div className="mt-0.5 break-all text-xs text-muted">
                      <span className="break-normal lg:hidden">{t.type} · </span>
                      {t.sourceFile}
                    </div>
                    {t.flags.map((fl) => (
                      <div key={fl} className="mt-1 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300">
                        <TriangleAlert className="mt-px size-3 shrink-0" /> {fl}
                      </div>
                    ))}
                  </td>
                  <td className={cx(td, "min-w-24 lg:min-w-40")}>
                    {t.altDescription ? (
                      <span className="inline-block rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">{t.altDescription}</span>
                    ) : (
                      <button
                        onClick={() => onAddRule(t.description)}
                        title="Create a rule from this description"
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-accent focus:opacity-100 group-hover:opacity-100"
                      >
                        <Plus className="size-3" /> Add rule
                      </button>
                    )}
                  </td>
                  <td className={cx(td, "whitespace-nowrap text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400")}>
                    {t.amount > 0 ? fmt(t.amount) : ""}
                  </td>
                  <td className={cx(td, "whitespace-nowrap text-right tabular-nums")}>{t.amount < 0 ? fmt(-t.amount) : ""}</td>
                  <td className={cx(td, "whitespace-nowrap text-right tabular-nums text-muted")}>{t.balance != null ? fmt(t.balance) : ""}</td>
                  <td className={cx(td, "px-2 text-right")}>
                    <button
                      onClick={() => onDelete(t.id)}
                      aria-label="Remove row"
                      title="Remove row"
                      className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-surface/95 backdrop-blur">
              <tr className="text-sm font-semibold">
                <td colSpan={3} className="border-t border-line px-4 py-2.5 text-muted lg:hidden">
                  {rows.length} transaction{rows.length === 1 ? "" : "s"}
                </td>
                <td colSpan={4} className="hidden border-t border-line px-4 py-2.5 text-muted lg:table-cell">
                  {rows.length} transaction{rows.length === 1 ? "" : "s"}
                </td>
                <td className="border-t border-line px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(credit)}</td>
                <td className="border-t border-line px-3 py-2.5 text-right tabular-nums">{fmt(debit)}</td>
                <td colSpan={2} className="border-t border-line" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
