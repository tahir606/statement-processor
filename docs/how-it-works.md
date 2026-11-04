# How statement reading works

Statement Processor reads statements with layout rules and pattern matching, not an LLM. It turns each file into a list of positioned text, rebuilds the table from where things sit on the page, then checks the result against the statement's own balances. Everything runs in the browser, so files are never uploaded.

## The tech

| Job | Library | What it does |
|---|---|---|
| Read CSV | [`papaparse`](https://www.papaparse.com/) | Splits the file into rows and cells, and works out whether it uses commas, semicolons or tabs |
| Read PDF text | [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) (Mozilla's PDF.js) | Gives every piece of text in the PDF together with its x/y position on the page |
| Read scanned PDFs | [`tesseract.js`](https://tesseract.projectnaptha.com/) | A classic OCR engine, compiled to run in the browser |
| Export | [`exceljs`](https://github.com/exceljs/exceljs) | Writes the `.xlsx` file with real dates |
| App | Next.js + React | The screens; all the processing runs in the browser |

## The pipeline

```
CSV ──► papaparse ──► rows ─────────────────┐
PDF ──► PDF.js text layer ──► positioned words ──► layout engine ──► rows ──► finalize ──► app ──► table / overview / export
scan ─► render + clean image ─► Tesseract ─┘
```

## CSV ([csv.ts](../src/lib/csv.ts))

1. **Find the header row.** Banks often put account details above the table, so the first 30 rows are checked. A row counts as the header if its cells match keyword patterns such as `date|posted|txn date`, `debit|paid out|withdrawal` or `balance` ([columns.ts](../src/lib/columns.ts)). It needs at least a date column and an amount column.
2. **No header?** The columns are guessed from their contents: a column that's mostly dates is the date, columns of numbers with decimals are amounts or balance, and the longest text column is the description.
3. **Work out the money direction.** One of three set-ups:
    - separate Debit and Credit columns
    - one signed Amount column
    - an amount plus a Type column, such as `DR`/`CR` or `Sale`/`Payment`
4. **Parse each value** ([normalize.ts](../src/lib/normalize.ts)):
    - **Amounts:** handles `1,234.56`, `1.234,56`, `(12.00)`, `12.00-`, `12.00 DR`, and currency codes like `PKR`.
    - **Dates:** handles `05/10/26`, `05 Oct 2026`, `Oct 5, 2026` and ISO dates. Day-first or month-first is decided from the data: any value above 12 settles it.

## PDF with a text layer ([layout.ts](../src/lib/pdf/layout.ts))

A PDF has no table inside it, just text drawn at coordinates. The parser rebuilds the table:

1. **Lines:** words at roughly the same height become one line.
2. **Cells:** words close together on a line become one cell, such as `KFC, KARACHI`.
3. **Header:** the parser finds the line that looks like a header. Headers that span several staggered lines, such as "Transaction Amount / (PKR)", are folded into one first.
4. **Columns:** each header word gets a region of the page. A Description column takes the whole gap around it, because that header is often centred over left-aligned text. A column headed "Foreign Currency" or "Original Amount" is kept separate from the account's own currency.
5. **Assign cells:** each cell goes to the column it overlaps most. This is how 5,300.00 lands under Debit rather than Balance.
6. **Assemble rows:**
    - A line with a date starts a new transaction.
    - On bank statements, a line with an amount but no date reuses the previous row's date, because some banks print the date once per day.
    - Text-only lines are wrapped descriptions. They attach to whichever row is closer, which handles statements that print the merchant just above the date line.
7. **Read the summary box:** the opening and closing balance, and for cards the minimum payment, due date and limit. Where a value is printed under its label, they're paired by column.
8. **Fallback:** if no header is found, a simpler reader takes lines that start with a date and end in amounts.

## Scanned PDFs ([ocr.ts](../src/lib/pdf/ocr.ts))

A page with almost no text is treated as an image:

1. It's rendered at about 300 DPI.
2. It's converted to grayscale, then to pure black and white. A method called Otsu's threshold picks the cut-off automatically, which removes coloured or shaded backgrounds.
3. Tesseract straightens tilted scans and returns each word with its box and a confidence score.
4. Those words go through the same layout engine as above. Rows containing low-confidence words are flagged for review.

## Working out what each row means ([finalize.ts](../src/lib/finalize.ts), [card.ts](../src/lib/card.ts))

- **Bank or card:** it's a card if the text has at least two card phrases ("minimum payment", "credit limit", "due date"…) or the file name says so. One phrase alone isn't enough, because bank statements contain "credit card payment". This can be overridden per file in the app.
- **Signs:** card statements show charges as positive, so they're flipped to match the bank convention, where money out is negative. A `CR` marker or the running balance settles any unclear rows.
- **Order:** newest-first statements are detected and reversed.
- **Type:** taken from the statement's own codes (`DD` becomes Direct Debit) or from keywords ("ATM" means Cash Withdrawal). Card fees, interest and taxes on foreign transactions are typed as Fee.
- **Category, merchant and alt description:** keyword rules group rows ([categorize.ts](../src/lib/categorize.ts)); descriptions are cleaned up so `Card payment TESCO STORES 3021` becomes "Tesco Stores" ([analytics.ts](../src/lib/analytics.ts)); and the user's own word rules supply the alt description ([alt-description-rules.md](alt-description-rules.md)).
- **Card payments:** these are marked as transfers. A bank debit is matched to a card payment of the same amount within 7 days, so nothing is counted twice.
- **Unposted foreign rows:** when the home-currency column just repeats a foreign figure (for example `SGD 3.16` next to `3.16`), the row hasn't been converted yet. It's flagged and left out of totals.

## Checking its own work ([reconcile.ts](../src/lib/reconcile.ts))

Because none of this is guaranteed, every file is checked:

- **Running balance:** previous balance ± amount must equal the printed balance on every row. This catches nearly every misread digit.
- **Totals:** opening balance plus all transactions must equal the closing balance. When it doesn't, the app shows the difference rather than hiding it.
- **Other flags:**
    - dates out of order (not checked on card statements, which list by posting date)
    - low OCR confidence
    - possible duplicates across files

## Limits

These are rules, so an unfamiliar layout can still confuse them. The fix for a new layout is a per-bank profile in [profiles.ts](../src/lib/profiles.ts), a fake sample PDF that copies the layout ([make-sample-pdfs.mjs](../scripts/make-sample-pdfs.mjs)), and a test. The balance checks are the safety net: when the parser gets something wrong, it usually shows up as a mismatch rather than as silently wrong numbers. See [CONTRIBUTING.md](../CONTRIBUTING.md) for adding a bank.
