import Papa from "papaparse";
import { isUsableHeader, rolesForHeaders } from "./columns";
import { finalize, type RawRow } from "./finalize";
import { cleanDescription, detectDateOrder, guessStatementYear, isDateLike, looksLikeMoney, parseAmount, parseDate } from "./normalize";
import { CLOSING_BALANCE, detectProfile, OPENING_BALANCE, type BankProfile } from "./profiles";
import type { ColumnRole, ParseResult } from "./types";

export interface CsvOptions {
  /** Roles chosen by the user, one per column; replaces auto-detection. */
  roleOverrides?: ColumnRole[];
  profiles?: BankProfile[];
}

const HEADER_SEARCH_ROWS = 30;

export function parseCsv(text: string, fileName: string, opts: CsvOptions = {}): ParseResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const rows = parsed.data.map((r) => r.map((c) => (c ?? "").trim()));
  const preamble = rows.slice(0, HEADER_SEARCH_ROWS).map((r) => r.join(" ")).join("\n");
  const profile = detectProfile(preamble, opts.profiles);
  const warnings: string[] = [];

  // 1. Find the header row (banks often put account details above it).
  let headerIndex = -1;
  let headers: string[] = [];
  let roles: ColumnRole[] = [];
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const r = rolesForHeaders(rows[i], profile.headerOverrides);
    if (isUsableHeader(r)) {
      headerIndex = i;
      headers = rows[i];
      roles = r;
      break;
    }
  }
  if (headerIndex === -1) {
    const width = Math.max(...rows.slice(0, 50).map((r) => r.length), 0);
    headers = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    roles = guessRolesFromData(rows.slice(0, 50), width);
    if (!opts.roleOverrides) warnings.push("No header row found — columns were guessed from the data. Check the column mapping.");
  }
  if (opts.roleOverrides) roles = headers.map((_, i) => opts.roleOverrides![i] ?? "ignore");

  const col = (role: ColumnRole) => roles.indexOf(role);
  const dateCol = col("date");
  const amountCol = col("amount");
  const debitCol = col("debit");
  const creditCol = col("credit");
  const balanceCol = col("balance");
  const typeCol = col("type");
  const descCols = roles.flatMap((r, i) => (r === "description" ? [i] : []));

  const columns = headers.map((h, i) => ({ header: h || `Column ${i + 1}`, role: roles[i] ?? "ignore" }));
  if (dateCol === -1 || (amountCol === -1 && debitCol === -1 && creditCol === -1)) {
    warnings.push("Couldn't find a date column and an amount column. Set the column mapping manually.");
    return finalize({ fileName, source: "csv", bank: profile.name, rows: [], amountsSigned: true, openingBalance: null, closingBalance: null, warnings, columns });
  }

  const body = rows.slice(headerIndex + 1);
  const dateOrder = profile.dateOrder ?? detectDateOrder(body.map((r) => r[dateCol] ?? "").filter(isDateLike));
  const year = guessStatementYear(preamble + "\n" + body.map((r) => r[dateCol]).join(" "));

  // 2. Read rows.
  const out: RawRow[] = [];
  let opening: number | null = null;
  let closing: number | null = null;
  let sawNegative = false;
  let skipped = 0;

  for (const r of body) {
    const description = cleanDescription(descCols.map((i) => r[i] ?? "").filter(Boolean).join(" "));
    const balance = balanceCol >= 0 ? parseAmount(r[balanceCol]) : null;
    const rawDate = r[dateCol] ?? "";

    if (OPENING_BALANCE.test(description) || OPENING_BALANCE.test(r.join(" "))) {
      opening = balance ?? parseAmount(r[amountCol]) ?? opening;
      continue;
    }
    if (CLOSING_BALANCE.test(description)) {
      closing = balance ?? closing;
      continue;
    }

    const date = isDateLike(rawDate) ? parseDate(rawDate, dateOrder, year) : null;
    if (!date) {
      if (r.some(Boolean)) skipped++;
      continue;
    }

    let amount: number | null;
    if (debitCol >= 0 || creditCol >= 0) {
      const debit = debitCol >= 0 ? parseAmount(r[debitCol]) : null;
      const credit = creditCol >= 0 ? parseAmount(r[creditCol]) : null;
      if (debit == null && credit == null) {
        // Some exports use split columns *and* an amount column.
        amount = amountCol >= 0 ? parseAmount(r[amountCol]) : null;
      } else {
        amount = Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
      }
      sawNegative = true;
    } else {
      amount = parseAmount(r[amountCol]);
      if (amount != null && amount < 0) sawNegative = true;
      const type = (r[typeCol] ?? "").toLowerCase();
      if (amount != null && type) {
        if (/^(dr|debit|d|withdrawal|payment|purchase)/.test(type)) { amount = -Math.abs(amount); sawNegative = true; }
        else if (/^(cr|credit|c|deposit)/.test(type)) { amount = Math.abs(amount); sawNegative = true; }
      }
    }
    if (amount == null) {
      skipped++;
      continue;
    }
    out.push({ date, type: typeCol >= 0 ? r[typeCol] : undefined, description, amount, balance });
  }

  const amountsSigned = sawNegative;
  if (!amountsSigned && profile.positiveIsDebit) for (const row of out) row.amount = -Math.abs(row.amount);
  if (skipped) warnings.push(`Skipped ${skipped} row(s) without a valid date or amount.`);

  return finalize({
    fileName,
    source: "csv",
    bank: profile.name,
    rows: out,
    amountsSigned: amountsSigned || !!profile.positiveIsDebit,
    openingBalance: opening,
    closingBalance: closing,
    warnings,
    columns,
  });
}

/** Headerless CSV: the date column is the one full of dates, money columns are numeric, description is the longest text. */
function guessRolesFromData(rows: string[][], width: number): ColumnRole[] {
  const roles: ColumnRole[] = Array(width).fill("ignore");
  const score = (i: number, test: (s: string) => boolean) => {
    const vals = rows.map((r) => r[i] ?? "").filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const dateCol = [...Array(width).keys()].find((i) => score(i, isDateLike) > 0.7);
  if (dateCol !== undefined) roles[dateCol] = "date";

  const moneyCols = [...Array(width).keys()].filter((i) => i !== dateCol && score(i, looksLikeMoney) > 0.4);
  if (moneyCols.length === 1) roles[moneyCols[0]] = "amount";
  else if (moneyCols.length === 2) { roles[moneyCols[0]] = "amount"; roles[moneyCols[1]] = "balance"; }
  else if (moneyCols.length >= 3) {
    const last3 = moneyCols.slice(-3);
    roles[last3[0]] = "debit"; roles[last3[1]] = "credit"; roles[last3[2]] = "balance";
  }

  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < width; i++) {
    if (roles[i] !== "ignore") continue;
    const avg = rows.reduce((s, r) => s + (r[i]?.length ?? 0), 0) / Math.max(rows.length, 1);
    if (avg > bestLen) { bestLen = avg; best = i; }
  }
  if (best >= 0) roles[best] = "description";
  return roles;
}
