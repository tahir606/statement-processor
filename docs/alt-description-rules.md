# Alt Description Rules

Alt Description rules let you label transactions in your own words. When a transaction's description contains a word or matches a pattern you set, your label appears in an extra **Alt Description** column.

Banks describe the same spending in different ways. One prints `Card payment TESCO STORES 3021`, another `POS PURCHASE TESCO EXPRESS`. A rule for `tesco` gives both the same label, such as `Food - Supermarket`, so you can group and total them in a spreadsheet.

The column is for your own internal analysis:

- It never changes the original Description, Type, amounts or balances.
- It updates the moment you edit a rule. You never need to re-upload a statement.
- It is included in both the Excel and CSV exports.

## Quick start

You can set up rules before uploading any statement. They apply to every statement you load afterwards.

1. Start the app (`npm run dev`) and open http://localhost:3000.
2. Click **Alt description rules**, just below the drop zone, to open the panel.
3. Click **+ Add rule**.
4. In **Word or pattern**, type a word from the description, e.g. `tesco`.
5. In **Alt description**, type your label, e.g. `Food - Supermarket`.
6. Drop in a statement. Matching rows show your label in the **Alt Description** column, and each rule shows how many transactions it matched.

There is no Save button. Every change is saved automatically (see [Where rules are saved](#where-rules-are-saved)).

## How matching works

Each transaction gets the label of the **first** rule, from the top, that matches its description. Rules check the Description column only, and matching always ignores upper and lower case.

| Rule type | Regex box | Matches when… | Example pattern | Matches | Doesn't match |
| --- | --- | --- | --- | --- | --- |
| Word | Unticked | the text appears anywhere in the description | `tesco` | `Card payment TESCO STORES` | `TSC Ltd` |
| Regular expression | Ticked | the pattern matches | `^ATM\b` | `ATM cash withdrawal` | `Cash at ATM` (not at the start) |

When working out a label, the app:

1. Checks the rules from the top of the list down.
2. Stops at the first match and uses that rule's label. Later rules are ignored, even if they also match.
3. Leaves the Alt Description blank if no rule matches.

**Order matters when rules overlap.** Put specific rules above general ones: `tesco` above `^card payment` makes Tesco card payments `Food - Supermarket` and every other card payment `Card spend`. Use the **↑** and **↓** buttons to reorder rules.

A rule with an invalid regular expression shows a red error under it and is skipped until you fix it. It never stops the other rules from working.

## Example rules

| Word or pattern | Regex | Alt description | What it catches |
| --- | --- | --- | --- |
| `tesco` | | Food - Supermarket | Any description containing "tesco" |
| `sainsbury\|asda\|lidl\|aldi` | ✓ | Food - Supermarket | Several supermarkets in one rule |
| `landlord` | | Housing - Rent | Rent standing orders |
| `^ATM\b` | ✓ | Cash | Descriptions that start with "ATM" |
| `netflix\|spotify\|disney` | ✓ | Subscriptions | Streaming services |
| `salary\|payroll` | ✓ | Income - Salary | Wages from any employer |
| `^(card payment\|contactless)` | ✓ | Card spend | A catch-all; keep it below the specific rules |

## Covering every transaction

- **Matches:** each rule shows how many transactions it matched. A rule with 0 matches may be misspelled, or a rule above it may be catching those transactions first.
- **Missing alt:** tick this above the table to show only transactions with no Alt Description yet.
- **+ rule:** click this in an empty Alt Description cell to add a rule pre-filled with that transaction's description. Shorten it to the part that identifies the merchant (e.g. `Card payment UBER *TRIP` → `uber`) and add your label.
- **Search:** the search box also searches Alt Descriptions, e.g. type `Food` to see every food transaction.

## Where rules are saved

Rules are saved permanently to `data/alt-rules.json` in the project folder, on the computer running the app. The panel shows the exact location.

- **Survives:** clearing browser data, private windows, switching browsers and restarting the app.
- **Private:** `data/` is in `.gitignore`, so your rules are never committed or pushed to the repository.
- **Different location:** to keep rules somewhere else, such as an iCloud or Dropbox folder for backup or sharing between computers, start the app with `ALT_RULES_FILE`:

  ```bash
  ALT_RULES_FILE=~/Documents/alt-rules.json npm run dev
  ```

- **Static deploys:** if the app runs without its server (a static export), rules are saved in the browser instead, and the panel shows a warning. Use Export JSON to keep a backup in that case.

## Backing up and sharing rules

- **Export JSON** downloads all your rules as `alt-description-rules.json`.
- **Import JSON** loads rules from a file. It adds them to your existing rules and skips exact duplicates, so it never deletes anything.

The file format is plain JSON, so you can also write or edit it by hand:

```json
{
  "version": 1,
  "rules": [
    { "pattern": "tesco", "regex": false, "alt": "Food - Supermarket" },
    { "pattern": "^ATM\\b", "regex": true, "alt": "Cash" }
  ]
}
```

In JSON, a backslash in a regex is written twice (`\\b` for `\b`).

## Using the results

Excel and CSV exports include the column in this position:

`Date, Type, Description, Alt Description, Credit, Debit, Balance`

For analysis, open the Excel export and insert a pivot table with **Alt Description** as rows and **Debit** (or **Credit**) as values. That gives you a total per label across all the statements you loaded.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| A rule doesn't match | Check the spelling against the Description column. Word rules match text inside the description, so `tesco` matches but `tesco stores ltd` won't if the bank prints `TESCO STORES 3021`. |
| The wrong label appears | A rule higher up matches first. Move the rule you want above it with **↑**. |
| Red "Invalid regex" error | Fix the pattern, or untick **Regex** to match it as plain text. Common causes: an unclosed `(` or `[`. |
| "Browser-only storage" warning | The app's server isn't reachable, so rules are kept in the browser only. Run the app with `npm run dev` or `npm start`, or export a JSON backup. |
| Rules are missing on another computer | Rules live in a file on each computer. Export JSON on one and import it on the other, or point both at a shared folder with `ALT_RULES_FILE`. |
