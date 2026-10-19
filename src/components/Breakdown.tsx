"use client";

import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { Card, Segmented, fmt } from "./ui";

const UNLABELLED = "No alt description";

/** Money out grouped by category or by the user's alt descriptions. */
export default function Breakdown({ rows }: { rows: Transaction[] }) {
  const [by, setBy] = useState<"alt" | "category">("alt");
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of rows) {
      if (t.amount >= 0) continue;
      const key = by === "alt" ? t.altDescription || UNLABELLED : t.category;
      m.set(key, (m.get(key) ?? 0) - t.amount);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, by]);
  const total = groups.reduce((s, [, v]) => s + v, 0);
  const max = groups[0]?.[1] ?? 1;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Spending</h2>
        <Segmented
          value={by}
          onChange={setBy}
          options={[
            { value: "alt", label: "Alt description" },
            { value: "category", label: "Category" },
          ]}
        />
      </div>
      {groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No money out in the current view.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {groups.map(([label, v]) => (
            <li key={label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={label === UNLABELLED ? "truncate italic text-muted" : "truncate"} title={label}>
                  {label}
                </span>
                <span className="shrink-0 tabular-nums">
                  {fmt(v)} <span className="text-xs text-muted">{Math.round((v / total) * 100)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={label === UNLABELLED ? "h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" : "h-1.5 rounded-full bg-accent"}
                  style={{ width: `${Math.max((v / max) * 100, 2)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
