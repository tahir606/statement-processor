"use client";

import { useRef } from "react";
import { newRuleId, rulesFromJson, rulesToJson, type AltRule, type CompiledRule } from "@/lib/altRules";
import type { RulesStorage } from "./useAltRules";

interface Props {
  rules: AltRule[];
  compiled: CompiledRule[];
  onChange: (rules: AltRule[]) => void;
  /** Transactions matched by each rule (same order as `rules`). */
  matchCounts: number[];
  unmatchedCount: number;
  /** Match counts only mean something once a statement is loaded. */
  hasTransactions: boolean;
  storage: RulesStorage;
  open: boolean;
  onToggle: () => void;
}

const input = "w-full min-w-0 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700";
const iconBtn = "rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

export default function AltRulesPanel({ rules, compiled, onChange, matchCounts, unmatchedCount, hasTransactions, storage, open, onToggle }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (i: number, p: Partial<AltRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rules];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rulesToJson(rules)], { type: "application/json" }));
    a.download = "alt-description-rules.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const incoming = rulesFromJson(await file.text());
      // Add to the existing rules, skipping exact duplicates, so an import never loses work.
      const key = (r: AltRule) => `${r.regex}|${r.pattern}|${r.alt}`;
      const have = new Set(rules.map(key));
      const added = incoming.filter((r) => !have.has(key(r)));
      onChange([...rules, ...added]);
      alert(`Imported ${added.length} rule(s)${incoming.length > added.length ? `, skipped ${incoming.length - added.length} duplicate(s)` : ""}.`);
    } catch (e) {
      alert(`Couldn't import rules: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="text-sm font-semibold">Alt description rules</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{rules.length}</span>
        {hasTransactions && unmatchedCount > 0 && <span className="text-xs text-zinc-500">{unmatchedCount} transaction(s) without an alt description</span>}
        {storage.where === "browser" && <span className="text-xs text-amber-700 dark:text-amber-400">Browser-only storage</span>}
        <span className="ml-auto text-xs text-zinc-500">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
          <p className="mb-3 text-xs text-zinc-500">
            When a description contains the text (or matches the regex), the alt description is filled in. Matching ignores case.
            Rules are checked top to bottom and the first match wins. You can set them up before uploading any statement.
          </p>
          <StorageStatus storage={storage} />

          {rules.length > 0 && (
            <div className="mb-2 hidden grid-cols-[1fr_4rem_1fr_5rem_6rem] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-zinc-500 sm:grid">
              <span>Word or pattern</span>
              <span className="text-center">Regex</span>
              <span>Alt description</span>
              <span className="text-right">{hasTransactions ? "Matches" : ""}</span>
              <span />
            </div>
          )}

          <div className="space-y-2">
            {rules.map((r, i) => {
              const error = compiled[i]?.error;
              return (
                <div key={r.id}>
                  <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_4rem_1fr_5rem_6rem] sm:items-center">
                    <input
                      value={r.pattern}
                      onChange={(e) => patch(i, { pattern: e.target.value })}
                      placeholder={r.regex ? "e.g. ^ATM\\b" : "e.g. tesco"}
                      aria-label="Word or pattern"
                      className={`${input} font-mono ${error && r.pattern ? "border-red-400 dark:border-red-500" : ""}`}
                    />
                    <label className="flex items-center justify-center gap-1 text-xs sm:text-sm">
                      <input type="checkbox" checked={r.regex} onChange={(e) => patch(i, { regex: e.target.checked })} />
                      <span className="sm:hidden">Regex</span>
                    </label>
                    <input
                      value={r.alt}
                      onChange={(e) => patch(i, { alt: e.target.value })}
                      placeholder="e.g. Food - Supermarket"
                      aria-label="Alt description"
                      className={`${input} col-span-2 sm:col-span-1`}
                    />
                    <span className="text-xs tabular-nums text-zinc-500 sm:text-right">
                      {hasTransactions ? `${matchCounts[i] ?? 0} match${matchCounts[i] === 1 ? "" : "es"}` : ""}
                    </span>
                    <div className="flex justify-end gap-0.5 text-sm">
                      <button title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}>↑</button>
                      <button title="Move down" disabled={i === rules.length - 1} onClick={() => move(i, 1)} className={iconBtn}>↓</button>
                      <button title="Delete rule" onClick={() => onChange(rules.filter((_, j) => j !== i))} className={`${iconBtn} hover:text-red-600`}>✕</button>
                    </div>
                  </div>
                  {error && r.pattern && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => onChange([...rules, { id: newRuleId(), pattern: "", regex: false, alt: "" }])}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              + Add rule
            </button>
            <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
              Import JSON
            </button>
            <button
              onClick={exportJson}
              disabled={!rules.length}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
            >
              Export JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                importJson(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function StorageStatus({ storage }: { storage: RulesStorage }) {
  if (storage.where === "loading") return <p className="mb-3 text-xs text-zinc-500">Loading saved rules…</p>;
  if (storage.where === "browser" || storage.status === "error") {
    return (
      <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
        ⚠ {storage.error} Use Export JSON to keep a backup.
      </p>
    );
  }
  const state = storage.status === "saving" ? "Saving…" : storage.status === "saved" ? "Saved" : "Saved permanently";
  return (
    <p className="mb-3 text-xs text-zinc-500">
      {state} to <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{storage.file}</code> on this computer — kept even if you clear
      your browser data.
    </p>
  );
}
