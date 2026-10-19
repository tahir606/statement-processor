"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button, MenuItem, Popover } from "./ui";

export default function ExportMenu({
  count,
  useAlt,
  onUseAltChange,
  onExcel,
  onCsv,
}: {
  count: number;
  useAlt: boolean;
  onUseAltChange: (v: boolean) => void;
  onExcel: () => void;
  onCsv: () => void;
}) {
  return (
    <Popover
      trigger={(open, toggle) => (
        <Button variant="primary" onClick={toggle} aria-expanded={open} disabled={count === 0}>
          <Download className="size-4" /> Export <ChevronDown className="size-3.5 opacity-70" />
        </Button>
      )}
    >
      {(close) => (
        <div className="w-72">
          <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted">
            Exports the {count} transaction{count === 1 ? "" : "s"} in the current view.
          </p>
          <MenuItem
            icon={<FileSpreadsheet className="size-4" />}
            title="Excel (.xlsx)"
            hint="Dates stay as DD-Mmm-YY"
            onClick={() => {
              onExcel();
              close();
            }}
          />
          <MenuItem
            icon={<FileText className="size-4" />}
            title="CSV"
            hint="Plain text, opens anywhere"
            onClick={() => {
              onCsv();
              close();
            }}
          />
          <div className="my-1.5 border-t border-line" />
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={useAlt} onChange={(e) => onUseAltChange(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium">Use alt description as description</span>
              <span className="block text-xs text-muted">Where a rule matched. The table on screen is unchanged.</span>
            </span>
          </label>
        </div>
      )}
    </Popover>
  );
}
