# Contributing

Thanks for helping! The most useful contributions are support for more banks and fixes for statements that don't parse correctly.

## Never share real statements

Bank statements contain personal and financial data. **Don't attach real statements, screenshots or exports to issues or pull requests**, even partially redacted ones.

To report a statement that doesn't parse, describe its layout instead:

- the column headers, exactly as printed
- the date and amount formats (e.g. `05 Oct`, `1.234,56`, `12.00 DR`)
- whether it's a CSV, a downloaded PDF or a scan
- what went wrong (missing rows, wrong signs, wrong dates…)

Even better, add a **fake** sample with the same layout to [`scripts/make-sample-pdfs.mjs`](scripts/make-sample-pdfs.mjs), plus a failing test.

## Development

```bash
npm install
npm run dev     # app at http://localhost:3000
npm test        # parser tests
npm run lint
```

## Adding a bank

1. First, check whether auto-detection already handles it. Most layouts need no changes.
2. If not, add a profile to [`src/lib/profiles.ts`](src/lib/profiles.ts) with only the overrides that bank needs.
3. Add a fake sample with that layout to `scripts/make-sample-pdfs.mjs` and run `npm run samples`.
4. Add a test in `tests/` that parses the sample and checks the balance check passes (`balanceCheck.mismatches === 0`).

## Pull requests

- Keep changes focused, and make sure `npm test`, `npm run lint` and `npm run build` pass. CI runs all three.
- Parsing must stay in the browser: no server uploads, analytics or third-party calls that touch statement data.
