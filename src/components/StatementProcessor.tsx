"use client";

import { CircleCheck, Download, Lock, ScanText, Search, Tags, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { altDescriptionFor, compileRules, matchRule, newRuleId } from "@/lib/altRules";
import { parseCsv } from "@/lib/csv";
import { toCsv, toXlsx } from "@/lib/export";
import type { ColumnRole, ParseResult, Transaction } from "@/lib/types";
import Breakdown from "./Breakdown";
import ExportMenu from "./ExportMenu";
import FileList, { type FileEntry } from "./FileList";
import RulesDrawer from "./RulesDrawer";
import TransactionsTable from "./TransactionsTable";
import { Button, Card, Segmented, cx, fmt } from "./ui";
import { useAltRules } from "./useAltRules";
import { useExportPreference } from "./useExportPreference";

type View = "all" | "review" | "missing";

async function processFile(entry: FileEntry, onProgress: (msg: string) => void): Promise<ParseResult> {
  const name = entry.file.name;
  if (/\.csv$/i.test(name) || entry.file.type === "text/csv") {
    return parseCsv(await entry.file.text(), name, { roleOverrides: entry.roleOverrides });
  }
  if (/\.pdf$/i.test(name) || entry.file.type === "application/pdf") {
    const { parsePdf } = await import("@/lib/pdf");
    return parsePdf(await entry.file.arrayBuffer(), name, onProgress);
  }
  throw new Error("Unsupported file type — use PDF or CSV.");
}

export default function StatementProcessor() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Transaction> & { deleted?: boolean }>>({});
  const [query, setQuery] = useState("");
  const [fileFilter, setFileFilter] = useState("all");
  const [view, setView] = useState<View>("all");
  const [useAltInExport, setUseAltInExport] = useExportPreference();
  const { rules, setRules, storage: rulesStorage } = useAltRules();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [focusRuleId, setFocusRuleId] = useState<string>();
  const dragging = useFileDrop((list) => addFiles(list));
  const inputRef = useRef<HTMLInputElement>(null);

  const compiled = useMemo(() => compileRules(rules), [rules]);

  const update = (id: string, patch: Partial<FileEntry>) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const run = useCallback(async (entry: FileEntry) => {
    update(entry.id, { status: "processing", progress: "Reading…", error: undefined });
    try {
      const result = await processFile(entry, (progress) => update(entry.id, { progress }));
      update(entry.id, { status: "done", result, progress: undefined });
    } catch (e) {
      update(entry.id, { status: "error", error: e instanceof Error ? e.message : String(e), progress: undefined });
    }
  }, []);

  function addFiles(list: FileList | File[] | null) {
    const picked = [...(list ?? [])].filter((f) => /\.(pdf|csv)$/i.test(f.name) || /pdf|csv/.test(f.type));
    if (!picked.length) return;
    const entries: FileEntry[] = picked.map((file) => ({ id: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, status: "processing" }));
    setFiles((fs) => [...fs, ...entries]);
    // Run one at a time so OCR on big scans doesn't swamp the browser.
    (async () => {
      for (const e of entries) await run(e);
    })();
  }

  const allTxns = useMemo(() => {
    const out: Transaction[] = [];
    for (const f of files) {
      for (const t of f.result?.transactions ?? []) {
        const e = edits[t.id];
        if (e?.deleted) continue;
        out.push({ ...t, ...e });
      }
    }
    // Overlapping statements (or the same statement as PDF and CSV) produce the same row twice.
    const seen = new Map<string, string>();
    for (const [i, t] of out.entries()) {
      const key = `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      const other = seen.get(key);
      if (other && other !== t.sourceFile) out[i] = { ...t, flags: [...t.flags, `Possible duplicate of a row in ${other}`] };
      else seen.set(key, t.sourceFile);
    }
    for (const [i, t] of out.entries()) out[i] = { ...t, altDescription: altDescriptionFor(t.description, compiled) };
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [files, edits, compiled]);

  const matchCounts = useMemo(() => {
    const counts = rules.map(() => 0);
    for (const t of allTxns) {
      const i = matchRule(t.description, compiled);
      if (i !== -1) counts[i]++;
    }
    return counts;
  }, [allTxns, compiled, rules]);

  const inFile = allTxns.filter((t) => fileFilter === "all" || t.sourceFile === fileFilter);
  const reviewCount = inFile.filter((t) => t.flags.length).length;
  const missingCount = inFile.filter((t) => !t.altDescription).length;
  const q = query.trim().toLowerCase();
  const visible = inFile.filter(
    (t) =>
      (view === "all" || (view === "review" ? t.flags.length > 0 : !t.altDescription)) &&
      (!q || `${t.type} ${t.description} ${t.altDescription}`.toLowerCase().includes(q)),
  );

  // Summary cards describe everything loaded (or the chosen statement); the table footer totals the current view.
  const moneyIn = inFile.reduce((s, t) => s + Math.max(t.amount, 0), 0);
  const moneyOut = inFile.reduce((s, t) => s + Math.max(-t.amount, 0), 0);

  const openRules = (ruleId?: string) => {
    setFocusRuleId(ruleId);
    setRulesOpen(true);
  };
  const addRuleFrom = (description: string) => {
    const rule = { id: newRuleId(), pattern: description, regex: false, alt: "" };
    setRules((rs) => [...rs, rule]);
    openRules(rule.id);
  };

  const download = (blob: Blob, ext: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportOpts = { useAltDescription: useAltInExport };

  const busy = files.some((f) => f.status === "processing");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-white dark:text-zinc-950">
            <ScanText className="size-4" />
          </div>
          <span className="truncate font-semibold tracking-tight">Statement Processor</span>
          <span className="hidden items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted md:inline-flex">
            <Lock className="size-3" /> Processed on this computer
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => openRules()}>
              <Tags className="size-4" /> Rules
              <span className="rounded-md bg-zinc-100 px-1.5 text-xs tabular-nums text-muted dark:bg-zinc-800">{rules.length}</span>
            </Button>
            {files.length > 0 && (
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" /> <span className="hidden sm:inline">Add statements</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {files.length === 0 ? (
          <Welcome onBrowse={() => inputRef.current?.click()} onRules={() => openRules()} ruleCount={rules.length} />
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Transactions" value={String(inFile.length)} hint={busy ? "Reading files…" : `from ${files.length} file${files.length === 1 ? "" : "s"}`} />
              <Stat label="Money in" value={fmt(moneyIn)} tone="green" />
              <Stat label="Money out" value={fmt(moneyOut)} />
              <Stat label="Net" value={`${moneyIn - moneyOut < 0 ? "−" : ""}${fmt(Math.abs(moneyIn - moneyOut))}`} tone={moneyIn - moneyOut < 0 ? "red" : "green"} />
              <button onClick={() => setView(reviewCount ? "review" : "all")} className="col-span-2 text-left md:col-span-1">
                <Stat
                  label="Needs review"
                  value={String(reviewCount)}
                  tone={reviewCount ? "amber" : "green"}
                  hint={reviewCount ? "Show flagged rows" : "Nothing flagged"}
                  icon={reviewCount ? <TriangleAlert className="size-4" /> : <CircleCheck className="size-4" />}
                />
              </button>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">Statements</h2>
              <FileList
                files={files}
                onRemove={(id) => {
                  const name = files.find((f) => f.id === id)?.file.name;
                  setFiles((fs) => fs.filter((f) => f.id !== id));
                  if (name === fileFilter) setFileFilter("all");
                }}
                onApplyMapping={(entry, roles: ColumnRole[]) => {
                  const next = { ...entry, roleOverrides: roles };
                  update(entry.id, { roleOverrides: roles });
                  run(next);
                }}
              />
            </section>

            <section className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-56 flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search description, type or label"
                      aria-label="Search transactions"
                      className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                  <Segmented
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "all", label: <>All <Count n={inFile.length} /></> },
                      { value: "review", label: <>Needs review <Count n={reviewCount} tone={reviewCount ? "amber" : undefined} /></> },
                      { value: "missing", label: <>No label <Count n={missingCount} /></> },
                    ]}
                  />
                  {files.length > 1 && (
                    <select
                      value={fileFilter}
                      onChange={(e) => setFileFilter(e.target.value)}
                      aria-label="Filter by file"
                      className="h-9 max-w-56 rounded-lg border border-line bg-surface px-2.5 text-sm shadow-sm"
                    >
                      <option value="all">All statements</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.file.name}>
                          {f.file.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="ml-auto">
                    <ExportMenu
                      count={visible.length}
                      useAlt={useAltInExport}
                      onUseAltChange={setUseAltInExport}
                      onExcel={async () => download(await toXlsx(visible, exportOpts), "xlsx")}
                      onCsv={() => download(new Blob([toCsv(visible, exportOpts)], { type: "text/csv" }), "csv")}
                    />
                  </div>
                </div>
                <TransactionsTable
                  rows={visible}
                  onDelete={(id) => setEdits((ed) => ({ ...ed, [id]: { ...ed[id], deleted: true } }))}
                  onAddRule={addRuleFrom}
                  emptyMessage={busy && !allTxns.length ? "Reading statements…" : "No transactions match this view."}
                />
              </div>
              <aside className="2xl:sticky 2xl:top-20">
                <Breakdown rows={visible} />
              </aside>
            </section>
          </div>
        )}
      </main>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,application/pdf,text/csv"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {dragging && (
        <div className="animate-fade-in pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-accent/10 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-accent bg-surface px-16 py-12 text-center shadow-xl">
            <Upload className="size-8 text-accent" />
            <p className="mt-3 text-lg font-semibold">Drop to add statements</p>
            <p className="mt-1 text-sm text-muted">PDF or CSV, from any bank</p>
          </div>
        </div>
      )}

      <RulesDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        rules={rules}
        compiled={compiled}
        onChange={setRules}
        matchCounts={matchCounts}
        hasTransactions={allTxns.length > 0}
        storage={rulesStorage}
        focusRuleId={focusRuleId}
      />
    </div>
  );
}

function Welcome({ onBrowse, onRules, ruleCount }: { onBrowse: () => void; onRules: () => void; ruleCount: number }) {
  const steps = [
    { icon: <Upload className="size-4" />, title: "Drop statements", body: "PDF (downloaded or scanned) or CSV, from any bank. Several at once is fine." },
    { icon: <CircleCheck className="size-4" />, title: "Review", body: "Every row is checked against the running balance. Anything odd is flagged." },
    { icon: <Download className="size-4" />, title: "Export", body: "Excel or CSV with Date, Type, Description, your labels, Credit, Debit, Balance." },
  ];
  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Turn bank statements into one clean table</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Read statements from any bank, check every balance, and label transactions your way. Nothing is uploaded — it all runs on this computer.
        </p>
      </div>

      <button
        onClick={onBrowse}
        className="group mt-8 flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-14 text-center shadow-sm transition-colors hover:border-accent hover:bg-accent-soft/40"
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform group-hover:-translate-y-0.5">
          <Upload className="size-5" />
        </span>
        <span className="mt-4 text-lg font-semibold">Drop statements anywhere on this page</span>
        <span className="mt-1 text-sm text-muted">
          or <span className="font-medium text-accent underline-offset-2 group-hover:underline">browse your files</span> · PDF and CSV
        </span>
      </button>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <Card key={s.title} className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-6 items-center justify-center rounded-md bg-zinc-100 text-xs text-muted dark:bg-zinc-800">{i + 1}</span>
              {s.title}
            </div>
            <p className="mt-2 text-sm text-muted">{s.body}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-3 flex flex-wrap items-center gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Tags className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Alt description rules</p>
          <p className="text-sm text-muted">
            {ruleCount ? `${ruleCount} rule${ruleCount === 1 ? "" : "s"} ready to apply.` : "Set up your own labels before you upload, e.g. tesco → Food - Supermarket."}
          </p>
        </div>
        <Button onClick={onRules}>{ruleCount ? "Edit rules" : "Set up rules"}</Button>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, tone, icon }: { label: string; value: string; hint?: string; tone?: "green" | "red" | "amber"; icon?: ReactNode }) {
  return (
    <Card className={cx("h-full p-3.5", tone === "amber" && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30")}>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        {label}
        {icon && <span className={tone === "amber" ? "text-amber-600" : "text-emerald-600"}>{icon}</span>}
      </div>
      <div
        className={cx(
          "mt-1 text-xl font-semibold tracking-tight tabular-nums lg:text-2xl",
          tone === "green" && "text-emerald-700 dark:text-emerald-400",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "amber" && "text-amber-700 dark:text-amber-300",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </Card>
  );
}

function Count({ n, tone }: { n: number; tone?: "amber" }) {
  return (
    <span className={cx("rounded px-1 text-xs tabular-nums", tone === "amber" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" : "text-muted")}>{n}</span>
  );
}

/** Files dropped anywhere on the page are added; also stops the browser opening a dropped file itself. */
function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      handler.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return dragging;
}
