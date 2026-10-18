"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { parseCsv } from "@/lib/csv";
import { toCsv, toXlsx } from "@/lib/export";
import { formatDate } from "@/lib/normalize";
import type { ColumnRole, ParseResult, Transaction } from "@/lib/types";

interface FileEntry {
  id: string;
  file: File;
  status: "processing" | "done" | "error";
  progress?: string;
  result?: ParseResult;
  error?: string;
  /** User-chosen column roles (CSV only). */
  roleOverrides?: ColumnRole[];
  showMapping?: boolean;
}

const ROLES: ColumnRole[] = ["date", "description", "amount", "debit", "credit", "balance", "type", "ignore"];

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<FileEntry>) =>
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const run = useCallback(async (entry: FileEntry) => {
    update(entry.id, { status: "processing", progress: "Processing…", error: undefined });
    try {
      const result = await processFile(entry, (progress) => update(entry.id, { progress }));
      update(entry.id, { status: "done", result, progress: undefined });
    } catch (e) {
      update(entry.id, { status: "error", error: e instanceof Error ? e.message : String(e), progress: undefined });
    }
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const entries: FileEntry[] = [...list].map((file) => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      status: "processing",
    }));
    setFiles((fs) => [...fs, ...entries]);
    // Run sequentially so OCR on big scans doesn't swamp the browser.
    (async () => {
      for (const e of entries) await run(e);
    })();
  };

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
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [files, edits]);

  const visible = allTxns.filter(
    (t) =>
      (fileFilter === "all" || t.sourceFile === fileFilter) &&
      (!flaggedOnly || t.flags.length > 0) &&
      (!query || `${t.type} ${t.description}`.toLowerCase().includes(query.toLowerCase())),
  );

  const totals = useMemo(() => {
    const moneyIn = visible.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const moneyOut = visible.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
    const byCat = new Map<string, number>();
    for (const t of visible) if (t.amount < 0) byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount);
    return { moneyIn, moneyOut, byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
  }, [visible]);

  const download = (blob: Blob, ext: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportCsv = () => download(new Blob([toCsv(visible)], { type: "text/csv" }), "csv");
  const exportXlsx = async () => download(await toXlsx(visible), "xlsx");

  const flaggedCount = allTxns.filter((t) => t.flags.length).length;
  const maxCat = totals.byCat[0]?.[1] ?? 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Statement Processor</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Drop bank statements (PDF or CSV). Everything runs in your browser — files are never uploaded.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
        }`}
      >
        <p className="font-medium">Drop statements here or click to choose</p>
        <p className="mt-1 text-xs text-zinc-500">PDF (text or scanned) and CSV · multiple files and banks at once</p>
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
      </div>

      {files.length > 0 && (
        <section className="mt-6 space-y-3">
          {files.map((f) => (
            <FileCard
              key={f.id}
              entry={f}
              onRemove={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
              onToggleMapping={() => update(f.id, { showMapping: !f.showMapping })}
              onApplyMapping={(roles) => {
                const next = { ...f, roleOverrides: roles };
                update(f.id, { roleOverrides: roles });
                run(next);
              }}
            />
          ))}
        </section>
      )}

      {allTxns.length > 0 && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Transactions" value={String(visible.length)} />
            <Stat label="Money in" value={fmt(totals.moneyIn)} tone="pos" />
            <Stat label="Money out" value={fmt(totals.moneyOut)} tone="neg" />
            <Stat label="Net" value={fmt(totals.moneyIn - totals.moneyOut)} tone={totals.moneyIn >= totals.moneyOut ? "pos" : "neg"} />
          </section>

          {totals.byCat.length > 0 && (
            <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-3 text-sm font-semibold">Spending by category</h2>
              <div className="space-y-1.5">
                {totals.byCat.map(([cat, v]) => (
                  <div key={cat} className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-sm">
                    <span className="truncate">{cat}</span>
                    <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-2 rounded bg-blue-500" style={{ width: `${(v / maxCat) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search type or description"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
              />
              <select
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                className="max-w-[14rem] rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
              >
                <option value="all">All files</option>
                {files.map((f) => (
                  <option key={f.id} value={f.file.name}>
                    {f.file.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
                Flagged only ({flaggedCount})
              </label>
              <button onClick={exportXlsx} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                Export Excel
              </button>
              <button onClick={exportCsv} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700">
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-t border-zinc-100 dark:border-zinc-800 ${t.flags.length ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatDate(t.date)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{t.type}</td>
                      <td className="px-3 py-1.5">
                        <div>{t.description}</div>
                        {t.flags.map((fl) => (
                          <div key={fl} className="text-xs text-amber-700 dark:text-amber-400">
                            ⚠ {fl}
                          </div>
                        ))}
                        <div className="text-xs text-zinc-400">{t.sourceFile}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">
                        {t.amount < 0 ? fmt(-t.amount) : ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-green-700 dark:text-green-400">
                        {t.amount > 0 ? fmt(t.amount) : ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-zinc-500">{t.balance != null ? fmt(t.balance) : ""}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          title="Remove row"
                          onClick={() => setEdits((ed) => ({ ...ed, [t.id]: { ...ed[t.id], deleted: true } }))}
                          className="text-zinc-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-green-700 dark:text-green-400" : tone === "neg" ? "text-red-600 dark:text-red-400" : "";
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function FileCard({
  entry,
  onRemove,
  onToggleMapping,
  onApplyMapping,
}: {
  entry: FileEntry;
  onRemove: () => void;
  onToggleMapping: () => void;
  onApplyMapping: (roles: ColumnRole[]) => void;
}) {
  const r = entry.result;
  const isCsv = r?.source === "csv";
  const [roles, setRoles] = useState<ColumnRole[] | null>(null);
  const current = roles ?? r?.columns.map((c) => c.role) ?? [];
  const sourceLabel = { csv: "CSV", "pdf-text": "PDF text", "pdf-ocr": "PDF + OCR" };
  const balanceOk = r && r.balanceCheck.checked > 0 && r.balanceCheck.mismatches === 0;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{entry.file.name}</span>
        {entry.status === "processing" && <span className="text-xs text-blue-600">{entry.progress ?? "Processing…"}</span>}
        {entry.status === "error" && <span className="text-xs text-red-600">{entry.error}</span>}
        {r && (
          <>
            <Badge>{r.bank}</Badge>
            <Badge>{sourceLabel[r.source]}</Badge>
            <Badge>{r.transactions.length} transactions</Badge>
            {r.balanceCheck.checked > 0 && (
              <Badge tone={balanceOk ? "ok" : "warn"}>
                {balanceOk ? "✓ Balances reconcile" : `${r.balanceCheck.mismatches} balance mismatch(es)`}
              </Badge>
            )}
          </>
        )}
        <div className="ml-auto flex gap-3 text-xs">
          {isCsv && (
            <button onClick={onToggleMapping} className="text-blue-600 hover:underline">
              {entry.showMapping ? "Hide columns" : "Column mapping"}
            </button>
          )}
          <button onClick={onRemove} className="text-zinc-500 hover:text-red-600">
            Remove
          </button>
        </div>
      </div>

      {r && r.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
          {r.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {isCsv && entry.showMapping && r && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            {r.columns.map((c, i) => (
              <label key={i} className="flex flex-col gap-1 text-xs">
                <span className="max-w-[9rem] truncate text-zinc-500" title={c.header}>
                  {c.header}
                </span>
                <select
                  value={current[i]}
                  onChange={(e) => setRoles(current.map((x, j) => (j === i ? (e.target.value as ColumnRole) : x)))}
                  className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 dark:border-zinc-700"
                >
                  {ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            onClick={() => onApplyMapping(current)}
            className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Re-parse with these columns
          </button>
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  const cls =
    tone === "ok"
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}
