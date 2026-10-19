"use client";

import { CircleCheck, Columns3, FileText, LoaderCircle, Sheet, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import type { ColumnRole, ParseResult } from "@/lib/types";
import { Button, Card, cx } from "./ui";

export interface FileEntry {
  id: string;
  file: File;
  status: "processing" | "done" | "error";
  progress?: string;
  result?: ParseResult;
  error?: string;
  /** User-chosen column roles (CSV only). */
  roleOverrides?: ColumnRole[];
}

const ROLES: ColumnRole[] = ["date", "description", "amount", "debit", "credit", "balance", "type", "ignore"];
const SOURCE_LABEL = { csv: "CSV", "pdf-text": "PDF", "pdf-ocr": "Scanned PDF · OCR" };

export default function FileList({
  files,
  onRemove,
  onApplyMapping,
}: {
  files: FileEntry[];
  onRemove: (id: string) => void;
  onApplyMapping: (entry: FileEntry, roles: ColumnRole[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {files.map((f) => (
        <FileCard key={f.id} entry={f} onRemove={() => onRemove(f.id)} onApplyMapping={(roles) => onApplyMapping(f, roles)} />
      ))}
    </div>
  );
}

function FileCard({ entry, onRemove, onApplyMapping }: { entry: FileEntry; onRemove: () => void; onApplyMapping: (roles: ColumnRole[]) => void }) {
  const r = entry.result;
  const isCsv = /\.csv$/i.test(entry.file.name);
  const [showMapping, setShowMapping] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [roles, setRoles] = useState<ColumnRole[] | null>(null);
  const current = roles ?? r?.columns.map((c) => c.role) ?? [];
  const checked = r?.balanceCheck.checked ?? 0;
  const mismatches = r?.balanceCheck.mismatches ?? 0;
  const Icon = isCsv ? Sheet : FileText;

  return (
    <Card className={cx("px-3 py-2.5", showMapping && "sm:col-span-2 xl:col-span-3 2xl:col-span-4")}>
      <div className="flex items-center gap-3">
        <div
          className={cx(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            entry.status === "error" ? "bg-red-50 text-red-600 dark:bg-red-950/50" : "bg-accent-soft text-accent",
          )}
        >
          {entry.status === "processing" ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={entry.file.name}>
            {entry.file.name}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {entry.status === "processing" && <span className="truncate">{entry.progress ?? "Reading…"}</span>}
            {entry.status === "error" && <span className="truncate text-red-600 dark:text-red-400" title={entry.error}>{entry.error}</span>}
            {r && (
              <>
                <span className="truncate" title={`${r.bank} · ${SOURCE_LABEL[r.source]}`}>
                  {r.transactions.length} rows · {r.bank}
                </span>
                {checked > 0 &&
                  (mismatches === 0 ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-emerald-700 dark:text-emerald-400" title="Every row matches the running balance">
                      <CircleCheck className="size-3" /> Balanced
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-0.5 text-amber-700 dark:text-amber-300">
                      <TriangleAlert className="size-3" /> {mismatches} mismatch{mismatches === 1 ? "" : "es"}
                    </span>
                  ))}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {r && r.warnings.length > 0 && (
            <button
              onClick={() => setShowWarnings((v) => !v)}
              title={`${r.warnings.length} note${r.warnings.length === 1 ? "" : "s"} from parsing`}
              aria-label="Show parsing notes"
              aria-expanded={showWarnings}
              className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
            >
              <TriangleAlert className="size-3.5" /> {r.warnings.length}
            </button>
          )}
          {r && isCsv && (
            <button
              onClick={() => setShowMapping((v) => !v)}
              title="Column mapping"
              aria-label="Column mapping"
              aria-expanded={showMapping}
              className={cx("rounded-md p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800", showMapping ? "text-accent" : "text-muted hover:text-foreground")}
            >
              <Columns3 className="size-4" />
            </button>
          )}
          <button onClick={onRemove} aria-label={`Remove ${entry.file.name}`} title="Remove file" className="rounded-md p-1.5 text-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {r && showWarnings && (
        <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {r && showMapping && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs text-muted">Tell the parser what each column holds, then re-read the file.</p>
          <div className="flex flex-wrap gap-2">
            {r.columns.map((c, i) => (
              <label key={i} className="flex flex-col gap-1 text-xs">
                <span className="max-w-[9rem] truncate font-medium" title={c.header}>
                  {c.header}
                </span>
                <select
                  value={current[i]}
                  onChange={(e) => setRoles(current.map((x, j) => (j === i ? (e.target.value as ColumnRole) : x)))}
                  className="h-8 rounded-md border border-line bg-surface px-1.5 text-sm"
                >
                  {ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Button size="sm" variant="primary" className="mt-3" onClick={() => onApplyMapping(current)}>
            Re-read with these columns
          </Button>
        </div>
      )}
    </Card>
  );
}
