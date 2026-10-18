import type { DateOrder } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const CURRENCY = /[£$€¥₹₨]|\b(?:GBP|USD|EUR|PKR|INR|AED|CAD|AUD|Rs\.?)\b/gi;

/**
 * Parse a money string as it appears on statements.
 * Handles "1,234.56", "1.234,56", "(12.00)", "12.00-", "-12.00", "12.00 DR", "12.00CR", currency symbols.
 * Returns null when the string is not a number.
 */
export function parseAmount(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  let negative = false;
  if (/\bDR\b|\bD$/i.test(s) || /\d\s*DR$/i.test(s)) negative = true;
  s = s.replace(/\s*(CR|DR|C|D)\.?$/i, "");
  s = s.replace(CURRENCY, "").replace(/\s+/g, "");

  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/'/g, "");

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    // Whichever separator comes last is the decimal point.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // "12,50" is a decimal comma; "1,250" / "1,250,000" are thousands.
    const decimals = s.length - lastComma - 1;
    const commaCount = s.split(",").length - 1;
    s = commaCount === 1 && decimals === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot !== -1 && s.split(".").length > 2) {
    s = s.replace(/\./g, ""); // "1.234.567"
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

/** True if the string looks like a money value (has decimals or separators), not e.g. a reference number. */
export function looksLikeMoney(input: string): boolean {
  const s = input.trim();
  return /^[-+(]?\s*(?:[£$€¥₹₨]|GBP|USD|EUR|PKR|Rs\.?)?\s*-?\d{1,3}(?:[,.' ]?\d{3})*(?:[.,]\d{2})\)?\s*-?(?:CR|DR)?$/i.test(s);
}

interface DateParts {
  a: number;
  b: number;
  c: number | null;
  monthFromName: boolean;
  /** Index (0/1/2) of the month when the month was written as a name. */
  monthPos?: number;
}

function monthFromName(name: string): number | undefined {
  const n = name.toLowerCase();
  return MONTHS[n.slice(0, 4)] ?? MONTHS[n.slice(0, 3)];
}

function splitDate(input: string): DateParts | null {
  const s = input.trim().replace(/,/g, " ").replace(/\s+/g, " ");

  // 05 Oct 2026, 5-Oct-26, 05 Oct
  let m = s.match(/^(\d{1,2})[\s\-./]?([A-Za-z]{3,9})\.?[\s\-./]?(\d{2,4})?$/);
  if (m) {
    const month = monthFromName(m[2]);
    if (month) return { a: +m[1], b: month, c: m[3] ? +m[3] : null, monthFromName: true, monthPos: 1 };
  }
  // Oct 5 2026, October 05
  m = s.match(/^([A-Za-z]{3,9})\.?[\s\-./]?(\d{1,2})(?:[\s\-./]+(\d{2,4}))?$/);
  if (m) {
    const month = monthFromName(m[1]);
    if (month) return { a: month, b: +m[2], c: m[3] ? +m[3] : null, monthFromName: true, monthPos: 0 };
  }
  // 2026-10-05, 05/10/2026, 10/05/26, 05.10.2026, 05/10
  m = s.match(/^(\d{1,4})[\-./](\d{1,2})(?:[\-./](\d{2,4}))?$/);
  if (m) return { a: +m[1], b: +m[2], c: m[3] ? +m[3] : null, monthFromName: false };
  return null;
}

export function dateHasYear(input: string): boolean {
  const p = splitDate(input);
  return !!p && (p.c != null || p.a > 999);
}

export function isDateLike(input: string): boolean {
  const p = splitDate(input);
  if (!p) return false;
  if (p.monthFromName) return true;
  if (p.a > 999) return p.b >= 1 && p.b <= 12 && (p.c ?? 1) >= 1 && (p.c ?? 1) <= 31;
  return p.a >= 1 && p.b >= 1 && (p.a <= 31 && p.b <= 31) && (p.a <= 12 || p.b <= 12);
}

/**
 * Look at a set of date strings and decide whether they are day-first or month-first.
 * Any value > 12 in the first or second slot settles it.
 */
export function detectDateOrder(samples: string[], fallback: DateOrder = "DMY"): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const p = splitDate(s);
    if (!p || p.monthFromName) continue;
    if (p.a > 999) return "YMD";
    if (p.a > 12 && p.b <= 12) dmy++;
    if (p.b > 12 && p.a <= 12) mdy++;
  }
  if (dmy > mdy) return "DMY";
  if (mdy > dmy) return "MDY";
  return fallback;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Parse a statement date into ISO yyyy-mm-dd.
 * `defaultYear` fills in dates printed without a year (e.g. "05 Oct").
 */
export function parseDate(input: string, order: DateOrder = "DMY", defaultYear?: number): string | null {
  const p = splitDate(input);
  if (!p) return null;

  let day: number, month: number, year: number | null;
  if (p.monthFromName) {
    month = p.monthPos === 0 ? p.a : p.b;
    day = p.monthPos === 0 ? p.b : p.a;
    year = p.c;
  } else if (p.a > 999 || order === "YMD") {
    year = p.a;
    month = p.b;
    day = p.c ?? NaN;
  } else if (order === "MDY") {
    month = p.a;
    day = p.b;
    year = p.c;
  } else {
    day = p.a;
    month = p.b;
    year = p.c;
  }

  if (year == null) year = defaultYear ?? new Date().getFullYear();
  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // e.g. 31/02
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Find a 4-digit year mentioned in the statement text (used for dates printed without a year). */
export function guessStatementYear(text: string): number | undefined {
  const years = [...text.matchAll(/\b(19[89]\d|20\d{2})\b/g)].map((m) => +m[1]);
  if (!years.length) return undefined;
  const counts = new Map<number, number>();
  for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function cleanDescription(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO yyyy-mm-dd → display format DD-Mmm-YY, e.g. "2026-10-05" → "05-Oct-26". */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}-${MONTH_ABBR[+m[2] - 1]}-${m[1].slice(2)}`;
}
