import { describe, expect, it } from "vitest";
import { balanceSeries, cardOverview, linkCardPayments, merchantName, periods, spendByCategory, spendByMerchant, summarize } from "@/lib/analytics";
import type { ParseResult, Transaction } from "@/lib/types";

let n = 0;
const t = (over: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, date: "2026-10-01", type: "", description: "X", altDescription: "", amount: 0, balance: null,
  category: "Other", accountKind: "bank", transfer: false, sourceFile: "bank.csv", flags: [], ...over,
});

describe("analytics", () => {
  const salary = t({ amount: 3000, description: "SALARY" });
  const rent = t({ amount: -1000, description: "RENT", category: "Rent" });
  const bankToCard = t({ amount: -300, description: "ONLINE TRANSFER", date: "2026-10-03" });
  const cardShop = t({ amount: -200, accountKind: "card", sourceFile: "card.pdf", description: "SHOP", category: "Shopping" });
  const cardRefund = t({ amount: 50, accountKind: "card", sourceFile: "card.pdf", description: "SHOP REFUND", category: "Shopping" });
  const cardPayment = t({ amount: 300, accountKind: "card", sourceFile: "card.pdf", description: "PAYMENT THANK YOU", transfer: true, date: "2026-10-05" });
  const interest = t({ amount: -10, accountKind: "card", sourceFile: "card.pdf", description: "INTEREST", type: "Interest", category: "Fees & Charges" });
  const all = linkCardPayments([salary, rent, bankToCard, cardShop, cardRefund, cardPayment, interest]);

  it("counts a card payment once: not as bank spending, not as card income", () => {
    expect(all.find((x) => x.id === bankToCard.id)!.transfer).toBe(true);
    const s = summarize(all);
    expect(s.income).toBe(3000);
    expect(s.spending).toBe(1000 + 200 - 50 + 10);
    expect(s.net).toBe(3000 - 1160);
    expect(s.cardPaymentsExcluded).toBe(300);
    expect(s.interestAndFees).toBe(10);
    expect(Math.round(s.savingsRate!)).toBe(61);
    expect(s.largest?.description).toBe("RENT");
  });

  it("doesn't link a payment to a same-amount debit far away in time, or link one debit twice", () => {
    const old = t({ amount: -300, date: "2026-08-01" });
    expect(linkCardPayments([old, cardPayment]).find((x) => x.id === old.id)!.transfer).toBe(false);
    const linked = linkCardPayments([t({ amount: -300, date: "2026-10-04" }), t({ amount: -300, date: "2026-10-04" }), cardPayment]);
    expect(linked.filter((x) => x.transfer && x.accountKind === "bank")).toHaveLength(1);
  });

  it("nets refunds against their category", () => {
    expect(spendByCategory(all).find((g) => g.label === "Shopping")!.value).toBe(150);
  });

  it("groups merchant spellings", () => {
    expect(merchantName("Card payment TESCO STORES 3021")).toBe("Tesco Stores");
    expect(merchantName("Contactless COSTA COFFEE")).toBe("Costa Coffee");
    expect(merchantName("Direct debit NETFLIX.COM")).toBe("Netflix");
    const g = spendByMerchant([t({ amount: -5, description: "Card payment TESCO STORES 3021" }), t({ amount: -7, description: "TESCO STORES 9" })]);
    expect(g).toEqual([{ label: "Tesco Stores", value: 12 }]);
    expect(spendByMerchant([interest]).length).toBe(0);
  });

  it("uses weeks for short ranges and months for long ones", () => {
    const short = periods([t({ amount: -5, date: "2026-10-05" }), t({ amount: -5, date: "2026-10-07" }), t({ amount: 9, date: "2026-10-13" })]);
    expect(short.unit).toBe("week");
    expect(short.rows.map((r) => [r.label, r.spending, r.income])).toEqual([["5 Oct", 10, 0], ["12 Oct", 0, 9]]);
    const long = periods(["2026-08-02", "2026-09-02", "2026-10-02"].map((date) => t({ amount: -1, date })));
    expect(long.rows.map((r) => r.label)).toEqual(["Aug 26", "Sep 26", "Oct 26"]);
  });

  it("charts bank balances only", () => {
    const s = balanceSeries([
      t({ date: "2026-10-01", balance: 10 }), t({ date: "2026-10-01", balance: 12 }), t({ date: "2026-10-02", balance: 8 }),
      t({ date: "2026-10-01", balance: 99, accountKind: "card", sourceFile: "c" }), t({ date: "2026-10-02", balance: 90, accountKind: "card", sourceFile: "c" }),
    ]);
    expect(s).toEqual([{ name: "bank.csv", points: [{ date: "2026-10-01", balance: 12 }, { date: "2026-10-02", balance: 8 }] }]);
  });

  it("summarises one card in plain figures", () => {
    const result = { fileName: "card.pdf", bank: "B", cardSummary: { statementBalance: 500, creditLimit: 2000 }, balanceCheck: { openingBalance: 640, closingBalance: 500, totalsMatch: true } } as unknown as ParseResult;
    expect(cardOverview(result, all)).toMatchObject({ owed: 500, purchases: 200, paymentsMade: 300, refunds: 50, interestAndFees: 10, utilization: 25, totalsMatch: true });
  });
});
