// Downloadable reports: aged debtors and open invoices as CSV (opens in Excel)

import { BUCKETS, type Analysis } from "./ar";
import { downloadText, toCsv } from "./csv";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function downloadAgedDebtors(a: Analysis) {
  const cur = a.dataset.currency;
  const rows = a.customerRows.filter((r) => r.balance !== 0 || r.openCount > 0);
  const header = [
    "Customer ID",
    "Customer",
    "Segment",
    "Account manager",
    "Risk rating",
    "Terms (days)",
    `Credit limit (${cur})`,
    `Balance (${cur})`,
    ...BUCKETS.map((b) => `${b === "Current" ? "Not yet due" : `${b} days`} (${cur})`),
    `Disputed (${cur})`,
    "Credit used %",
    "Oldest days past due",
    "Last payment",
    "Priority",
    "Next action"
  ];
  const body = rows.map((r) => [
    r.id,
    r.name,
    r.segment,
    r.manager,
    r.rating,
    r.terms ?? "",
    r.creditLimit ?? "",
    r2(r.balance),
    ...BUCKETS.map((b) => r2(r.buckets[b])),
    r2(r.disputed),
    r.utilisation === null ? "" : Math.round(r.utilisation * 100),
    r.oldestDays > 0 ? r.oldestDays : 0,
    r.lastPayment ?? "",
    r.priority === "None" ? "Up to date" : r.priority,
    r.action
  ]);
  const totals = ["", "TOTAL", "", "", "", "", "", r2(a.totals.balance), ...BUCKETS.map((b) => r2(a.totals.byBucket[b])), r2(a.totals.disputed), "", "", "", "", ""];
  downloadText(`aged-debtors-${a.dataset.asOf}.csv`, toCsv([header, ...body, totals]));
}

export function downloadOpenInvoices(a: Analysis) {
  const cur = a.dataset.currency;
  const names = new Map(a.dataset.customers.map((c) => [c.id, c.name]));
  const header = ["Invoice", "Customer ID", "Customer", "Invoice date", "Due date", "Days past due", "Aging bucket", `Amount (${cur})`, `Outstanding (${cur})`, "Disputed"];
  const body = [...a.openInvoices]
    .sort((x, y) => y.daysPastDue - x.daysPastDue)
    .map((i) => [
      i.no,
      i.customerId,
      names.get(i.customerId) ?? "",
      i.date,
      i.due,
      Math.max(i.daysPastDue, 0),
      i.bucket === "Current" ? "Not yet due" : `${i.bucket} days`,
      r2(i.amount),
      r2(i.outstanding),
      i.disputed ? "Yes" : ""
    ]);
  downloadText(`open-invoices-${a.dataset.asOf}.csv`, toCsv([header, ...body]));
}
