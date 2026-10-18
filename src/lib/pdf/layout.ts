import { isUsableHeader, rolesForHeaders } from "../columns";
import { finalize, type RawRow } from "../finalize";
import {
  cleanDescription,
  dateHasYear,
  detectDateOrder,
  guessStatementYear,
  isDateLike,
  looksLikeMoney,
  parseAmount,
  parseDate,
} from "../normalize";
import { CLOSING_BALANCE, COMMON_SKIP_LINES, detectProfile, OPENING_BALANCE, type BankProfile } from "../profiles";
import type { ColumnRole, ParseResult, PositionedWord } from "../types";

/** Rows with any OCR word below this confidence get flagged for review. */
const LOW_CONFIDENCE = 70;

/** Words close together on a line, forming one table cell. */
export interface Cell {
  text: string;
  x: number;
  right: number;
  /** Lowest OCR confidence of the words in this cell. */
  confidence?: number;
}

export interface Line {
  page: number;
  y: number;
  height: number;
  cells: Cell[];
  text: string;
}

interface Column {
  role: ColumnRole;
  header: string;
  left: number;
  right: number;
}

/** pdf.js often returns "05 Oct    Card payment" as one item; split on runs of spaces. */
function splitWideItems(words: PositionedWord[]): PositionedWord[] {
  const out: PositionedWord[] = [];
  for (const w of words) {
    const text = w.text;
    if (!/\S\s{2,}\S/.test(text)) {
      if (text.trim()) out.push({ ...w, text: text.trim() });
      continue;
    }
    const charW = w.width / Math.max(text.length, 1);
    for (const m of text.matchAll(/\S+(?: \S+)*/g)) {
      out.push({ ...w, text: m[0], x: w.x + (m.index ?? 0) * charW, width: m[0].length * charW });
    }
  }
  return out;
}

export function groupLines(words: PositionedWord[]): Line[] {
  const sorted = splitWideItems(words).sort((a, b) => a.page - b.page || a.y + a.height / 2 - (b.y + b.height / 2));
  const lines: { page: number; y: number; height: number; words: PositionedWord[] }[] = [];
  for (const w of sorted) {
    const mid = w.y + w.height / 2;
    const last = lines[lines.length - 1];
    if (last && last.page === w.page && Math.abs(last.y - mid) <= Math.max(2, 0.5 * Math.min(last.height, w.height))) {
      last.words.push(w);
    } else {
      lines.push({ page: w.page, y: mid, height: w.height, words: [w] });
    }
  }
  return lines.map((l) => {
    const ws = l.words.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const w of ws) {
      const prev = cells[cells.length - 1];
      const gap = prev ? w.x - prev.right : Infinity;
      // Keep separate when both sides are values (adjacent number columns can sit close together).
      const bothValues = prev && (looksLikeMoney(prev.text) || isDateLike(prev.text)) && looksLikeMoney(w.text);
      if (prev && gap < Math.max(1.5, 0.8 * l.height) && !bothValues) {
        // OCR words are always whole words; text-layer fragments may be pieces of one word.
        const space = w.confidence != null || gap > 0.15 * l.height;
        prev.text += (space ? " " : "") + w.text;
        prev.right = Math.max(prev.right, w.x + w.width);
        if (w.confidence != null) prev.confidence = Math.min(prev.confidence ?? 100, w.confidence);
      } else {
        cells.push({ text: w.text, x: w.x, right: w.x + w.width, confidence: w.confidence });
      }
    }
    return { page: l.page, y: l.y, height: l.height, cells, text: cells.map((c) => c.text).join(" ") };
  });
}

function headerColumns(line: Line, profile: BankProfile): Column[] | null {
  const roles = rolesForHeaders(line.cells.map((c) => c.text), profile.headerOverrides);
  if (!isUsableHeader(roles) || line.cells.length < 3) return null;
  // Header cells must be mostly words, not values.
  if (line.cells.filter((c) => looksLikeMoney(c.text)).length > 1) return null;

  // OCR can garble a header word ("Detalls"); the widest unlabelled column left of the amounts is the description.
  if (!roles.includes("description")) {
    const firstMoney = roles.findIndex((r) => r === "amount" || r === "debit" || r === "credit");
    let best = -1;
    for (let i = 0; i < firstMoney; i++) {
      if (roles[i] === "ignore" && (best === -1 || line.cells[i + 1].x - line.cells[i].x > line.cells[best + 1].x - line.cells[best].x)) best = i;
    }
    if (best >= 0) roles[best] = "description";
  }

  const cols = line.cells.map((c, i) => ({ role: roles[i], header: c.text, left: c.x, right: c.right }));
  // Extend each column to the midpoint of the gap between neighbours so the regions tile the line.
  for (let i = 0; i < cols.length; i++) {
    const prev = cols[i - 1];
    const next = cols[i + 1];
    const left = prev ? (line.cells[i - 1].right + line.cells[i].x) / 2 : -Infinity;
    const right = next ? (line.cells[i].right + line.cells[i + 1].x) / 2 : Infinity;
    cols[i].left = left;
    cols[i].right = right;
  }
  return cols;
}

function columnFor(cell: Cell, cols: Column[]): Column {
  let best = cols[0];
  let bestOverlap = -Infinity;
  for (const c of cols) {
    const overlap = Math.min(cell.right, c.right) - Math.max(cell.x, c.left);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = c;
    }
  }
  return best;
}

interface Draft {
  rawDate: string;
  type: string;
  description: string[];
  debit: number | null;
  credit: number | null;
  amount: number | null;
  balance: number | null;
  page: number;
  bottom: number;
  lineHeight: number;
  minConfidence: number;
}

export interface LayoutOptions {
  fileName: string;
  source: "pdf-text" | "pdf-ocr";
  profiles?: BankProfile[];
}

export function parseStatementLayout(words: PositionedWord[], opts: LayoutOptions): ParseResult {
  const lines = groupLines(words);
  const fullText = lines.map((l) => l.text).join("\n");
  const firstPageText = lines.filter((l) => l.page === lines[0]?.page).map((l) => l.text).join("\n");
  const profile = detectProfile(firstPageText, opts.profiles);
  const skip = [...COMMON_SKIP_LINES, ...(profile.skipLines ?? [])];
  const warnings: string[] = [];

  let cols: Column[] | null = null;
  let firstHeader: Column[] | null = null;
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let opening: number | null = null;
  let closing: number | null = null;

  const flush = () => {
    if (current && (current.amount != null || current.debit != null || current.credit != null)) drafts.push(current);
    current = null;
  };

  // On pages that repeat the table header, everything above it is page furniture.
  const headers = lines.map((l) => headerColumns(l, profile));
  const headerIndexByPage = new Map<number, number>();
  headers.forEach((h, i) => {
    if (h && !headerIndexByPage.has(lines[i].page)) headerIndexByPage.set(lines[i].page, i);
  });

  for (const [index, line] of lines.entries()) {
    const header = headers[index];
    if (header) {
      flush();
      cols = header;
      firstHeader ??= header;
      continue;
    }
    if (skip.some((re) => re.test(line.text.trim()))) continue;
    if (index < (headerIndexByPage.get(line.page) ?? -1)) {
      // Still look for an opening balance in the summary box above the table.
      if (OPENING_BALANCE.test(line.text) && opening == null) opening = findSummaryValue(line.text, OPENING_BALANCE);
      continue;
    }

    const isOpening = OPENING_BALANCE.test(line.text);
    const isClosing = CLOSING_BALANCE.test(line.text);
    if (isOpening || isClosing) {
      const money = line.cells.filter((c) => looksLikeMoney(c.text));
      const value = money.length ? parseAmount(money[money.length - 1].text) : null;
      if (isOpening && opening == null) opening = value;
      if (isClosing) closing = value ?? closing;
      flush();
      continue;
    }
    if (!cols) continue; // Still above the first table.

    // Map this line's cells onto the columns.
    const byRole = new Map<ColumnRole, string[]>();
    for (const cell of line.cells) {
      const role = columnFor(cell, cols).role;
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role)!.push(cell.text);
    }
    const get = (r: ColumnRole) => byRole.get(r)?.join(" ").trim() ?? "";
    const lineConfidence = Math.min(100, ...line.cells.map((c) => c.confidence ?? 100));
    const rawDate = get("date");
    const money = {
      amount: parseAmount(get("amount")),
      debit: parseAmount(get("debit")),
      credit: parseAmount(get("credit")),
      balance: parseAmount(get("balance")),
    };
    const hasMoney = money.amount != null || money.debit != null || money.credit != null;
    const desc = get("description");
    const hasDate = rawDate !== "" && isDateLike(rawDate);

    const near = (d: Draft | null) => d && d.page === line.page && line.y - d.bottom < 2.2 * Math.max(line.height, d.lineHeight);

    if (hasDate || (hasMoney && drafts.length + (current ? 1 : 0) > 0)) {
      // Amount line belonging to a dated row that had none yet.
      if (!hasDate && current && near(current) && current.amount == null && current.debit == null && current.credit == null) {
        Object.assign(current, pick(money));
        if (desc) current.description.push(desc);
        current.type ||= get("type");
        current.minConfidence = Math.min(current.minConfidence, lineConfidence);
        current.bottom = line.y;
        continue;
      }
      flush();
      const prevDate: string = hasDate ? rawDate : (drafts[drafts.length - 1]?.rawDate ?? "");
      current = {
        rawDate: prevDate,
        type: get("type"),
        description: desc ? [desc] : [],
        ...money,
        page: line.page,
        bottom: line.y,
        lineHeight: line.height,
        minConfidence: lineConfidence,
      };
      continue;
    }
    // Wrapped description text.
    const last: Draft | null = current ?? drafts[drafts.length - 1] ?? null;
    if (!hasMoney && last && near(last) && (desc || money.balance != null)) {
      if (desc) last.description.push(desc);
      if (money.balance != null && last.balance == null) last.balance = money.balance;
      last.minConfidence = Math.min(last.minConfidence, lineConfidence);
      last.bottom = line.y;
    }
  }
  flush();

  if (!firstHeader) {
    warnings.push("No table header found — used the fallback line parser (date at start, amounts at end). Check signs and amounts.");
    return fallbackParse(lines, opts, profile, warnings, fullText);
  }

  const dateOrder = profile.dateOrder ?? detectDateOrder(drafts.map((d) => d.rawDate));
  const year = guessStatementYear(fullText);
  const hasSplit = firstHeader.some((c) => c.role === "debit" || c.role === "credit");

  const rows: RawRow[] = [];
  const yearless: boolean[] = [];
  let sawNegative = hasSplit;
  for (const d of drafts) {
    const date = parseDate(d.rawDate, dateOrder, year);
    if (!date) {
      warnings.push(`Could not read date "${d.rawDate}" for "${d.description.join(" ").slice(0, 40)}".`);
      continue;
    }
    let amount: number;
    if (d.debit != null || d.credit != null) amount = Math.abs(d.credit ?? 0) - Math.abs(d.debit ?? 0);
    else {
      amount = d.amount ?? 0;
      if (amount < 0) sawNegative = true;
    }
    rows.push({ date, type: d.type, description: cleanDescription(d.description.join(" ")), amount, balance: d.balance, flags: lowConfidenceFlag(d.minConfidence) });
    yearless.push(!dateHasYear(d.rawDate));
  }
  fixYearRollover(rows, yearless, fullText);

  if (!sawNegative && profile.positiveIsDebit) for (const r of rows) r.amount = -Math.abs(r.amount);
  if (opening == null) opening = findSummaryValue(fullText, OPENING_BALANCE);

  return finalize({
    fileName: opts.fileName,
    source: opts.source,
    bank: profile.name,
    rows,
    amountsSigned: sawNegative || !!profile.positiveIsDebit,
    openingBalance: opening,
    closingBalance: closing ?? findSummaryValue(fullText, CLOSING_BALANCE),
    warnings,
    columns: firstHeader.map((c) => ({ header: c.header, role: c.role })),
  });
}

function lowConfidenceFlag(confidence: number): string[] {
  return confidence < LOW_CONFIDENCE ? [`Low OCR confidence (${Math.round(confidence)}%) — check this row against the statement`] : [];
}

function pick(m: { amount: number | null; debit: number | null; credit: number | null; balance: number | null }) {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v != null));
}

function findSummaryValue(text: string, re: RegExp): number | null {
  for (const line of text.split("\n")) {
    if (!re.test(line)) continue;
    const m = line.match(/-?[£$€]?\s?\d{1,3}(?:,?\d{3})*\.\d{2}(?:\s?(?:CR|DR))?/gi);
    if (m) return parseAmount(m[m.length - 1]);
  }
  return null;
}

/** Statements spanning Dec→Jan with yearless dates: bump the year at the rollover. */
function fixYearRollover(rows: RawRow[], yearless: boolean[], text: string) {
  if (!yearless.some(Boolean)) return;
  const years = new Set([...text.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]));
  for (let i = 1; i < rows.length; i++) {
    if (!yearless[i] || !yearless[i - 1]) continue;
    const prevM = +rows[i - 1].date.slice(5, 7);
    const m = +rows[i].date.slice(5, 7);
    const ascending = prevM >= 11 && m <= 2;
    const descending = prevM <= 2 && m >= 11;
    if (!ascending && !descending) continue;
    const base = +rows[i].date.slice(0, 4);
    // Shift whichever side lets both years appear in the statement text.
    const before = rows.slice(0, i);
    const after = rows.slice(i);
    const shift = (list: RawRow[], delta: number) => list.forEach((r) => (r.date = `${+r.date.slice(0, 4) + delta}${r.date.slice(4)}`));
    const earlierYearMentioned = years.has(base - 1);
    if (ascending) {
      if (earlierYearMentioned) shift(before, -1);
      else shift(after, +1);
    } else if (earlierYearMentioned) shift(after, -1);
    else shift(before, +1);
    return;
  }
}

/** For PDFs without a recognisable header: date at the start of the line, money at the end. */
function fallbackParse(lines: Line[], opts: LayoutOptions, profile: BankProfile, warnings: string[], fullText: string): ParseResult {
  const drafts: { rawDate: string; desc: string[]; amount: number; balance: number | null; page: number; y: number; conf: number }[] = [];
  let opening: number | null = null;
  for (const line of lines) {
    if (OPENING_BALANCE.test(line.text) && opening == null) {
      opening = findSummaryValue(line.text, OPENING_BALANCE);
      continue;
    }
    const cells = line.cells;
    const first = cells[0]?.text ?? "";
    const moneyTail: number[] = [];
    for (let i = cells.length - 1; i > 0 && looksLikeMoney(cells[i].text); i--) moneyTail.unshift(i);
    if (isDateLike(first) && moneyTail.length) {
      const vals = moneyTail.map((i) => parseAmount(cells[i].text)!);
      const desc = cells.slice(1, moneyTail[0]).map((c) => c.text).join(" ");
      drafts.push({
        rawDate: first,
        desc: [desc],
        amount: vals.length >= 2 ? vals[vals.length - 2] : vals[0],
        balance: vals.length >= 2 ? vals[vals.length - 1] : null,
        page: line.page,
        y: line.y,
        conf: Math.min(100, ...cells.map((c) => c.confidence ?? 100)),
      });
    } else if (!moneyTail.length && drafts.length) {
      const last = drafts[drafts.length - 1];
      if (last.page === line.page && line.y - last.y < 2.2 * line.height && !isDateLike(first)) {
        last.desc.push(line.text);
        last.y = line.y;
      }
    }
  }
  const order = profile.dateOrder ?? detectDateOrder(drafts.map((d) => d.rawDate));
  const year = guessStatementYear(fullText);
  const rows: RawRow[] = [];
  for (const d of drafts) {
    const date = parseDate(d.rawDate, order, year);
    if (date) rows.push({ date, description: cleanDescription(d.desc.join(" ")), amount: d.amount, balance: d.balance, flags: lowConfidenceFlag(d.conf) });
  }
  return finalize({
    fileName: opts.fileName,
    source: opts.source,
    bank: profile.name,
    rows,
    amountsSigned: rows.some((r) => r.amount < 0),
    openingBalance: opening,
    closingBalance: findSummaryValue(fullText, CLOSING_BALANCE),
    warnings,
    columns: [],
  });
}
