// Turns uploaded CSV exports (or the bundled sample) into a clean dataset.
// Column names are matched loosely, so exports from most accounting systems
// work without editing: "Invoice No", "Document Number" and "invoice_no" all match.

import customersCsv from "../../data/customers.csv?raw";
import invoicesCsv from "../../data/invoices.csv?raw";
import paymentsCsv from "../../data/payments.csv?raw";
import { parseCsvObjects } from "./csv";

export type Customer = {
  id: string;
  name: string;
  segment: string;
  country: string;
  terms: number | null;
  creditLimit: number | null;
  rating: string;
  manager: string;
  email: string;
};

export type InvoiceRecord = {
  no: string;
  customerId: string;
  date: string; // ISO yyyy-mm-dd
  due: string;
  service: string;
  amount: number;
  outstanding: number;
  disputed: boolean;
  lastPayment: string | null;
};

export type PaymentRecord = { customerId: string; invoiceNo: string; date: string; amount: number };

export type Dataset = {
  source: "sample" | "upload";
  label: string; // shown in the header
  asOf: string;
  currency: string;
  customers: Customer[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  /** true when payment dates are known, so past month-end balances can be rebuilt */
  hasPaymentHistory: boolean;
  /** true when paid invoices are included, so billing (and DSO) can be measured */
  hasBillingHistory: boolean;
};

export type FileKind = "invoices" | "customers" | "payments" | "unknown";

// ---------------------------------------------------------------------------
// Column matching
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELDS = {
  invoiceNo: ["invoiceno", "invoicenumber", "invoiceid", "invno", "invoice", "documentno", "documentnumber", "docno", "docnumber", "billno", "reference", "ref"],
  customerId: ["customerid", "customerno", "customernumber", "customercode", "custid", "custno", "accountno", "accountnumber", "accountcode", "clientid", "clientcode", "debtorcode", "debtorid"],
  customerName: ["customername", "clientname", "accountname", "debtorname", "name", "customer", "client", "debtor"],
  invoiceDate: ["invoicedate", "documentdate", "docdate", "postingdate", "issuedate", "billdate", "date"],
  dueDate: ["duedate", "paymentduedate", "due"],
  amount: ["amountusd", "invoiceamount", "originalamount", "invoicetotal", "totalamount", "grossamount", "amount", "total", "value"],
  outstanding: ["outstandingusd", "outstanding", "outstandingamount", "balancedue", "openamount", "amountdue", "remainingamount", "balance", "remaining", "open"],
  paid: ["paidusd", "amountpaid", "paidamount", "paid"],
  lastPayment: ["lastpaymentdate", "datepaid", "paiddate", "lastpaid", "paymentdate"],
  status: ["status", "invoicestatus", "state"],
  disputed: ["disputed", "dispute", "indispute"],
  service: ["servicetype", "service", "description", "product", "category", "itemtype"],
  terms: ["paymenttermsdays", "termsdays", "paymentterms", "creditterms", "terms", "creditdays"],
  segment: ["segment", "customertype", "customergroup", "customercategory", "category", "group", "type"],
  country: ["country", "region"],
  creditLimit: ["creditlimitusd", "creditlimit", "limit"],
  rating: ["riskrating", "creditrating", "rating", "risk", "grade"],
  manager: ["accountmanager", "collector", "manager", "salesperson", "owner", "assignedto"],
  email: ["contactemail", "email", "emailaddress"],
  paymentDate: ["paymentdate", "receiptdate", "valuedate", "datereceived", "date"],
  paymentAmount: ["amountusd", "paymentamount", "amountreceived", "receivedamount", "receiptamount", "amount", "received"]
} as const;

type Field = keyof typeof FIELDS;

function findColumn(headers: string[], field: Field, exclude: string[] = []): string | null {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  for (const candidate of FIELDS[field]) {
    const h = byNorm.get(candidate);
    if (h && !exclude.includes(h)) return h;
  }
  return null;
}

export function detectKind(headers: string[]): FileKind {
  const has = (f: Field) => findColumn(headers, f) !== null;
  const hn = headers.map(norm);
  if (has("dueDate") || has("outstanding") || (has("invoiceNo") && has("invoiceDate") && !hn.some((h) => ["paymentdate", "receiptdate", "valuedate"].includes(h)))) return "invoices";
  if (hn.some((h) => ["paymentdate", "receiptdate", "valuedate", "datereceived"].includes(h)) && has("paymentAmount")) return "payments";
  if (has("creditLimit") || ((has("customerId") || has("customerName")) && !has("amount"))) return "customers";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Values: dates and numbers in the formats exports actually use
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

/**
 * Parse a whole column of dates at once, so "03/04/2026" can be resolved as
 * day-first or month-first from the other values in the column (day-first by default).
 */
export function parseDates(values: string[]): (string | null)[] {
  let monthFirst = false;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m && Number(m[2]) > 12) monthFirst = true;
  }
  return values.map((raw) => {
    const v = raw.trim();
    if (!v) return null;
    let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) return monthFirst ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
    const month = (name: string) => MONTHS[name.slice(0, 4).toLowerCase()] ?? MONTHS[name.slice(0, 3).toLowerCase()];
    m = v.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2,4})/); // 12-Jan-2026, 12 January 2026
    if (m && month(m[2])) return iso(+m[3], month(m[2]), +m[1]);
    m = v.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/); // January 12, 2026
    if (m && month(m[1])) return iso(+m[3], month(m[1]), +m[2]);
    if (/^\d{5}(\.\d+)?$/.test(v)) {
      // Excel serial date
      const n = Math.floor(Number(v));
      if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
    }
    return null;
  });
}

/** "$1,234.50" → 1234.5, "(1,234.50)" or "1,234.50-" → −1234.5, "MVR 500" → 500 */
export function parseNumber(raw: string): number | null {
  let v = raw.trim();
  if (!v) return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.endsWith("-")) {
    negative = true;
    v = v.slice(0, -1);
  }
  v = v.replace(/[^0-9.\-]/g, "");
  if (!v || v === "-" || v === ".") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

const addDays = (isoDate: string, days: number) => new Date(Date.parse(isoDate + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportResult =
  | { ok: true; dataset: Dataset; notes: string[] }
  | { ok: false; errors: string[]; notes: string[] };

export type UploadedFile = { name: string; text: string };

export function importFiles(files: UploadedFile[], options: { currency: string; asOf?: string; defaultTerms?: number }): ImportResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const parsed = files.map((f) => ({ ...f, ...parseCsvObjects(f.text) }));
  const byKind = (k: FileKind) => parsed.filter((p) => detectKind(p.headers) === k);

  for (const p of parsed) {
    if (detectKind(p.headers) === "unknown") errors.push(`Couldn't tell what "${p.name}" contains. Check that its first row has column headings, then compare it with the templates.`);
  }
  const invFiles = byKind("invoices");
  if (invFiles.length === 0) {
    errors.push("An invoices file is required: one row per invoice, with customer, invoice date, due date (or terms) and amount.");
    return { ok: false, errors, notes };
  }
  if (invFiles.length > 1 || byKind("customers").length > 1 || byKind("payments").length > 1) {
    errors.push("Upload at most one file of each kind (invoices, customers, payments).");
    return { ok: false, errors, notes };
  }

  // ---- customers (optional) ----
  const customers = new Map<string, Customer>();
  const custFile = byKind("customers")[0];
  if (custFile) {
    const h = custFile.headers;
    const idCol = findColumn(h, "customerId") ?? findColumn(h, "customerName");
    const nameCol = findColumn(h, "customerName", idCol ? [idCol] : []) ?? idCol;
    const col = (f: Field) => findColumn(h, f, [idCol!, nameCol!]);
    const c = { segment: col("segment"), country: col("country"), terms: col("terms"), limit: col("creditLimit"), rating: col("rating"), manager: col("manager"), email: col("email") };
    for (const r of custFile.rows) {
      const id = r[idCol!];
      if (!id) continue;
      customers.set(id, {
        id,
        name: r[nameCol!] || id,
        segment: (c.segment && r[c.segment]) || "",
        country: (c.country && r[c.country]) || "",
        terms: c.terms ? parseNumber(r[c.terms]) : null,
        creditLimit: c.limit ? parseNumber(r[c.limit]) : null,
        rating: ((c.rating && r[c.rating]) || "").toUpperCase(),
        manager: (c.manager && r[c.manager]) || "",
        email: (c.email && r[c.email]) || ""
      });
    }
    notes.push(`${customers.size.toLocaleString()} customers read from "${custFile.name}".`);
  }

  // ---- invoices ----
  const inv = invFiles[0];
  const h = inv.headers;
  const invCol = findColumn(h, "invoiceNo");
  const custIdCol = findColumn(h, "customerId");
  const custNameCol = findColumn(h, "customerName", invCol ? [invCol] : []);
  const custKey = custIdCol ?? custNameCol;
  const dateCol = findColumn(h, "invoiceDate", [findColumn(h, "dueDate") ?? ""]);
  const dueCol = findColumn(h, "dueDate");
  const outCol = findColumn(h, "outstanding");
  const amtCol = findColumn(h, "amount", outCol ? [outCol] : []);
  const paidCol = findColumn(h, "paid");
  const lastPayCol = findColumn(h, "lastPayment", [dateCol ?? "", dueCol ?? ""]);
  const statusCol = findColumn(h, "status");
  const disputedCol = findColumn(h, "disputed");
  const serviceCol = findColumn(h, "service", [custNameCol ?? ""]);
  const termsCol = findColumn(h, "terms");

  const missing = [!custKey && "customer", !dateCol && "invoice date", !amtCol && !outCol && "amount"].filter(Boolean);
  if (missing.length) {
    errors.push(`"${inv.name}" is missing a ${missing.join(", ")} column. Found: ${h.join(", ")}.`);
    return { ok: false, errors, notes };
  }

  const dates = parseDates(inv.rows.map((r) => r[dateCol!]));
  const dues = dueCol ? parseDates(inv.rows.map((r) => r[dueCol])) : [];
  const lastPays = lastPayCol ? parseDates(inv.rows.map((r) => r[lastPayCol])) : [];
  let skipped = 0;
  let dueFromTerms = 0;
  const invoices: InvoiceRecord[] = [];

  inv.rows.forEach((r, i) => {
    const date = dates[i];
    const amount = amtCol ? parseNumber(r[amtCol]) : null;
    const custId = r[custKey!];
    if (!date || !custId || (amount === null && !outCol)) {
      skipped++;
      return;
    }
    if (!customers.has(custId)) {
      customers.set(custId, {
        id: custId,
        name: (custNameCol && r[custNameCol]) || custId,
        segment: "",
        country: "",
        terms: null,
        creditLimit: null,
        rating: "",
        manager: "",
        email: ""
      });
    }
    const cust = customers.get(custId)!;
    if (cust.name === cust.id && custNameCol && r[custNameCol]) cust.name = r[custNameCol];

    let due = dues[i] ?? null;
    if (!due) {
      const terms = (termsCol ? parseNumber(r[termsCol]) : null) ?? cust.terms ?? options.defaultTerms ?? 30;
      due = addDays(date, terms);
      dueFromTerms++;
    }

    const outstandingRaw = outCol ? parseNumber(r[outCol]) : null;
    const paidRaw = paidCol ? parseNumber(r[paidCol]) : null;
    const amt = amount ?? outstandingRaw ?? 0;
    const status = statusCol ? r[statusCol].toLowerCase() : "";
    invoices.push({
      no: (invCol && r[invCol]) || `Row ${i + 2}`,
      customerId: custId,
      date,
      due,
      service: (serviceCol && r[serviceCol]) || "",
      amount: amt,
      // outstanding: explicit column, else amount − paid, else work out from payments below
      outstanding: outstandingRaw ?? (paidRaw !== null ? amt - paidRaw : status.includes("paid") && !status.includes("part") ? 0 : NaN),
      disputed: status.includes("disput") || (disputedCol ? /^(y|yes|true|1)$/i.test(r[disputedCol]) : false),
      lastPayment: lastPays[i] ?? null
    });
  });

  if (skipped) notes.push(`${skipped.toLocaleString()} invoice rows skipped because the customer, date or amount was blank or unreadable.`);
  if (dueFromTerms) notes.push(`Due dates worked out from payment terms for ${dueFromTerms.toLocaleString()} invoices${!termsCol && ![...customers.values()].some((c) => c.terms) ? ` (assumed ${options.defaultTerms ?? 30} days)` : ""}.`);
  if (invoices.length === 0) {
    errors.push(`No usable invoice rows in "${inv.name}".`);
    return { ok: false, errors, notes };
  }

  // ---- payments (optional) ----
  const payments: PaymentRecord[] = [];
  const payFile = byKind("payments")[0];
  if (payFile) {
    const ph = payFile.headers;
    const pDate = findColumn(ph, "paymentDate");
    const pAmt = findColumn(ph, "paymentAmount");
    const pInv = findColumn(ph, "invoiceNo");
    const pCust = findColumn(ph, "customerId") ?? findColumn(ph, "customerName");
    const pDates = parseDates(payFile.rows.map((r) => r[pDate!]));
    const invCustomer = new Map(invoices.map((i) => [i.no, i.customerId]));
    payFile.rows.forEach((r, i) => {
      const amount = parseNumber(r[pAmt!]);
      const invoiceNo = pInv ? r[pInv] : "";
      const customerId = (pCust && r[pCust]) || invCustomer.get(invoiceNo) || "";
      if (!pDates[i] || amount === null || (!invoiceNo && !customerId)) return;
      payments.push({ customerId, invoiceNo, date: pDates[i]!, amount });
    });
    notes.push(`${payments.length.toLocaleString()} payments read from "${payFile.name}".`);
    if (!pInv) notes.push("The payments file has no invoice number column, so the trend charts use invoice-level payment dates instead.");
  }

  // Fill in outstanding amounts that weren't given, using payments if we have them
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) if (p.invoiceNo) paidByInvoice.set(p.invoiceNo, (paidByInvoice.get(p.invoiceNo) ?? 0) + p.amount);
  let assumedOpen = 0;
  for (const i of invoices) {
    if (Number.isNaN(i.outstanding)) {
      if (paidByInvoice.size) i.outstanding = i.amount - (paidByInvoice.get(i.no) ?? 0);
      else {
        i.outstanding = i.amount;
        assumedOpen++;
      }
    }
    if (Math.abs(i.outstanding) < 0.005) i.outstanding = 0;
  }
  if (assumedOpen) notes.push(`No outstanding or paid column was found, so ${assumedOpen.toLocaleString()} invoices are treated as fully unpaid.`);

  // Payment history: real payments linked to invoices, else invoice-level "last paid" dates
  const linked = payments.filter((p) => p.invoiceNo);
  let history: PaymentRecord[] = linked;
  if (!linked.length && invoices.some((i) => i.lastPayment)) {
    history = invoices
      .filter((i) => i.lastPayment && i.amount - i.outstanding > 0)
      .map((i) => ({ customerId: i.customerId, invoiceNo: i.no, date: i.lastPayment!, amount: i.amount - i.outstanding }));
    if (!payFile) notes.push("Trend charts use each invoice's last payment date. Upload a payments file for exact history.");
  }

  const hasBillingHistory = invoices.some((i) => i.outstanding === 0);
  if (!hasBillingHistory)
    notes.push("Every invoice still has a balance, so this looks like an open-items list. Aging and the worklist work fully; DSO and trends need paid invoices too.");

  const latest = [...invoices.map((i) => i.date), ...payments.map((p) => p.date), ...invoices.map((i) => i.lastPayment ?? "")].sort().pop()!;
  // Default report date: today, as exports are normally run on the day (or the latest date in the data, if later)
  const today = new Date().toISOString().slice(0, 10);
  const asOf = options.asOf || (latest > today ? latest : today);

  notes.unshift(`${invoices.length.toLocaleString()} invoices for ${customers.size.toLocaleString()} customers read from "${inv.name}".`);

  return {
    ok: true,
    notes,
    dataset: {
      source: "upload",
      label: files.map((f) => f.name).join(", "),
      asOf,
      currency: options.currency || "USD",
      customers: [...customers.values()],
      invoices,
      payments: history.length ? history : payments,
      hasPaymentHistory: history.length > 0 && hasBillingHistory,
      hasBillingHistory
    }
  };
}

// ---------------------------------------------------------------------------
// Bundled sample data (goes through the same import path as uploads)
// ---------------------------------------------------------------------------

export function sampleDataset(): Dataset {
  const result = importFiles(
    [
      { name: "customers.csv", text: customersCsv },
      { name: "invoices.csv", text: invoicesCsv },
      { name: "payments.csv", text: paymentsCsv }
    ],
    { currency: "USD", asOf: "2026-09-30" }
  );
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return { ...result.dataset, source: "sample", label: "Sample data: Maldives seaplane operator (fictional)" };
}

// Small templates people can download, fill in and upload
export const TEMPLATES: Record<"invoices" | "customers" | "payments", string> = {
  invoices: [
    "invoice_no,customer_id,customer_name,invoice_date,due_date,amount,outstanding,status,service_type",
    "INV-1001,C001,Coral Bay Resort,2026-07-15,2026-08-14,12500.00,0.00,Paid,Transfers",
    "INV-1002,C001,Coral Bay Resort,2026-08-20,2026-09-19,8400.00,8400.00,Open,Transfers",
    "INV-1003,C002,Blue Horizon Travel,2026-09-02,2026-10-17,3150.00,1150.00,Partially Paid,Charter",
    "INV-1004,C003,Island Logistics,2026-06-10,2026-07-10,5000.00,5000.00,Disputed,Cargo"
  ].join("\n"),
  customers: [
    "customer_id,customer_name,segment,country,payment_terms_days,credit_limit,risk_rating,account_manager,contact_email",
    "C001,Coral Bay Resort,Resort,Maldives,30,50000,A,Aisha,accounts@coralbay.example",
    "C002,Blue Horizon Travel,Tour Operator,United Kingdom,45,20000,B,Ibrahim,finance@bluehorizon.example",
    "C003,Island Logistics,Corporate,Maldives,30,10000,C,Aisha,ap@islandlogistics.example"
  ].join("\n"),
  payments: [
    "payment_date,customer_id,invoice_no,amount,method",
    "2026-08-12,C001,INV-1001,12500.00,Bank Transfer",
    "2026-09-25,C002,INV-1003,2000.00,Card"
  ].join("\n")
};
