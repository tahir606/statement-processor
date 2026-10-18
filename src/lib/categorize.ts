/**
 * Rule-based categories. First matching rule wins; edit freely.
 * Patterns are tested against the transaction description.
 */
export const CATEGORY_RULES: [string, RegExp][] = [
  ["Salary", /\b(salary|payroll|wages)\b/i],
  ["Transfers", /\b(transfer|trf|tfr|faster payment|fps|standing order|s\/o|neft|imps|ibft|zelle|venmo)\b/i],
  ["Groceries", /\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-?op|walmart|kroger|costco|carrefour|whole foods|imtiaz|metro)\b/i],
  ["Eating Out", /\b(restaurant|cafe|coffee|starbucks|costa|pret|mcdonald|kfc|domino|pizza|uber ?eats|deliveroo|just ?eat|foodpanda|doordash)\b/i],
  ["Transport", /\b(uber|lyft|careem|bolt|tfl|train|rail|fuel|petrol|shell|bp|esso|parking|airline|airways)\b/i],
  ["Bills & Utilities", /\b(electric|energy|gas|water|council tax|broadband|internet|mobile|vodafone|ee|o2|three|verizon|at&t|bt|virgin media|ptcl|jazz|zong)\b/i],
  ["Subscriptions", /\b(netflix|spotify|apple\.com|itunes|amazon prime|disney|youtube|google|microsoft|adobe|subscription)\b/i],
  ["Shopping", /\b(amazon|ebay|argos|ikea|daraz|primark|zara|h&m|next plc|john lewis)\b/i],
  ["Cash", /\b(atm|cash withdrawal|cashpoint|cash)\b/i],
  ["Fees & Charges", /\b(fee|charge|interest charged|overdraft|commission|excise|tax deducted|wht)\b/i],
  ["Interest", /\b(interest|profit paid)\b/i],
  ["Rent & Mortgage", /\b(rent|mortgage|landlord)\b/i],
];

export function categorize(description: string, amount: number): string {
  for (const [category, re] of CATEGORY_RULES) {
    if (re.test(description)) return category;
  }
  return amount > 0 ? "Other Income" : "Uncategorised";
}
