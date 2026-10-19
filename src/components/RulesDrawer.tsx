"use client";

import { ArrowDown, ArrowRight, ArrowUp, FileDown, FileUp, HardDrive, Plus, Tags, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { newRuleId, rulesFromJson, rulesToJson, type AltRule, type CompiledRule } from "@/lib/altRules";
import { Badge, Button, cx } from "./ui";
import type { RulesStorage } from "./useAltRules";

interface Props {
  open: boolean;
  onClose: () => void;
  rules: AltRule[];
  compiled: CompiledRule[];
  onChange: (rules: AltRule[]) => void;
  /** Transactions matched by each rule (same order as `rules`). */
  matchCounts: number[];
  hasTransactions: boolean;
  storage: RulesStorage;
  /** Rule to scroll to and focus when the drawer opens (e.g. one just created from a table row). */
  focusRuleId?: string;
}

const field = "h-9 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function RulesDrawer({ open, onClose, rules, compiled, onChange, matchCounts, hasTransactions, storage, focusRuleId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the rule we were asked to show: its alt field if the pattern is already filled in.
  useEffect(() => {
    if (!open || !focusRuleId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-rule="${focusRuleId}"]`);
    row?.scrollIntoView({ block: "nearest" });
    const inputs = row?.querySelectorAll<HTMLInputElement>("input[type=text]");
    const target = inputs && (inputs[0].value ? inputs[1] : inputs[0]);
    target?.focus();
  }, [open, focusRuleId]);

  if (!open) return null;

  const patch = (i: number, p: Partial<AltRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rules];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const add = () => {
    const rule = { id: newRuleId(), pattern: "", regex: false, alt: "" };
    onChange([...rules, rule]);
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-rule="${rule.id}"]`);
      row?.scrollIntoView({ block: "nearest" });
      row?.querySelector<HTMLInputElement>("input[type=text]")?.focus();
    });
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="animate-fade-in absolute inset-0 bg-zinc-950/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="rules-title" className="animate-drawer-in relative flex h-full w-full max-w-2xl flex-col border-l border-line bg-background shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Tags className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="rules-title" className="font-semibold">
              Alt description rules <span className="ml-1 text-sm font-normal text-muted">{rules.length}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Label transactions in your own words. Rules match the description, ignore case, and the first match wins.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800">
            <X className="size-4" />
          </button>
        </header>

        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-5">
          {rules.length === 0 && (
            <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
              <p className="font-medium">No rules yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                A rule turns a word in the description into your own label, e.g. <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">tesco</code> →{" "}
                <span className="font-medium text-accent">Food - Supermarket</span>.
              </p>
              <Button variant="primary" className="mt-4" onClick={add}>
                <Plus className="size-4" /> Add your first rule
              </Button>
            </div>
          )}

          {rules.map((r, i) => {
            const error = compiled[i]?.error;
            const count = matchCounts[i] ?? 0;
            return (
              <div key={r.id} data-rule={r.id} className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted">{i + 1}</span>
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      value={r.pattern}
                      onChange={(e) => patch(i, { pattern: e.target.value })}
                      placeholder={r.regex ? "^ATM\\b" : "Word in description"}
                      aria-label="Word or pattern"
                      className={cx(field, "pr-12 font-mono text-[13px]", error && r.pattern && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
                    />
                    <button
                      onClick={() => patch(i, { regex: !r.regex })}
                      aria-pressed={r.regex}
                      title={r.regex ? "Regular expression (click for plain text)" : "Plain text (click for regular expression)"}
                      className={cx(
                        "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold transition-colors",
                        r.regex ? "bg-accent text-white dark:text-zinc-950" : "text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800",
                      )}
                    >
                      .*
                    </button>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted" />
                  <input
                    type="text"
                    value={r.alt}
                    onChange={(e) => patch(i, { alt: e.target.value })}
                    placeholder="Your label"
                    aria-label="Alt description"
                    className={cx(field, "flex-1")}
                  />
                </div>
                <div className="mt-1 flex h-7 items-center gap-2 pl-7">
                  {error && r.pattern ? (
                    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <TriangleAlert className="size-3" /> {error}
                    </span>
                  ) : hasTransactions ? (
                    <Badge tone={count ? "accent" : "neutral"}>
                      {count} match{count === 1 ? "" : "es"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted">{r.regex ? "Regular expression" : "Plain text"}</span>
                  )}
                  <div className="ml-auto flex items-center">
                    <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Move down" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="danger" className="h-7 px-1.5" title="Delete rule" aria-label="Delete rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {rules.length > 0 && (
            <Button variant="secondary" className="w-full border-dashed" onClick={add}>
              <Plus className="size-4" /> Add rule
            </Button>
          )}
        </div>

        <footer className="space-y-3 border-t border-line bg-surface px-5 py-3">
          <StorageStatus storage={storage} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-3.5" /> Import JSON
            </Button>
            <Button size="sm" onClick={exportJson} disabled={!rules.length}>
              <FileDown className="size-3.5" /> Export JSON
            </Button>
            <Button size="sm" variant="primary" className="ml-auto" onClick={onClose}>
              Done
            </Button>
          </div>
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
        </footer>
      </aside>
    </div>
  );
}

function StorageStatus({ storage }: { storage: RulesStorage }) {
  if (storage.where === "loading") return <p className="text-xs text-muted">Loading saved rules…</p>;
  if (storage.where === "browser" || storage.status === "error") {
    return (
      <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
        <TriangleAlert className="mt-px size-3.5 shrink-0" /> {storage.error} Use Export JSON to keep a backup.
      </p>
    );
  }
  const state = storage.status === "saving" ? "Saving…" : "Saved";
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <HardDrive className="size-3.5 shrink-0" />
      {state} to <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{storage.file}</code> — kept even if you clear browser data.
    </p>
  );
}
