"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt } from "./ui";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const HEIGHT = 240;
const M = { top: 12, right: 12, bottom: 26, left: 48 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round axis ticks that cover [min, max]; always includes zero when the data allows it. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = max > lo ? max : lo + 1;
  const raw = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v < hi + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function Grid({ ticks, y, width }: { ticks: number[]; y: (v: number) => number; width: number }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular-nums">
            {compact.format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex min-w-0 items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: i.color }} />
          <span className="truncate">{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = x > width / 2;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs shadow-lg"
      style={left ? { right: width - x + 10 } : { left: x + 10 }}
    >
      {children}
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-1.5 text-muted">
        <span className="size-2 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="max-w-40 truncate">{label}</span>
      </span>
      <span className="font-medium tabular-nums">{fmt(value)}</span>
    </div>
  );
}

const roundedTop = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

/** Paired columns on one axis, with a table view for anyone who can't or won't read the chart. */
export function PairedColumns({ rows, seriesA, seriesB, caption }: { rows: { label: string; a: number; b: number }[]; seriesA: string; seriesB: string; caption: string }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.flatMap((r) => [r.a, r.b]), 0);
  const ticks = niceTicks(0, max);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => HEIGHT - M.bottom - (v / top) * (HEIGHT - M.top - M.bottom);
  const band = (width - M.left - M.right) / Math.max(rows.length, 1);
  const bar = Math.max(3, Math.min(24, (band - 10) / 2));
  const every = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor((width - M.left) / 56))));
  const base = y(0);

  return (
    <div>
      <Legend items={[{ label: seriesA, color: SERIES[0] }, { label: seriesB, color: SERIES[1] }]} />
      <div ref={ref} className="relative mt-2" style={{ height: HEIGHT }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={caption}>
            <Grid ticks={ticks} y={y} width={width} />
            {rows.map((r, i) => {
              const cx = M.left + band * i + band / 2;
              return (
                <g key={r.label}>
                  {hover === i && <rect x={M.left + band * i} y={M.top} width={band} height={base - M.top} fill="var(--border)" opacity={0.35} />}
                  {r.a > 0 && <path d={roundedTop(cx - bar - 1, y(r.a), bar, base - y(r.a))} fill={SERIES[0]} />}
                  {r.b > 0 && <path d={roundedTop(cx + 1, y(r.b), bar, base - y(r.b))} fill={SERIES[1]} />}
                  {i % every === 0 && (
                    <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                      {r.label}
                    </text>
                  )}
                  <rect x={M.left + band * i} y={0} width={band} height={HEIGHT} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
        )}
        {hover != null && rows[hover] && (
          <Tooltip x={M.left + band * hover + band / 2} width={width}>
            <div className="font-semibold">{rows[hover].label}</div>
            <TipRow color={SERIES[0]} label={seriesA} value={rows[hover].a} />
            <TipRow color={SERIES[1]} label={seriesB} value={rows[hover].b} />
          </Tooltip>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">View as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Period</th>
              <th className="py-1 text-right font-medium">{seriesA}</th>
              <th className="py-1 text-right font-medium">{seriesB}</th>
            </tr>
          </thead>
          <tbody className="text-foreground">
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="py-1">{r.label}</td>
                <td className="py-1 text-right">{fmt(r.a)}</td>
                <td className="py-1 text-right">{fmt(r.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Lines on a shared time axis. At most four series; the caller says what was left out. */
export function TimeLines({ series, caption, formatDate }: { series: { name: string; points: { date: string; balance: number }[] }[]; caption: string; formatDate: (d: string) => string }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<string | null>(null);
  const shown = series.slice(0, 4);
  const dates = [...new Set(shown.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const values = shown.flatMap((s) => s.points.map((p) => p.balance));
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const t0 = Date.parse(dates[0]);
  const t1 = Date.parse(dates[dates.length - 1]);
  const x = (d: string) => M.left + ((Date.parse(d) - t0) / Math.max(t1 - t0, 1)) * (width - M.left - M.right);
  const y = (v: number) => HEIGHT - M.bottom - ((v - lo) / (hi - lo || 1)) * (HEIGHT - M.top - M.bottom);
  const valueAt = (s: (typeof shown)[number], d: string) => [...s.points].reverse().find((p) => p.date <= d)?.balance;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left + M.left;
    setHover(dates.reduce((best, d) => (Math.abs(x(d) - px) < Math.abs(x(best) - px) ? d : best), dates[0]));
  };

  return (
    <div>
      {shown.length > 1 && <Legend items={shown.map((s, i) => ({ label: s.name, color: SERIES[i] }))} />}
      <div ref={ref} className="relative mt-2" style={{ height: HEIGHT }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={caption}>
            <Grid ticks={ticks} y={y} width={width} />
            {[dates[0], dates[dates.length - 1]].map((d, i) => (
              <text key={d} x={x(d)} y={HEIGHT - 8} textAnchor={i ? "end" : "start"} fontSize={11} fill="var(--muted)">
                {formatDate(d)}
              </text>
            ))}
            {hover && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} />}
            {shown.map((s, i) => {
              const last = s.points[s.points.length - 1];
              return (
                <g key={s.name}>
                  <path d={s.points.map((p, j) => `${j ? "L" : "M"}${x(p.date)},${y(p.balance)}`).join("")} fill="none" stroke={SERIES[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={x(last.date)} cy={y(last.balance)} r={4} fill={SERIES[i]} stroke="var(--surface)" strokeWidth={2} />
                </g>
              );
            })}
            <rect x={M.left} y={0} width={Math.max(width - M.left - M.right, 0)} height={HEIGHT} fill="transparent" onMouseMove={onMove} />
          </svg>
        )}
        {hover && (
          <Tooltip x={x(hover)} width={width}>
            <div className="font-semibold">{formatDate(hover)}</div>
            {shown.map((s, i) => {
              const v = valueAt(s, hover);
              return v == null ? null : <TipRow key={s.name} color={SERIES[i]} label={s.name} value={v} />;
            })}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Ranked horizontal bars with the value beside each: one series, so one colour. */
export function RankedBars({ groups, muted, limit = 8 }: { groups: { label: string; value: number }[]; muted?: string; limit?: number }) {
  const top = groups.slice(0, limit);
  const rest = groups.slice(limit).reduce((s, g) => s + g.value, 0);
  const rows = rest > 0 ? [...top, { label: `Other (${groups.length - limit})`, value: rest }] : top;
  const total = groups.reduce((s, g) => s + g.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((g) => (
        <li key={g.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={g.label === muted ? "truncate italic text-muted" : "truncate"} title={g.label}>
              {g.label}
            </span>
            <span className="shrink-0 tabular-nums">
              {fmt(g.value)} <span className="text-xs text-muted">{Math.round((g.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1 h-2">
            <div
              className="h-2 rounded-r"
              style={{ width: `${Math.max((g.value / max) * 100, 1)}%`, background: g.label === muted ? "var(--border)" : "var(--series-1)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
