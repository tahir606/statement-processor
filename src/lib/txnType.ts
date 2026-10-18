/** Short codes banks print in their Type column, expanded so every bank reads the same. */
const TYPE_CODES: Record<string, string> = {
  BGC: "Bank Credit",
  BP: "Bill Payment",
  CHQ: "Cheque",
  CPT: "Cash Withdrawal",
  CR: "Credit",
  DD: "Direct Debit",
  DDR: "Direct Debit",
  DEB: "Card Payment",
  DEP: "Deposit",
  DR: "Debit",
  FPI: "Faster Payment In",
  FPO: "Faster Payment Out",
  ATM: "Cash Withdrawal",
  POS: "Card Payment",
  SO: "Standing Order",
  STO: "Standing Order",
  TFR: "Transfer",
  TRF: "Transfer",
  INT: "Interest",
  FEE: "Fee",
  CHG: "Fee",
};

/** Used when the statement has no Type column. First match against the description wins. */
const TYPE_RULES: [string, RegExp][] = [
  ["Direct Debit", /\b(direct debit|d\/d)\b/i],
  ["Standing Order", /\b(standing order|s\/o)\b/i],
  ["Cash Withdrawal", /\b(atm|cash withdrawal|cashpoint)\b/i],
  ["Card Payment", /\b(card payment|contactless|pos|purchase|visa|mastercard|debit card)\b/i],
  ["Faster Payment", /\b(faster payment|fps)\b/i],
  ["Transfer", /\b(transfer|trf|tfr|ibft|neft|imps|rtgs|zelle|wire)\b/i],
  ["Bill Payment", /\b(bill payment|bill pay)\b/i],
  ["Salary", /\b(salary|payroll|wages)\b/i],
  ["Cheque", /\b(cheque|check|chq)\b/i],
  ["Interest", /\b(interest|profit paid)\b/i],
  ["Fee", /\b(fee|charge|commission)\b/i],
  ["Refund", /\b(refund|reversal)\b/i],
  ["Deposit", /\b(deposit)\b/i],
];

export function normalizeType(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return TYPE_CODES[s.toUpperCase().replace(/[^A-Z]/g, "")] ?? s;
}

export function inferType(description: string, amount: number): string {
  for (const [type, re] of TYPE_RULES) if (re.test(description)) return type;
  return amount >= 0 ? "Credit" : "Debit";
}
