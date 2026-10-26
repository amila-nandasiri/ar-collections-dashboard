// Accounts-receivable analytics: aging, DSO, CEI and a collections priority list.
// Everything is computed in the browser from the three CSV files.

import customersCsv from "../../data/customers.csv?raw";
import invoicesCsv from "../../data/invoices.csv?raw";
import paymentsCsv from "../../data/payments.csv?raw";

export const AS_OF = "2026-09-30";

export type Customer = {
  id: string;
  name: string;
  segment: string;
  country: string;
  terms: number;
  creditLimit: number;
  rating: string;
  manager: string;
  email: string;
};

export type Invoice = {
  no: string;
  customerId: string;
  date: string;
  due: string;
  service: string;
  amount: number;
  outstanding: number;
  status: string;
  daysPastDue: number;
  bucket: Bucket;
};

export type Payment = { customerId: string; date: string; amount: number };

export const BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;
export type Bucket = (typeof BUCKETS)[number];

// Minimal CSV parser: the sample files have no quoted fields or embedded commas
function parse(csv: string): Record<string, string>[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(keys.map((k, i) => [k, values[i] ?? ""]));
  });
}

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(iso + "T00:00:00Z");
const asOfTime = toTime(AS_OF);

export function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1–30";
  if (daysPastDue <= 60) return "31–60";
  if (daysPastDue <= 90) return "61–90";
  return "90+";
}

export const customers: Customer[] = parse(customersCsv).map((r) => ({
  id: r.customer_id,
  name: r.customer_name,
  segment: r.segment,
  country: r.country,
  terms: Number(r.payment_terms_days),
  creditLimit: Number(r.credit_limit_usd),
  rating: r.risk_rating,
  manager: r.account_manager,
  email: r.contact_email
}));

export const invoices: Invoice[] = parse(invoicesCsv).map((r) => {
  const daysPastDue = Math.round((asOfTime - toTime(r.due_date)) / DAY);
  return {
    no: r.invoice_no,
    customerId: r.customer_id,
    date: r.invoice_date,
    due: r.due_date,
    service: r.service_type,
    amount: Number(r.amount_usd),
    outstanding: Number(r.outstanding_usd),
    status: r.status,
    daysPastDue,
    bucket: bucketFor(daysPastDue)
  };
});

export const payments: Payment[] = parse(paymentsCsv).map((r) => ({
  customerId: r.customer_id,
  date: r.payment_date,
  amount: Number(r.amount_usd)
}));

export const openInvoices = invoices.filter((i) => i.outstanding > 0);

// ---------------------------------------------------------------------------
// Month-end series: billing, collections, AR balance, DSO and CEI
// ---------------------------------------------------------------------------

export type MonthPoint = {
  month: string; // YYYY-MM
  label: string; // e.g. "Sep 26"
  billed: number;
  collected: number;
  arBalance: number;
  dso: number | null;
  cei: number | null;
};

function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export const monthly: MonthPoint[] = (() => {
  const months = [...new Set(invoices.map((i) => i.date.slice(0, 7)))].sort();
  const billed = new Map<string, number>();
  const collected = new Map<string, number>();
  for (const i of invoices) billed.set(i.date.slice(0, 7), (billed.get(i.date.slice(0, 7)) ?? 0) + i.amount);
  for (const p of payments) collected.set(p.date.slice(0, 7), (collected.get(p.date.slice(0, 7)) ?? 0) + p.amount);

  // Payments per invoice, to work out what was still open (and how overdue) at any past date
  const paidByInvoice = new Map<string, { date: string; amount: number }[]>();
  const pmtRows = parse(paymentsCsv);
  for (const r of pmtRows) {
    const list = paidByInvoice.get(r.invoice_no) ?? [];
    list.push({ date: r.payment_date, amount: Number(r.amount_usd) });
    paidByInvoice.set(r.invoice_no, list);
  }

  // AR at a date, split into total and the part not yet due
  const arAt = (date: string) => {
    let total = 0;
    let current = 0;
    for (const inv of invoices) {
      if (inv.date > date) continue;
      const paid = (paidByInvoice.get(inv.no) ?? []).filter((p) => p.date <= date).reduce((s, p) => s + p.amount, 0);
      const open = inv.amount - paid;
      if (open <= 0.005) continue;
      total += open;
      if (inv.due >= date) current += open;
    }
    return { total, current };
  };

  let prevAr: { total: number; current: number } | null = null;
  return months.map((month, idx) => {
    const end = monthEnd(month);
    const ar = arAt(end);
    const b = billed.get(month) ?? 0;

    // DSO, three-month method: AR / billing in the last 3 months × 91 days
    let dso: number | null = null;
    if (idx >= 2) {
      const last3 = months.slice(idx - 2, idx + 1).reduce((s, m) => s + (billed.get(m) ?? 0), 0);
      dso = last3 > 0 ? (ar.total / last3) * 91 : null;
    }

    // Collection Effectiveness Index: share of collectible receivables actually collected in the month
    let cei: number | null = null;
    if (prevAr) {
      const collectible = prevAr.total + b - ar.current;
      cei = collectible > 0 ? ((prevAr.total + b - ar.total) / collectible) * 100 : null;
    }
    prevAr = ar;

    return { month, label: monthLabel(month), billed: b, collected: collected.get(month) ?? 0, arBalance: ar.total, dso, cei };
  });
})();

// ---------------------------------------------------------------------------
// Per-customer exposure and collections priority
// ---------------------------------------------------------------------------

export type Priority = "High" | "Medium" | "Low" | "None";

export type CustomerRow = Customer & {
  balance: number;
  overdue: number;
  over90: number;
  disputed: number;
  buckets: Record<Bucket, number>;
  oldestDays: number;
  utilisation: number; // balance / credit limit
  lastPayment: string | null;
  openCount: number;
  score: number;
  priority: Priority;
  action: string;
};

const BUCKET_WEIGHT: Record<Bucket, number> = { Current: 0, "1–30": 1, "31–60": 2, "61–90": 3, "90+": 4 };
const RATING_WEIGHT: Record<string, number> = { A: 0.9, B: 1, C: 1.15, D: 1.3 };

export const customerRows: CustomerRow[] = (() => {
  const lastPay = new Map<string, string>();
  for (const p of payments) if ((lastPay.get(p.customerId) ?? "") < p.date) lastPay.set(p.customerId, p.date);

  const rows = customers.map((c) => {
    const open = openInvoices.filter((i) => i.customerId === c.id);
    const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
    let disputed = 0;
    let oldestDays = 0;
    let weighted = 0;
    for (const i of open) {
      buckets[i.bucket] += i.outstanding;
      if (i.status === "Disputed") disputed += i.outstanding;
      oldestDays = Math.max(oldestDays, i.daysPastDue);
      weighted += i.outstanding * BUCKET_WEIGHT[i.bucket];
    }
    const balance = open.reduce((s, i) => s + i.outstanding, 0);
    const overdue = balance - buckets.Current;
    const utilisation = c.creditLimit > 0 ? balance / c.creditLimit : 0;

    // Score: overdue dollars weighted by age, scaled up for weaker ratings and limit breaches
    const score = weighted * (RATING_WEIGHT[c.rating] ?? 1) * (utilisation > 1 ? 1.25 : 1);

    let action = "No action";
    // Recommend the step that deals with the largest problem first
    if (buckets["90+"] > 0 && buckets["90+"] >= disputed) action = "Escalate: 90+ days";
    else if (disputed > 0) action = "Resolve dispute";
    else if (utilisation > 1) action = "Hold credit and call";
    else if (buckets["31–60"] + buckets["61–90"] > 0) action = "Call customer";
    else if (buckets["1–30"] > 0) action = "Send reminder";

    return {
      ...c,
      balance,
      overdue,
      over90: buckets["90+"],
      disputed,
      buckets,
      oldestDays,
      utilisation,
      lastPayment: lastPay.get(c.id) ?? null,
      openCount: open.length,
      score,
      priority: "None" as Priority,
      action
    };
  });

  // Priority tiers by score rank among customers that need action
  const ranked = rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => {
    r.priority = i < ranked.length * 0.2 ? "High" : i < ranked.length * 0.5 ? "Medium" : "Low";
  });
  return rows.sort((a, b) => b.score - a.score || b.balance - a.balance);
})();

// ---------------------------------------------------------------------------
// Headline numbers
// ---------------------------------------------------------------------------

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export const totals = (() => {
  const balance = sum(openInvoices.map((i) => i.outstanding));
  const byBucket = Object.fromEntries(
    BUCKETS.map((b) => [b, sum(openInvoices.filter((i) => i.bucket === b).map((i) => i.outstanding))])
  ) as Record<Bucket, number>;
  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];
  return {
    balance,
    byBucket,
    overdue: balance - byBucket.Current,
    disputed: sum(openInvoices.filter((i) => i.status === "Disputed").map((i) => i.outstanding)),
    dso: last.dso ?? 0,
    dsoPrev: prev.dso ?? 0,
    cei: last.cei ?? 0,
    ceiPrev: prev.cei ?? 0,
    collectedMonth: last.collected,
    collectedPrev: prev.collected,
    overLimit: customerRows.filter((r) => r.utilisation > 1).length,
    needingAction: customerRows.filter((r) => r.priority !== "None").length,
    openInvoices: openInvoices.length
  };
})();

export const bySegment = (() => {
  const segs = [...new Set(customers.map((c) => c.segment))];
  return segs
    .map((segment) => {
      const rows = customerRows.filter((r) => r.segment === segment);
      return {
        segment,
        current: sum(rows.map((r) => r.buckets.Current)),
        overdue: sum(rows.map((r) => r.overdue)),
        balance: sum(rows.map((r) => r.balance))
      };
    })
    .sort((a, b) => b.balance - a.balance);
})();

export const managers = [...new Set(customers.map((c) => c.manager))].sort();
export const segments = bySegment.map((s) => s.segment);
