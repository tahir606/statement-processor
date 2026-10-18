// Generates fake bank statements in samples/ for testing the parsers. No real data.
import { mkdirSync, writeFileSync } from "node:fs";

// Helvetica advance widths (per 1000 em) for characters we right-align.
const W = { ".": 278, ",": 278, "-": 333, " ": 278 };
const textWidth = (s, size) => [...s].reduce((w, ch) => w + (W[ch] ?? 556), 0) * size / 1000;
const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);

/** pages: array of arrays of { x, y, text, size?, align?: "right", bold? } with y from top. */
function buildPdf(pages) {
  const H = 842;
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pagesId = objs.length + 1 + pages.length * 2;
  const kids = [];
  for (const items of pages) {
    const ops = items.map(({ x, y, text, size = 9, align, bold: b }) => {
      const px = align === "right" ? x - textWidth(text, size) : x;
      return `BT /${b ? "F2" : "F1"} ${size} Tf ${px.toFixed(2)} ${(H - y).toFixed(2)} Td (${esc(text)}) Tj ET`;
    }).join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 ${H}] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const money = (n) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- Sample 1: UK style, split Paid out / Paid in, yearless dates printed once per day, 2 pages.
function exampleBank() {
  const txns = [
    ["02 Sep", "Card payment TESCO STORES 3021", 45.2, 0],
    ["", "Contactless COSTA COFFEE", 3.85, 0],
    ["05 Sep", "Faster payment received from", 0, 250],
    ["", "J SMITH REF RENT SHARE SEPT", null, null],
    ["08 Sep", "Direct debit VODAFONE LTD", 32.0, 0],
    ["12 Sep", "Card payment AMAZON MARKETPLACE", 89.99, 0],
    ["15 Sep", "ACME LTD SALARY", 0, 2850.0],
    ["18 Sep", "ATM cash withdrawal HIGH ST", 100.0, 0],
    ["20 Sep", "Standing order LANDLORD RENT", 1200.0, 0],
    ["22 Sep", "Card payment UBER *TRIP", 14.6, 0],
    ["25 Sep", "Direct debit NETFLIX.COM", 10.99, 0],
    ["", "Card payment SAINSBURYS", 62.4, 0],
    ["28 Sep", "Interest paid", 0, 1.23],
    ["30 Sep", "Monthly account fee", 3.0, 0],
  ];
  const header = (y) => [
    { x: 40, y, text: "Date", bold: true },
    { x: 95, y, text: "Description", bold: true },
    { x: 400, y, text: "Paid out", bold: true, align: "right" },
    { x: 475, y, text: "Paid in", bold: true, align: "right" },
    { x: 555, y, text: "Balance", bold: true, align: "right" },
  ];
  const pages = [[], []];
  let balance = 1523.45;
  pages[0].push(
    { x: 40, y: 50, text: "Example Bank PLC", size: 16, bold: true },
    { x: 40, y: 72, text: "Current Account statement  01 Sep 2026 to 30 Sep 2026" },
    { x: 40, y: 86, text: "Sort code 12-34-56   Account 87654321" },
    ...header(130),
    { x: 95, y: 148, text: "Balance brought forward" },
    { x: 555, y: 148, text: money(balance), align: "right" },
  );
  let page = 0;
  let y = 164;
  for (const [i, [date, desc, out, inn]] of txns.entries()) {
    if (i === 8) {
      pages[0].push({ x: 260, y: 800, text: "Page 1 of 2" });
      page = 1;
      pages[1].push({ x: 40, y: 50, text: "Example Bank PLC", size: 12, bold: true }, ...header(90));
      y = 110;
    }
    const p = pages[page];
    if (date) p.push({ x: 40, y, text: date });
    p.push({ x: 95, y, text: desc });
    if (out != null) {
      balance = Math.round((balance - out + inn) * 100) / 100;
      if (out) p.push({ x: 400, y, text: money(out), align: "right" });
      if (inn) p.push({ x: 475, y, text: money(inn), align: "right" });
      const nextIsWrap = txns[i + 1] && txns[i + 1][2] === null;
      if (!nextIsWrap) p.push({ x: 555, y, text: money(balance), align: "right" });
    } else {
      // Wrapped line: the balance goes on the last line of the transaction.
      p.push({ x: 555, y, text: money(balance), align: "right" });
    }
    y += 14;
  }
  pages[1].push({ x: 95, y, text: "Balance carried forward" }, { x: 555, y, text: money(balance), align: "right" });
  pages[1].push({ x: 260, y: 800, text: "Page 2 of 2" });
  return buildPdf(pages);
}

// ---- Sample 2: single signed Amount column, dd/mm/yyyy, newest first.
function newestFirst() {
  const rows = [
    ["03/10/2026", "POS PURCHASE IMTIAZ SUPER MARKET", -5400.0],
    ["01/10/2026", "SALARY CREDIT GLOBEX PVT LTD", 185000.0],
    ["28/09/2026", "IBFT TRANSFER TO A KHAN", -20000.0],
    ["25/09/2026", "K-ELECTRIC BILL PAYMENT", -8750.5],
    ["21/09/2026", "ATM WITHDRAWAL", -10000.0],
    ["16/09/2026", "FOODPANDA ORDER", -1890.0],
  ];
  let bal = 64210.75;
  const withBal = [...rows].reverse().map((r) => { bal = Math.round((bal + r[2]) * 100) / 100; return [...r, bal]; }).reverse();
  const items = [
    { x: 40, y: 50, text: "Globe Savings Bank", size: 16, bold: true },
    { x: 40, y: 72, text: "Account Statement for the period 15/09/2026 - 04/10/2026" },
    { x: 40, y: 86, text: "Opening Balance PKR 64,210.75" },
    { x: 40, y: 120, text: "Txn Date", bold: true },
    { x: 110, y: 120, text: "Narration / Details", bold: true },
    { x: 470, y: 120, text: "Amount", bold: true, align: "right" },
    { x: 555, y: 120, text: "Balance", bold: true, align: "right" },
  ];
  withBal.forEach(([d, desc, amt, b], i) => {
    const y = 138 + i * 14;
    items.push(
      { x: 40, y, text: d },
      { x: 110, y, text: desc },
      { x: 470, y, text: amt < 0 ? `-${money(-amt)}` : money(amt), align: "right" },
      { x: 555, y, text: money(b), align: "right" },
    );
  });
  return buildPdf([items]);
}

mkdirSync("samples", { recursive: true });
writeFileSync("samples/example-bank-sep-2026.pdf", exampleBank());
writeFileSync("samples/globe-savings-newest-first.pdf", newestFirst());

writeFileSync(
  "samples/preamble-debit-credit.csv",
  [
    "Account Name:,Mr T Example",
    "Account Number:,****4321",
    "Statement Period:,01/09/2026 - 30/09/2026",
    "",
    "Transaction Date,Transaction Type,Description,Debit Amount,Credit Amount,Balance",
    "01/09/2026,BGC,ACME LTD SALARY,,2850.00,4373.45",
    "03/09/2026,DEB,TESCO STORES 3021,45.20,,4328.25",
    "14/09/2026,DD,\"VIRGIN MEDIA, BROADBAND\",38.00,,4290.25",
    "21/09/2026,FPO,TRANSFER TO SAVINGS,500.00,,3790.25",
  ].join("\n"),
);
writeFileSync(
  "samples/us-signed-amount.csv",
  [
    "Posted Date,Payee,Amount,Running Bal.",
    "09/02/2026,STARBUCKS #1234,-6.45,1993.55",
    "09/15/2026,PAYROLL DEPOSIT,3200.00,5193.55",
    "09/18/2026,SHELL OIL 5544,-48.10,5145.45",
    "09/30/2026,ZELLE TO JOHN,-150.00,4995.45",
  ].join("\n"),
);
writeFileSync(
  "samples/headerless.csv",
  ["2026-09-01,Coffee shop,-3.50", "2026-09-02,Refund from store,12.00", "2026-09-04,Groceries,-54.75"].join("\n"),
);
console.log("Wrote samples/");
