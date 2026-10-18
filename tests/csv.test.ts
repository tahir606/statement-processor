import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

const load = (f: string) => parseCsv(readFileSync(`samples/${f}`, "utf8"), f);

describe("parseCsv", () => {
  it("skips preamble and combines debit/credit columns", () => {
    const r = load("preamble-debit-credit.csv");
    expect(r.transactions.map((t) => t.amount)).toEqual([2850, -45.2, -38, -500]);
    expect(r.transactions[2].description).toBe("VIRGIN MEDIA, BROADBAND");
    expect(r.transactions[0].date).toBe("2026-09-01");
    expect(r.balanceCheck.mismatches).toBe(0);
    expect(r.transactions.map((x) => x.type)).toEqual(["Bank Credit", "Card Payment", "Direct Debit", "Faster Payment Out"]);
  });
  it("reads US month-first dates and signed amounts", () => {
    const r = load("us-signed-amount.csv");
    expect(r.transactions.map((t) => t.date)).toEqual(["2026-09-02", "2026-09-15", "2026-09-18", "2026-09-30"]);
    expect(r.transactions[1].amount).toBe(3200);
    expect(r.balanceCheck.mismatches).toBe(0);
  });
  it("guesses columns when there is no header", () => {
    const r = load("headerless.csv");
    expect(r.transactions).toHaveLength(3);
    expect(r.transactions[2]).toMatchObject({ date: "2026-09-04", description: "Groceries", amount: -54.75 });
  });
  it("infers the type from the description when there is no Type column", () => {
    const r = load("us-signed-amount.csv");
    expect(r.transactions.map((x) => x.type)).toEqual(["Debit", "Salary", "Debit", "Transfer"]);
  });
  it("respects manual column mapping", () => {
    const r = parseCsv("a,b,c\n2026-01-02,Shop,10.00", "x.csv", { roleOverrides: ["date", "description", "amount"] });
    expect(r.transactions[0]).toMatchObject({ date: "2026-01-02", description: "Shop", amount: 10 });
  });
});
