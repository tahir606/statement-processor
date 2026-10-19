"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-white shadow-sm hover:brightness-110 dark:text-zinc-950",
        variant === "secondary" && "border border-line bg-surface shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800",
        variant === "ghost" && "text-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800",
        variant === "danger" && "text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40",
        className,
      )}
    />
  );
}

const TONES = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300",
  red: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/50 dark:text-red-300",
  accent: "bg-accent-soft text-accent ring-accent/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-surface shadow-sm", className)}>{children}</div>;
}

/** Tabs-style segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/70">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
            value === o.value ? "bg-surface text-foreground shadow-sm dark:bg-zinc-600" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A button that opens a small floating panel; closes on outside click or Escape. */
export function Popover({ trigger, children, align = "right" }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={cx(
            "animate-fade-in absolute z-30 mt-1.5 min-w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
      <span className="mt-0.5 text-muted">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}
