# Statement Processor

Turn bank statements (PDF or CSV, from any bank) into one clean transaction table, without uploading them anywhere and without an AI model.

Everything runs in your browser. Statements are parsed with layout analysis and classic OCR (Tesseract), not an LLM. Each row is then checked against the statement's running balance, so misreads are caught instead of passing through silently.

**Output:** `Date, Type, Description, Debit, Credit, Balance`, with dates as `DD-Mmm-YY` (e.g. `05-Oct-26`). Export to Excel or CSV.

## Features

- **Many banks, one format.** Auto-detects column layouts, date formats (day/month vs month/day, with or without a year) and number formats (`1,234.56`, `1.234,56`, `(12.00)`, `12.00 DR`).
- **CSV, text PDF and scanned PDF.** Downloaded PDFs are read from their text layer. Scanned pages are deskewed, cleaned up and OCR'd.
- **Built-in checking.** Every row is checked against the running balance (`previous balance + amount = balance`). It also flags dates out of sequence, low OCR confidence, and the same transaction appearing in two files.
- **Private by design.** No server and no uploads. Files never leave your machine.
- **Easy to extend.** Add a bank with a small profile, and edit transaction types and categories as plain rules.

## Getting started

Requires Node.js 20 or later.

```bash
git clone https://github.com/tahir606/statement-processor.git
cd statement-processor
npm install
npm run dev
```

Open http://localhost:3000 and drop in your statements. To try it without real data, use the fake statements in [`samples/`](samples).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the app in development mode |
| `npm run build && npm start` | Production build |
| `npm test` | Run the parser tests against `samples/` |
| `npm run lint` | Lint |
| `npm run samples` | Regenerate the fake sample statements |

## How it works

| Input | Pipeline |
| --- | --- |
| **CSV** | `papaparse` → find the header row (skipping account-info lines above it) → map columns by header keywords → parse dates and amounts |
| **Text PDF** (downloaded from online banking) | `pdfjs-dist` reads each text item with its x/y position → items grouped into lines and cells → table header found → each cell assigned to a column by horizontal overlap |
| **Scanned PDF** (page has no text layer) | Page rendered at ~300 DPI → grayscale + Otsu binarisation → `tesseract.js` OCR (deskewed) gives word boxes → same layout engine as text PDFs |

Then, for every file:

- **Balance check:** each row must satisfy `previous balance + amount = balance`, and mismatches are highlighted. This catches almost every misread digit.
- **Sign recovery:** when a statement has one amount column with no signs, whether money went in or out is worked out from how the balance moved.
- **Order detection:** newest-first statements are reversed.
- **Type:** taken from the statement's own Type column, with codes like `DD` and `BGC` expanded to readable names. Without one, it's inferred from the description (see [`txnType.ts`](src/lib/txnType.ts)).

## Adding a bank

Most layouts are auto-detected. When one isn't, add a profile in [`src/lib/profiles.ts`](src/lib/profiles.ts):

```ts
{
  id: "my-bank",
  name: "My Bank",
  detect: [/my bank plc/i],                  // text found only on this bank's statements
  dateOrder: "DMY",                          // if the statement can't settle day/month order
  headerOverrides: { "withdrawals (pkr)": "debit" },
  positiveIsDebit: true,                     // credit-card style: positive = spending
  skipLines: [/^important information/i],
}
```

CSV columns can also be remapped in the UI ("Column mapping"). Please contribute profiles for your bank; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Project layout

| Path | Purpose |
| --- | --- |
| `src/lib/csv.ts` | CSV parser |
| `src/lib/pdf/textLayer.ts` | PDF text with positions |
| `src/lib/pdf/ocr.ts` | Image preprocessing and OCR for scanned pages |
| `src/lib/pdf/layout.ts` | Positioned words → table rows (shared by text and OCR) |
| `src/lib/finalize.ts`, `reconcile.ts` | Ordering, signs, balance check, flags |
| `src/lib/profiles.ts` | Per-bank overrides |
| `src/lib/txnType.ts`, `categorize.ts` | Transaction type and category rules |
| `src/lib/export.ts` | Excel and CSV export |
| `src/components/StatementProcessor.tsx` | UI |
| `tests/` | Vitest tests; `samples/` holds the fake statements they run against |

## Notes and limitations

- **OCR needs a network connection once.** It downloads Tesseract's English model (~10 MB) from a CDN on first use. Text PDFs and CSVs need no network.
- **CSV dates may change when opened.** Spreadsheet apps reformat date text when they open a CSV. Use **Export Excel** to keep the `DD-Mmm-YY` format.
- **Password-protected PDFs aren't supported yet.**
- **Always review flagged rows.** OCR on poor scans can misread characters.

## License

[MIT](LICENSE)
