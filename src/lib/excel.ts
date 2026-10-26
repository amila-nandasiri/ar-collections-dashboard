// Excel support: read uploaded .xlsx workbooks, and write the template and report workbooks.
// Uploaded sheets are converted to CSV text so they go through the same import as CSV files.

import readXlsxFile from "read-excel-file/browser";
import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/browser";
import { BUCKETS, type Analysis } from "./ar";
import { parseCsv, toCsv } from "./csv";
import { TEMPLATES, type UploadedFile } from "./dataset";

const isoDate = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** Each non-empty sheet of a workbook becomes one "file", e.g. "ar.xlsx · Invoices" */
export async function readWorkbook(file: File): Promise<UploadedFile[]> {
  const sheets = await readXlsxFile(file);
  return sheets
    // skip instruction sheets and sheets with headings but no rows
    .filter((s) => !/^(instructions|read ?me|notes?)$/i.test(s.sheet.trim()) && s.data.length > 1)
    .map((s) => ({
      name: sheets.length > 1 ? `${file.name} · ${s.sheet}` : file.name,
      text: toCsv(s.data.map((row) => row.map((v) => (v instanceof Date ? isoDate(v) : v === null ? "" : String(v)))))
    }))
    .filter((f) => f.text.trim() !== "");
}

// ---------------------------------------------------------------------------
// Template workbook
// ---------------------------------------------------------------------------

const header = (v: string): Cell => ({ value: v, fontWeight: "bold", backgroundColor: "#F4F4F5", borderStyle: "thin", borderColor: "#D4D4D8" });

const DATE_COLUMNS = /date/i;
const NUMBER_COLUMNS = /amount|outstanding|limit|days/i;

function templateSheet(csv: string): SheetData {
  const [head, ...rows] = parseCsv(csv);
  return [
    head.map(header),
    ...rows.map((r) =>
      r.map((v, i): Cell => {
        if (DATE_COLUMNS.test(head[i])) return { value: new Date(v + "T00:00:00Z"), type: Date, format: "yyyy-mm-dd" };
        if (NUMBER_COLUMNS.test(head[i]) && v !== "") return { value: Number(v), type: Number, format: /days/i.test(head[i]) ? "0" : "#,##0.00" };
        return v;
      })
    )
  ];
}

const INSTRUCTIONS: string[][] = [
  ["AR Collections Dashboard: data template"],
  [""],
  ["1. Replace the example rows on the Invoices sheet with your own invoices (one row per invoice). This sheet is required."],
  ["2. Optional: fill in Customers for segments, credit limits, risk ratings and account managers."],
  ["3. Optional: fill in Payments for exact collection history (DSO trend and collection effectiveness)."],
  ["4. Save, then upload this workbook on the dashboard with 'Use your data'. Delete a sheet's example rows if you don't use it."],
  [""],
  ["Invoices: required columns"],
  ["customer_id or customer_name", "Who the invoice is for"],
  ["invoice_date", "Date the invoice was raised"],
  ["due_date", "Due date. If you leave it out, it's calculated from payment terms"],
  ["amount", "Invoice total"],
  ["outstanding", "Amount still unpaid (0 for paid invoices). Strongly recommended"],
  [""],
  ["Tips"],
  ["Include paid invoices as well as open ones, ideally 12 months or more. DSO and trend charts need them."],
  ["Use one currency per file. Set the currency code when you upload."],
  ["Your data stays on your computer. The dashboard calculates everything in your browser."]
];

export async function downloadTemplateWorkbook() {
  const widths = (csv: string) => parseCsv(csv)[0].map((h) => ({ width: Math.max(14, h.length + 4) }));
  await writeXlsxFile([
    { sheet: "Instructions", data: INSTRUCTIONS.map((r, i) => r.map((v): Cell => (i === 0 || r.length === 1 && /:|^Tips$/.test(v) ? { value: v, fontWeight: "bold" } : v))), columns: [{ width: 34 }, { width: 70 }] },
    { sheet: "Invoices", data: templateSheet(TEMPLATES.invoices), columns: widths(TEMPLATES.invoices), stickyRowsCount: 1 },
    { sheet: "Customers", data: templateSheet(TEMPLATES.customers), columns: widths(TEMPLATES.customers), stickyRowsCount: 1 },
    { sheet: "Payments", data: templateSheet(TEMPLATES.payments), columns: widths(TEMPLATES.payments), stickyRowsCount: 1 }
  ]).toFile("ar-dashboard-template.xlsx");
}

// ---------------------------------------------------------------------------
// Report workbook: summary, aged debtors and open invoices
// ---------------------------------------------------------------------------

const money = (n: number): Cell => ({ value: Math.round(n * 100) / 100, type: Number, format: "#,##0.00" });
const dateCell = (iso: string | null): Cell => (iso ? { value: new Date(iso + "T00:00:00Z"), type: Date, format: "dd mmm yyyy" } : null);

export async function downloadReportWorkbook(a: Analysis) {
  const cur = a.dataset.currency;
  const t = a.totals;
  const bucketName = (b: string) => (b === "Current" ? "Not yet due" : `${b} days`);

  const summary: SheetData = [
    [{ value: "Accounts receivable report", fontWeight: "bold", fontSize: 14 }],
    ["As of", dateCell(a.dataset.asOf)],
    ["Data", a.dataset.label],
    ["Currency", cur],
    [],
    [header("Measure"), header("Value")],
    ["Total receivables", money(t.balance)],
    ["Overdue", money(t.overdue)],
    ["Overdue % of receivables", { value: t.balance ? t.overdue / t.balance : 0, type: Number, format: "0.0%" }],
    ["Disputed", money(t.disputed)],
    ["DSO (days)", t.dso === null ? "n/a" : Math.round(t.dso)],
    ["Collection effectiveness", t.cei === null ? "n/a" : { value: t.cei / 100, type: Number, format: "0.0%" }],
    [`Collected in ${t.lastMonthLabel}`, money(t.collectedMonth)],
    ["Customers over credit limit", t.overLimit ?? "n/a"],
    ["Customers needing follow-up", t.needingAction],
    ["Open invoices", t.openInvoices],
    [],
    [header("Aging bucket"), header(`Amount (${cur})`), header("% of total")],
    ...BUCKETS.map((b) => [bucketName(b), money(t.byBucket[b]), { value: t.balance ? t.byBucket[b] / t.balance : 0, type: Number, format: "0.0%" } as Cell])
  ];

  const aged: SheetData = [
    [
      "Customer ID", "Customer", "Segment", "Account manager", "Risk rating", "Terms (days)", `Credit limit (${cur})`, `Balance (${cur})`,
      ...BUCKETS.map((b) => `${bucketName(b)} (${cur})`), `Disputed (${cur})`, "Credit used %", "Oldest days past due", "Last payment", "Priority", "Next action"
    ].map(header),
    ...a.customerRows
      .filter((r) => r.balance !== 0 || r.openCount > 0)
      .map((r): Cell[] => [
        r.id, r.name, r.segment, r.manager, r.rating, r.terms, r.creditLimit === null ? null : money(r.creditLimit), money(r.balance),
        ...BUCKETS.map((b) => money(r.buckets[b])), money(r.disputed),
        r.utilisation === null ? null : { value: r.utilisation, type: Number, format: "0%" },
        Math.max(r.oldestDays, 0), dateCell(r.lastPayment), r.priority === "None" ? "Up to date" : r.priority, r.action
      ]),
    [null, { value: "TOTAL", fontWeight: "bold" }, null, null, null, null, null, { ...(money(t.balance) as object), fontWeight: "bold" } as Cell,
      ...BUCKETS.map((b) => ({ ...(money(t.byBucket[b]) as object), fontWeight: "bold" }) as Cell), { ...(money(t.disputed) as object), fontWeight: "bold" } as Cell]
  ];

  const names = new Map(a.dataset.customers.map((c) => [c.id, c.name]));
  const open: SheetData = [
    ["Invoice", "Customer ID", "Customer", "Invoice date", "Due date", "Days past due", "Aging bucket", `Amount (${cur})`, `Outstanding (${cur})`, "Disputed"].map(header),
    ...[...a.openInvoices]
      .sort((x, y) => y.daysPastDue - x.daysPastDue)
      .map((i): Cell[] => [i.no, i.customerId, names.get(i.customerId) ?? "", dateCell(i.date), dateCell(i.due), Math.max(i.daysPastDue, 0), bucketName(i.bucket), money(i.amount), money(i.outstanding), i.disputed ? "Yes" : ""])
  ];

  await writeXlsxFile([
    { sheet: "Summary", data: summary, columns: [{ width: 30 }, { width: 18 }, { width: 12 }] },
    { sheet: "Aged debtors", data: aged, columns: [12, 30, 16, 18, 8, 8, 14, 14, 14, 14, 14, 14, 14, 14, 10, 12, 14, 10, 22].map((width) => ({ width })), stickyRowsCount: 1 },
    { sheet: "Open invoices", data: open, columns: [16, 12, 30, 13, 13, 10, 14, 14, 14, 9].map((width) => ({ width })), stickyRowsCount: 1 }
  ]).toFile(`ar-report-${a.dataset.asOf}.xlsx`);
}
