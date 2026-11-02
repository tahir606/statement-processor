import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectAccountKind, parseCardSummary } from "@/lib/card";
import { parseCsv } from "@/lib/csv";
import { parseStatementLayout } from "@/lib/pdf/layout";
import { readTextLayer } from "@/lib/pdf/textLayer";

async function pdf(file: string) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`samples/${file}`)) }).promise;
  const { words } = await readTextLayer(doc as never);
  return parseStatementLayout(words, { fileName: file, source: "pdf-text" });
}

describe("credit card statements", () => {
  it("recognises a card from its wording, not from one stray mention", () => {
    expect(detectAccountKind("Minimum payment 25.00\nPayment due date 24 Nov")).toBe("card");
    expect(detectAccountKind("Transfer for credit card")).toBe("bank");
    expect(detectAccountKind("", "my-credit-card.csv")).toBe("card");
  });

  it("reads a PDF: charges negative, CR rows positive, payments marked as transfers", async () => {
    const r = await pdf("credit-card-oct-2026.pdf");
    expect(r.accountKind).toBe("card");
    expect(r.transactions).toHaveLength(9); // the undated "Interest this period" line is not a row
    const by = (s: string) => r.transactions.find((t) => t.description.includes(s))!;
    expect(by("AMAZON MARKETPLACE")).toMatchObject({ amount: -54.99, type: "Purchase", transfer: false });
    expect(by("PAYMENT RECEIVED")).toMatchObject({ amount: 300, type: "Payment", transfer: true, category: "Card Payment" });
    expect(by("AMAZON REFUND")).toMatchObject({ amount: 20, type: "Refund", transfer: false });
    expect(by("INTEREST")).toMatchObject({ type: "Interest", category: "Fees & Charges" });
    expect(by("LATE PAYMENT FEE")).toMatchObject({ amount: -12, type: "Fee", transfer: false });
  });

  it("reads the summary box and the totals reconcile the card way round", async () => {
    const r = await pdf("credit-card-oct-2026.pdf");
    expect(r.cardSummary).toMatchObject({ minimumPayment: 25, dueDate: "2026-11-24", creditLimit: 2000, statementBalance: 414.15, availableCredit: 1585.85 });
    expect(r.balanceCheck).toMatchObject({ openingBalance: 450, closingBalance: 414.15, totalsMatch: true });
    expect(r.warnings).toEqual([]);
  });

  it("reads a CSV export where charges are positive and payments negative", () => {
    const r = parseCsv(readFileSync("samples/credit-card-export.csv", "utf8"), "credit-card-export.csv");
    expect(r.accountKind).toBe("card");
    expect(r.transactions.map((t) => t.amount)).toEqual([-9.99, 200, -18.4, -75.1]);
    expect(r.transactions[1].transfer).toBe(true);
  });

  it("keeps exports that already show charges as negative", () => {
    const r = parseCsv("Date,Description,Amount\n2026-10-01,SHOP,-10.00\n2026-10-02,SHOP TWO,-5.00\n2026-10-03,PAYMENT THANK YOU,15.00", "x.csv", { accountKind: "card" });
    expect(r.transactions.map((t) => t.amount)).toEqual([-10, -5, 15]);
  });

  it("treats a Type column by card meaning: a payment is money in", () => {
    const r = parseCsv("Date,Type,Description,Amount\n2026-10-01,Sale,SHOP,10.00\n2026-10-02,Payment,AUTOPAY,10.00", "x.csv", { accountKind: "card" });
    expect(r.transactions.map((t) => t.amount)).toEqual([-10, 10]);
  });

  it("uses the running balance when amounts have no signs at all", () => {
    const r = parseCsv("Date,Description,Amount,Balance\n2026-10-01,Previous balance,,100.00\n2026-10-02,SHOP,30.00,130.00\n2026-10-03,CASHBACK,10.00,120.00", "x.csv", { accountKind: "card" });
    expect(r.transactions.map((t) => t.amount)).toEqual([-30, 10]);
    expect(r.balanceCheck.mismatches).toBe(0);
  });

  it("parses US-style summary dates", () => {
    expect(parseCardSummary("Payment Due Date: Nov 24, 2026\nMinimum Payment Due: $35.00", "MDY")).toMatchObject({ dueDate: "2026-11-24", minimumPayment: 35 });
  });

  it("leaves bank statements alone", () => {
    const r = parseCsv(readFileSync("samples/us-signed-amount.csv", "utf8"), "us.csv");
    expect(r.accountKind).toBe("bank");
    expect(r.balanceCheck.mismatches).toBe(0);
  });

  describe("foreign-currency layout", () => {
    it("reads staggered headers, uses the home currency and keeps every description", async () => {
      const r = await pdf("credit-card-foreign.pdf");
      expect(r.columns.map((c) => c.role).filter((x) => x !== "ignore")).toEqual(["date", "description", "foreign", "amount"]);
      expect(r.transactions.map((t) => [t.description, t.amount]).sort(([a], [b]) => String(a).localeCompare(String(b)))).toEqual([
        ["SHOP ONE, SINGAPORE", -1849.9],
        ["KFC, KARACHI", -951],
        ["LONGER FUEL STATION NAME, KARACHI", -5300],
        ["Foreign Transaction Fee", -74],
        ["FED on Foreign Transaction Fee", -11.1],
        ["Advance Tax on Foreign Transaction", -9.25],
        ["Payment Received", 2000],
        ["SHOP TWO, SINGAPORE", 0],
      ].sort(([a], [b]) => String(a).localeCompare(String(b))));
    });
    it("treats taxes and fees as fees, and a payment as a transfer", async () => {
      const r = await pdf("credit-card-foreign.pdf");
      const by = (s: string) => r.transactions.find((t) => t.description.startsWith(s))!;
      expect(by("Advance Tax")).toMatchObject({ type: "Fee", category: "Fees & Charges" });
      expect(by("FED")).toMatchObject({ type: "Fee" });
      expect(by("Payment")).toMatchObject({ transfer: true });
    });
    it("flags unposted rows instead of reading the foreign figure as home currency", async () => {
      const r = await pdf("credit-card-foreign.pdf");
      const t = r.transactions.find((x) => x.description.startsWith("SHOP TWO"))!;
      expect(t).toMatchObject({ amount: 0, pendingForeign: "SGD 200.00" });
      expect(t.flags.join()).toMatch(/Not posted yet/);
    });
    it("pairs summary values stacked under their labels, by column", async () => {
      const r = await pdf("credit-card-foreign.pdf");
      expect(r.cardSummary).toMatchObject({ creditLimit: 500000, availableCredit: 488000, statementBalance: 12000 });
      expect(r.balanceCheck).toMatchObject({ openingBalance: 5805.75, closingBalance: 12000 });
      expect(r.balanceCheck.totalsMatch).toBe(false); // the unposted row is the difference
    });
    it("doesn't flag posting-order dates as out of sequence", async () => {
      const r = await pdf("credit-card-foreign.pdf");
      expect(r.transactions.flatMap((t) => t.flags).join()).not.toMatch(/out of sequence/);
    });
  });
});
