// Accounts-receivable analytics: aging, DSO, CEI and a collections priority list.
// Everything is computed in the browser from a Dataset (sample or uploaded).

import { createContext, useContext } from "react";
import type { Customer, Dataset, InvoiceRecord } from "./dataset";

export type { Customer, Dataset } from "./dataset";

export const BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;
export type Bucket = (typeof BUCKETS)[number];

export type Invoice = InvoiceRecord & { daysPastDue: number; bucket: Bucket };

export type MonthPoint = {
  month: string; // YYYY-MM
  label: string; // e.g. "Sep 26"
  billed: number;
  collected: number;
  arBalance: number | null;
  dso: number | null;
  cei: number | null;
};

export type Priority = "High" | "Medium" | "Low" | "None";

export type CustomerRow = Customer & {
  balance: number;
  overdue: number;
  over90: number;
  disputed: number;
  buckets: Record<Bucket, number>;
  oldestDays: number;
  utilisation: number | null; // balance / credit limit
  lastPayment: string | null;
  openCount: number;
  score: number;
  priority: Priority;
  action: string;
};

export type Analysis = ReturnType<typeof analyse>;

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(iso + "T00:00:00Z");
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1–30";
  if (daysPastDue <= 60) return "31–60";
  if (daysPastDue <= 90) return "61–90";
  return "90+";
}

function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

const BUCKET_WEIGHT: Record<Bucket, number> = { Current: 0, "1–30": 1, "31–60": 2, "61–90": 3, "90+": 4 };
const RATING_WEIGHT: Record<string, number> = { A: 0.9, B: 1, C: 1.15, D: 1.3 };

export function analyse(ds: Dataset) {
  const asOfTime = toTime(ds.asOf);

  // Invoices raised after the as-of date are ignored
  const invoices: Invoice[] = ds.invoices
    .filter((i) => i.date <= ds.asOf)
    .map((i) => {
      const daysPastDue = Math.round((asOfTime - toTime(i.due)) / DAY);
      return { ...i, daysPastDue, bucket: bucketFor(daysPastDue) };
    });
  const payments = ds.payments.filter((p) => p.date <= ds.asOf);
  const openInvoices = invoices.filter((i) => i.outstanding !== 0);

  const openByCustomer = new Map<string, Invoice[]>();
  for (const i of openInvoices) {
    const list = openByCustomer.get(i.customerId) ?? [];
    list.push(i);
    openByCustomer.set(i.customerId, list);
  }

  // -------------------------------------------------------------------------
  // Month-end series: billing, collections, AR balance, DSO and CEI
  // -------------------------------------------------------------------------
  const asOfMonth = ds.asOf.slice(0, 7);
  const months = [...new Set(invoices.map((i) => i.date.slice(0, 7)))].filter((m) => m <= asOfMonth).sort();
  const billed = new Map<string, number>();
  const collected = new Map<string, number>();
  for (const i of invoices) billed.set(i.date.slice(0, 7), (billed.get(i.date.slice(0, 7)) ?? 0) + i.amount);
  for (const p of payments) collected.set(p.date.slice(0, 7), (collected.get(p.date.slice(0, 7)) ?? 0) + p.amount);

  // Payments per invoice, to work out what was still open (and whether it was due) at any past date
  const paidByInvoice = new Map<string, { date: string; amount: number }[]>();
  for (const p of payments) {
    if (!p.invoiceNo) continue;
    const list = paidByInvoice.get(p.invoiceNo) ?? [];
    list.push(p);
    paidByInvoice.set(p.invoiceNo, list);
  }

  // AR at a date, split into total and the part not yet due
  const arAt = (date: string) => {
    if (date >= ds.asOf) {
      return { total: sum(openInvoices.map((i) => i.outstanding)), current: sum(openInvoices.filter((i) => i.due >= ds.asOf).map((i) => i.outstanding)) };
    }
    let total = 0;
    let current = 0;
    for (const inv of invoices) {
      if (inv.date > date) continue;
      const paid = sum((paidByInvoice.get(inv.no) ?? []).filter((p) => p.date <= date).map((p) => p.amount));
      const open = inv.amount - paid;
      if (Math.abs(open) <= 0.005) continue;
      total += open;
      if (inv.due >= date) current += open;
    }
    return { total, current };
  };

  let prevAr: { total: number; current: number } | null = null;
  const monthly: MonthPoint[] = months.map((month, idx) => {
    const isLast = month === asOfMonth;
    const end = isLast ? ds.asOf : monthEnd(month);
    // Past balances need payment dates; the latest balance is always known
    const ar = ds.hasPaymentHistory || isLast ? arAt(end) : null;
    const b = billed.get(month) ?? 0;

    // DSO, three-month method: AR / billing in the last 3 months × 91 days
    let dso: number | null = null;
    if (ar && ds.hasBillingHistory && idx >= 2) {
      const last3 = sum(months.slice(idx - 2, idx + 1).map((m) => billed.get(m) ?? 0));
      dso = last3 > 0 ? (ar.total / last3) * 91 : null;
    }

    // Collection Effectiveness Index: share of collectible receivables actually collected in the month
    let cei: number | null = null;
    if (prevAr && ar && ds.hasBillingHistory) {
      const collectible = prevAr.total + b - ar.current;
      cei = collectible > 0 ? ((prevAr.total + b - ar.total) / collectible) * 100 : null;
    }
    prevAr = ar;

    return { month, label: monthLabel(month), billed: b, collected: collected.get(month) ?? 0, arBalance: ar?.total ?? null, dso, cei };
  });

  // -------------------------------------------------------------------------
  // Per-customer exposure and collections priority
  // -------------------------------------------------------------------------
  const lastPay = new Map<string, string>();
  for (const p of payments) if ((lastPay.get(p.customerId) ?? "") < p.date) lastPay.set(p.customerId, p.date);
  for (const i of invoices) if (i.lastPayment && i.lastPayment <= ds.asOf && (lastPay.get(i.customerId) ?? "") < i.lastPayment) lastPay.set(i.customerId, i.lastPayment);

  const rows: CustomerRow[] = ds.customers.map((c) => {
    const open = openByCustomer.get(c.id) ?? [];
    const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
    let disputed = 0;
    let oldestDays = 0;
    let weighted = 0;
    for (const i of open) {
      buckets[i.bucket] += i.outstanding;
      if (i.disputed) disputed += i.outstanding;
      if (i.outstanding > 0) oldestDays = Math.max(oldestDays, i.daysPastDue);
      weighted += Math.max(i.outstanding, 0) * BUCKET_WEIGHT[i.bucket];
    }
    const balance = sum(open.map((i) => i.outstanding));
    const overdue = balance - buckets.Current;
    const utilisation = c.creditLimit && c.creditLimit > 0 ? balance / c.creditLimit : null;
    const overLimit = utilisation !== null && utilisation > 1;

    // Score: overdue amounts weighted by age, scaled up for weaker ratings and limit breaches
    const score = weighted * (RATING_WEIGHT[c.rating] ?? 1) * (overLimit ? 1.25 : 1);

    let action = "No action";
    // Recommend the step that deals with the largest problem first
    if (buckets["90+"] > 0 && buckets["90+"] >= disputed) action = "Escalate: 90+ days";
    else if (disputed > 0) action = "Resolve dispute";
    else if (overLimit) action = "Hold credit and call";
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
  const customerRows = rows.sort((a, b) => b.score - a.score || b.balance - a.balance);

  // -------------------------------------------------------------------------
  // Headline numbers and breakdowns
  // -------------------------------------------------------------------------
  const balance = sum(openInvoices.map((i) => i.outstanding));
  const byBucket = Object.fromEntries(BUCKETS.map((b) => [b, sum(openInvoices.filter((i) => i.bucket === b).map((i) => i.outstanding))])) as Record<Bucket, number>;
  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];
  const hasLimits = ds.customers.some((c) => c.creditLimit && c.creditLimit > 0);

  const totals = {
    balance,
    byBucket,
    overdue: balance - byBucket.Current,
    disputed: sum(openInvoices.filter((i) => i.disputed).map((i) => i.outstanding)),
    dso: last?.dso ?? null,
    dsoPrev: prev?.dso ?? null,
    cei: last?.cei ?? null,
    ceiPrev: prev?.cei ?? null,
    lastMonthLabel: last?.label ?? "",
    collectedMonth: last?.collected ?? 0,
    collectedPrev: prev?.collected ?? null,
    overLimit: hasLimits ? customerRows.filter((r) => r.utilisation !== null && r.utilisation > 1).length : null,
    needingAction: customerRows.filter((r) => r.priority !== "None").length,
    customersWithBalance: customerRows.filter((r) => r.balance !== 0).length,
    openInvoices: openInvoices.length
  };

  const segmentNames = [...new Set(ds.customers.map((c) => c.segment).filter(Boolean))];
  const bySegment = segmentNames
    .map((segment) => {
      const segRows = customerRows.filter((r) => r.segment === segment);
      return {
        segment,
        current: sum(segRows.map((r) => r.buckets.Current)),
        overdue: sum(segRows.map((r) => r.overdue)),
        balance: sum(segRows.map((r) => r.balance))
      };
    })
    .filter((s) => s.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  return {
    dataset: ds,
    invoices,
    openInvoices,
    openByCustomer,
    monthly,
    customerRows,
    totals,
    bySegment,
    managers: [...new Set(ds.customers.map((c) => c.manager).filter(Boolean))].sort(),
    segments: bySegment.map((s) => s.segment),
    hasRatings: ds.customers.some((c) => c.rating),
    hasLimits,
    hasServices: invoices.some((i) => i.service),
    hasCollections: payments.length > 0
  };
}

export const AnalysisContext = createContext<Analysis | null>(null);

export function useAnalysis(): Analysis {
  const a = useContext(AnalysisContext);
  if (!a) throw new Error("useAnalysis must be used inside AnalysisContext");
  return a;
}
